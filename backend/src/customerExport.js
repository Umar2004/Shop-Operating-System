const XLSX = require('xlsx');
const db = require('./db');
const { toCents, customerBalance, invoiceRemaining } = require('./balances');

// Credit customer export: one row per customer (what they owe, how old it is) and, optionally, one row per unpaid
// invoice. Every amount comes from the balance rule in balances.js, never from the cached column.

const DAY_MS = 24 * 60 * 60 * 1000;
const r2 = (cents) => Math.round(cents) / 100;
const ageDays = (dateTime, now) => Math.max(0, Math.floor((now - new Date(String(dateTime).replace(' ', 'T'))) / DAY_MS));
const BUCKETS = [
  ['age_0_30', 30],
  ['age_31_60', 60],
  ['age_61_90', 90],
  ['age_over_90', Infinity],
];

function customerFigures(c, now) {
  const sum = (sql, ...p) => db.prepare(sql).get(...p).v || 0;
  const invoiced = sum('SELECT COALESCE(SUM(total_amount), 0) v FROM invoices WHERE customer_id = ?', c.id);
  const paid = sum(
    `SELECT COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = @id AND p.payment_type != 'CREDIT'), 0)
          + COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id IS NULL AND customer_id = @id AND payment_type != 'CREDIT'), 0) v`,
    { id: c.id }
  );
  const adj = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' AND provisional = 0 THEN amount END), 0) AS written_off,
         COALESCE(SUM(CASE WHEN provisional = 1 THEN CASE WHEN type = 'WRITE_OFF' THEN -amount ELSE amount END END), 0) AS carried_over,
         COALESCE(SUM(CASE WHEN type = 'CHARGE' AND provisional = 0 THEN amount END), 0) AS charges,
         COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount END), 0) AS refunds
       FROM balance_adjustments WHERE customer_id = ?`
    )
    .get(c.id);
  const balance = customerBalance(c.id);
  const lastPayment = db
    .prepare(
      `SELECT MAX(p.created_at) v FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
       WHERE p.payment_type != 'CREDIT' AND (i.customer_id = @id OR (p.invoice_id IS NULL AND p.customer_id = @id))`
    )
    .get({ id: c.id }).v;

  // Unpaid invoices, oldest first, with what is left on each
  const unpaid = db
    .prepare('SELECT id, invoice_number, date_time, total_amount FROM invoices WHERE customer_id = ? ORDER BY date_time, id')
    .all(c.id)
    .map((inv) => ({ ...inv, remainingCents: toCents(invoiceRemaining(inv.id)) }))
    .filter((inv) => inv.remainingCents > 0);

  // Ageing: debts are the opening balance/charges (oldest) and each unpaid invoice; anything that lowers the balance
  // without an invoice (a lump-sum write-off, a carried-over amount) is taken off the oldest first, so the buckets add
  // up to the balance
  const debts = [];
  const onAccountCents = Math.max(0, toCents(balance) - unpaid.reduce((t, i) => t + i.remainingCents, 0));
  if (onAccountCents > 0) debts.push({ cents: onAccountCents, age: ageDays(c.created_at, now) });
  for (const inv of unpaid) debts.push({ cents: inv.remainingCents, age: ageDays(inv.date_time, now) });
  let excess = debts.reduce((t, d) => t + d.cents, 0) - Math.max(0, toCents(balance));
  for (const d of debts) {
    if (excess <= 0) break;
    const take = Math.min(excess, d.cents);
    d.cents -= take;
    excess -= take;
  }
  const buckets = Object.fromEntries(BUCKETS.map(([k]) => [k, 0]));
  for (const d of debts) buckets[BUCKETS.find(([, max]) => d.age <= max)[0]] += d.cents;
  const owing = debts.filter((d) => d.cents > 0);

  return {
    summary: {
      customer_id: c.id,
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      active: c.is_active ? 'Yes' : 'No',
      credit_limit: c.credit_limit || 0,
      opening_balance: c.opening_balance || 0,
      invoiced: r2(toCents(invoiced)),
      paid: r2(toCents(paid)),
      written_off: r2(toCents(adj.written_off)),
      charges: r2(toCents(adj.charges)),
      refunds: r2(toCents(adj.refunds)),
      carried_over_pending_review: r2(toCents(adj.carried_over)),
      balance_owed: Math.max(0, balance),
      refund_due: Math.max(0, -balance),
      over_limit: c.credit_limit > 0 && toCents(balance) > toCents(c.credit_limit) ? 'Yes' : 'No',
      unpaid_invoices: unpaid.length,
      oldest_unpaid: unpaid.length ? String(unpaid[0].date_time).slice(0, 10) : '',
      days_overdue: owing.length ? Math.max(...owing.map((d) => d.age)) : 0,
      last_payment: lastPayment ? String(lastPayment).slice(0, 10) : '',
      ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, r2(v)])),
    },
    invoices: unpaid.map((inv) => ({
      customer_id: c.id,
      name: c.name,
      phone: c.phone || '',
      invoice_number: inv.invoice_number,
      date: String(inv.date_time).slice(0, 10),
      total: inv.total_amount,
      paid: r2(toCents(db.prepare("SELECT COALESCE(SUM(amount), 0) v FROM payments WHERE invoice_id = ? AND payment_type != 'CREDIT'").get(inv.id).v)),
      written_off: r2(toCents(db.prepare("SELECT COALESCE(SUM(amount), 0) v FROM balance_adjustments WHERE invoice_id = ? AND type = 'WRITE_OFF'").get(inv.id).v)),
      remaining: r2(inv.remainingCents),
      days_old: ageDays(inv.date_time, now),
    })),
  };
}

const SUMMARY_COLUMNS = [
  ['customer_id', 'Customer ID'], ['name', 'Name'], ['phone', 'Phone'], ['address', 'Address'], ['active', 'Active'],
  ['credit_limit', 'Credit limit'], ['opening_balance', 'Opening balance'], ['invoiced', 'Total invoiced'], ['paid', 'Total paid'],
  ['written_off', 'Written off'], ['charges', 'Charges'], ['refunds', 'Refunds'], ['carried_over_pending_review', 'Carried over (pending review)'],
  ['balance_owed', 'Balance owed'], ['refund_due', 'Refund due'], ['over_limit', 'Over limit'], ['unpaid_invoices', 'Unpaid invoices'],
  ['oldest_unpaid', 'Oldest unpaid'], ['days_overdue', 'Days overdue'], ['last_payment', 'Last payment'],
  ['age_0_30', '0-30 days'], ['age_31_60', '31-60 days'], ['age_61_90', '61-90 days'], ['age_over_90', 'Over 90 days'],
];
const INVOICE_COLUMNS = [
  ['customer_id', 'Customer ID'], ['name', 'Customer'], ['phone', 'Phone'], ['invoice_number', 'Invoice'], ['date', 'Date'],
  ['total', 'Total'], ['paid', 'Paid'], ['written_off', 'Written off'], ['remaining', 'Remaining'], ['days_old', 'Days old'],
];
const TOTALLED = new Set(['invoiced', 'paid', 'written_off', 'charges', 'refunds', 'carried_over_pending_review', 'balance_owed', 'refund_due',
  'unpaid_invoices', 'age_0_30', 'age_31_60', 'age_61_90', 'age_over_90', 'total', 'remaining']);

function buildExport({ scope = 'owing', includeInactive = false, now = new Date() } = {}) {
  const customers = db
    .prepare(`SELECT * FROM customers ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name COLLATE NOCASE, id`)
    .all();
  const summaries = [];
  const invoices = [];
  for (const c of customers) {
    const f = customerFigures(c, now);
    if (scope === 'owing' && !(toCents(f.summary.balance_owed) > 0 || toCents(f.summary.refund_due) > 0)) continue;
    summaries.push(f.summary);
    invoices.push(...f.invoices);
  }
  const reviewPending = (db.prepare("SELECT value FROM settings WHERE key = 'credit.review_pending'").get() || {}).value === 'true';
  return { summaries, invoices, reviewPending };
}

const totalsRow = (rows, columns, label) =>
  Object.fromEntries(
    columns.map(([k], i) => {
      if (i === 1) return [k, label];
      if (!TOTALLED.has(k)) return [k, ''];
      if (k === 'unpaid_invoices') return [k, rows.reduce((t, r) => t + (r[k] || 0), 0)];
      return [k, r2(rows.reduce((t, r) => t + toCents(r[k] || 0), 0))];
    })
  );

// ---- CSV: UTF-8 with BOM (Excel shows Sinhala/Tamil names correctly), 0 stays 0, text that Excel would run as a
// formula (= + - @ at the start) is prefixed with ' so it stays text
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, columns, withTotals) {
  const lines = [columns.map(([, h]) => csvCell(h)).join(',')];
  for (const r of rows) lines.push(columns.map(([k]) => csvCell(r[k])).join(','));
  if (withTotals && rows.length) {
    const t = totalsRow(rows, columns, 'TOTAL');
    lines.push(columns.map(([k]) => csvCell(t[k])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function toXlsx({ summaries, invoices, reviewPending }, { includeInvoices, shopName, exportedBy, now }) {
  const wb = XLSX.utils.book_new();
  const sheet = (rows, columns) => {
    const data = [columns.map(([, h]) => h), ...rows.map((r) => columns.map(([k]) => r[k]))];
    if (rows.length) {
      const t = totalsRow(rows, columns, 'TOTAL');
      data.push(columns.map(([k]) => t[k]));
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = columns.map(([k, h]) => ({ wch: Math.max(h.length, k === 'name' || k === 'address' ? 24 : 10) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: columns.length - 1 } }) };
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, sheet(summaries, SUMMARY_COLUMNS), 'Customers');
  if (includeInvoices) XLSX.utils.book_append_sheet(wb, sheet(invoices, INVOICE_COLUMNS), 'Unpaid invoices');
  const about = [
    ['Shop', shopName || ''],
    ['Exported', now.toLocaleString()],
    ['Exported by', exportedBy || ''],
    ['Customers', summaries.length],
    ['Total owed', r2(summaries.reduce((t, s) => t + toCents(s.balance_owed), 0))],
    ['Refunds due', r2(summaries.reduce((t, s) => t + toCents(s.refund_due), 0))],
    [],
    ['Note', 'Contains customer names, phone numbers and amounts owed: keep it private.'],
  ];
  if (reviewPending) {
    about.push(['Credit review', "Not applied yet: some balances still include amounts carried over from the old version (column 'Carried over (pending review)')."]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(about), 'About');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildExport, toCsv, toXlsx, SUMMARY_COLUMNS, INVOICE_COLUMNS, csvCell };
