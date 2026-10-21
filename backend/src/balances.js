const db = require('./db');

// Single source of truth for what a customer owes and whether an invoice is paid.
// Everything is derived from the money actually recorded plus explicit, audited adjustments, so balances can't drift:
//   invoice paid     = payments linked to the invoice, excluding CREDIT-type rows (they mark "on account", not money)
//   invoice settled  = paid + write-offs linked to the invoice
//   invoice status   = PAID / PARTIAL / CREDIT from settled vs the invoice total
//   customer balance = opening balance + everything invoiced to them - every payment they made
//                      (on an invoice, or on account with no invoice)
//                      - write-offs + charges + refunds (balance_adjustments)
// Provisional rows are the balances carried over from the old version at upgrade (see initDb.js); they stand in
// for the owner's credit review and are replaced by it. A provisional write-off never pushes a balance below 0.
// customers.current_balance is kept as a cache of customerBalance(), refreshed after every write.

const toCents = (value) => Math.round((Number(value) || 0) * 100);

const ADJUSTMENT_TYPES = ['WRITE_OFF', 'CHARGE', 'REFUND'];

function invoicePaid(invoiceId) {
  return db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND payment_type != 'CREDIT'`)
    .get(invoiceId).paid;
}

function invoiceWrittenOff(invoiceId) {
  return db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS w FROM balance_adjustments WHERE invoice_id = ? AND type = 'WRITE_OFF'`)
    .get(invoiceId).w;
}

// What the customer still has to pay on this invoice (never negative)
function invoiceRemaining(invoiceId) {
  const inv = db.prepare('SELECT total_amount FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return 0;
  return Math.max(0, toCents(inv.total_amount) - toCents(invoicePaid(invoiceId)) - toCents(invoiceWrittenOff(invoiceId))) / 100;
}

function statusFor(total, paid, writtenOff = 0) {
  const t = toCents(total);
  const p = toCents(paid);
  const settled = p + toCents(writtenOff);
  if (settled >= t) return 'PAID';
  if (settled > 0) return 'PARTIAL';
  return 'CREDIT';
}

function refreshInvoiceStatus(invoiceId) {
  const invoice = db.prepare('SELECT total_amount, payment_status FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const status = statusFor(invoice.total_amount, invoicePaid(invoiceId), invoiceWrittenOff(invoiceId));
  if (status !== invoice.payment_status) {
    db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(status, invoiceId);
  }
  return status;
}

function adjustmentTotals(customerId) {
  const row = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' AND provisional = 0 THEN amount END), 0) AS write_off,
        COALESCE(SUM(CASE WHEN type = 'CHARGE' AND provisional = 0 THEN amount END), 0) AS charge,
        COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount END), 0) AS refund,
        COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' AND provisional = 1 THEN amount END), 0) AS provisional_write_off,
        COALESCE(SUM(CASE WHEN type = 'CHARGE' AND provisional = 1 THEN amount END), 0) AS provisional_charge
      FROM balance_adjustments WHERE customer_id = ?
    `
    )
    .get(customerId);
  return row;
}

function customerBalance(customerId) {
  const row = db
    .prepare(
      `
      SELECT
        COALESCE((SELECT opening_balance FROM customers WHERE id = @id), 0)
        + COALESCE((SELECT SUM(total_amount) FROM invoices WHERE customer_id = @id), 0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices i ON i.id = p.invoice_id
                    WHERE i.customer_id = @id AND p.payment_type != 'CREDIT'), 0)
        - COALESCE((SELECT SUM(amount) FROM payments
                    WHERE invoice_id IS NULL AND customer_id = @id AND payment_type != 'CREDIT'), 0) AS balance
    `
    )
    .get({ id: customerId });
  const a = adjustmentTotals(customerId);
  let cents = toCents(row.balance) - toCents(a.write_off) + toCents(a.charge) + toCents(a.refund) + toCents(a.provisional_charge);
  cents -= Math.min(toCents(a.provisional_write_off), Math.max(0, cents));
  return cents / 100;
}

// Debt that is on no invoice and still unpaid: opening balance + charges, less payments made "on account" (no invoice)
function pastCreditLeft(customerId) {
  const row = db
    .prepare(
      `
      SELECT COALESCE((SELECT opening_balance FROM customers WHERE id = @id), 0)
        + COALESCE((SELECT SUM(amount) FROM balance_adjustments WHERE customer_id = @id AND type = 'CHARGE'), 0)
        - COALESCE((SELECT SUM(amount) FROM payments
                    WHERE invoice_id IS NULL AND customer_id = @id AND payment_type != 'CREDIT'), 0) AS left_over
    `
    )
    .get({ id: customerId });
  return Math.max(0, toCents(row.left_over) / 100);
}

function refreshCustomerBalance(customerId) {
  if (!customerId) return null;
  const balance = customerBalance(customerId);
  db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balance, customerId);
  return balance;
}

// Re-derive every invoice status and customer balance (used at start-up as a safety net)
function refreshAll() {
  let statuses = 0;
  let balances = 0;
  db.transaction(() => {
    const settled = db.prepare(
      `
      SELECT i.id, i.total_amount, i.payment_status,
        COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id AND payment_type != 'CREDIT'), 0) AS paid,
        COALESCE((SELECT SUM(amount) FROM balance_adjustments WHERE invoice_id = i.id AND type = 'WRITE_OFF'), 0) AS written_off
      FROM invoices i
    `
    ).all();
    const setStatus = db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?');
    for (const inv of settled) {
      const status = statusFor(inv.total_amount, inv.paid, inv.written_off);
      if (status !== inv.payment_status) {
        setStatus.run(status, inv.id);
        statuses += 1;
      }
    }
    for (const c of db.prepare('SELECT id, current_balance FROM customers').all()) {
      const balance = customerBalance(c.id);
      if (toCents(balance) !== toCents(c.current_balance)) {
        db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(balance, c.id);
        balances += 1;
      }
    }
  })();
  return { statuses, balances };
}

// Money taken and handed back during one day (session), by payment type.
// A payment belongs to the session that was open when it was taken (payments.session_id). Older rows have no
// session_id and keep their previous attribution: the session of the invoice they were paid against.
function sessionMoney(sessionId) {
  const taken = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN p.payment_type = 'CASH' THEN p.amount END), 0) AS cash,
        COALESCE(SUM(CASE WHEN p.payment_type = 'CARD' THEN p.amount END), 0) AS card,
        COALESCE(SUM(CASE WHEN p.payment_type = 'CREDIT' THEN p.amount END), 0) AS credit,
        COALESCE(SUM(CASE WHEN p.payment_type = 'CASH' AND p.session_id IS NOT NULL AND
          (p.invoice_id IS NULL OR (SELECT session_id FROM invoices WHERE id = p.invoice_id) IS NOT p.session_id)
          THEN p.amount END), 0) AS cash_repayments
      FROM payments p
      WHERE p.session_id = @s
         OR (p.session_id IS NULL AND p.invoice_id IN (SELECT id FROM invoices WHERE session_id = @s))
    `
    )
    .get({ s: sessionId });
  const refunds = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN payment_type = 'CASH' THEN amount END), 0) AS cash_refunds,
        COALESCE(SUM(amount), 0) AS all_refunds
      FROM balance_adjustments WHERE type = 'REFUND' AND session_id = ?
    `
    )
    .get(sessionId);
  return { ...taken, ...refunds };
}

// Records one adjustment (validated by the caller) and refreshes what it affects; returns the new row
function recordAdjustment({ customerId, invoiceId = null, type, amount, reason, paymentType = null, sessionId = null, userId }) {
  const result = db
    .prepare(
      `
      INSERT INTO balance_adjustments (customer_id, invoice_id, type, amount, reason, payment_type, session_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(customerId || null, invoiceId || null, type, toCents(amount) / 100, reason.trim(), paymentType, sessionId, userId);
  if (invoiceId) refreshInvoiceStatus(invoiceId);
  if (customerId) refreshCustomerBalance(customerId);
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, 'BALANCE_ADJUSTMENT', 'CUSTOMER', ?, ?)`
  ).run(userId, customerId || null, JSON.stringify({ adjustment_id: Number(result.lastInsertRowid), type, amount: toCents(amount) / 100, invoice_id: invoiceId || null, reason: reason.trim(), payment_type: paymentType }));
  return db.prepare('SELECT * FROM balance_adjustments WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = {
  toCents,
  ADJUSTMENT_TYPES,
  invoicePaid,
  invoiceWrittenOff,
  invoiceRemaining,
  statusFor,
  refreshInvoiceStatus,
  customerBalance,
  pastCreditLeft,
  refreshCustomerBalance,
  refreshAll,
  recordAdjustment,
  sessionMoney,
};
