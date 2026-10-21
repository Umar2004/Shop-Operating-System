const db = require('./db');

// Single source of truth for what a customer owes and whether an invoice is paid.
// Everything is derived from the money actually recorded, so balances can't drift:
//   invoice paid     = payments linked to the invoice, excluding CREDIT-type rows (they mark "on account", not money)
//   invoice status   = PAID / PARTIAL / CREDIT from that paid amount vs the invoice total
//   customer balance = opening balance + everything invoiced to them - every payment they made
//                      (on an invoice, or on account with no invoice)
// customers.current_balance is kept as a cache of customerBalance(), refreshed after every write.

const toCents = (value) => Math.round((Number(value) || 0) * 100);

function invoicePaid(invoiceId) {
  return db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ? AND payment_type != 'CREDIT'`)
    .get(invoiceId).paid;
}

function statusFor(total, paid) {
  const t = toCents(total);
  const p = toCents(paid);
  if (p >= t) return 'PAID';
  if (p > 0) return 'PARTIAL';
  return 'CREDIT';
}

function refreshInvoiceStatus(invoiceId) {
  const invoice = db.prepare('SELECT total_amount, payment_status FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const status = statusFor(invoice.total_amount, invoicePaid(invoiceId));
  if (status !== invoice.payment_status) {
    db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(status, invoiceId);
  }
  return status;
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
  return toCents(row.balance) / 100;
}

// What is left of the opening balance after payments made "on account" (no invoice)
function pastCreditLeft(customerId) {
  const row = db
    .prepare(
      `
      SELECT COALESCE((SELECT opening_balance FROM customers WHERE id = @id), 0)
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

module.exports = {
  toCents,
  invoicePaid,
  statusFor,
  refreshInvoiceStatus,
  customerBalance,
  pastCreditLeft,
  refreshCustomerBalance,
};
