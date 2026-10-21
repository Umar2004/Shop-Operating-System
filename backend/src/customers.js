const express = require('express');
const db = require('./db');
const { requireRole, requirePermission } = require('./auth');
const { logActivity, changedFields } = require('./activityLog');
const {
  toCents,
  ADJUSTMENT_TYPES,
  invoiceRemaining,
  refreshInvoiceStatus,
  customerBalance,
  pastCreditLeft,
  refreshCustomerBalance,
  recordAdjustment,
} = require('./balances');


const router = express.Router();

// Download the credit customer list (Excel or CSV). Contains names, phones and debts: admin and manager only, logged.
//   ?scope=owing|all  &format=xlsx|csv  &detail=customers|invoices (CSV: which list; Excel: invoices adds a sheet)
//   &inactive=1 to include deactivated customers
router.get('/export', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { buildExport, toCsv, toXlsx, SUMMARY_COLUMNS, INVOICE_COLUMNS } = require('./customerExport');
    const scope = req.query.scope === 'all' ? 'all' : 'owing';
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const detail = req.query.detail === 'invoices' ? 'invoices' : 'customers';
    const now = new Date();
    const data = buildExport({ scope, includeInactive: req.query.inactive === '1', now });
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const base = `${scope === 'all' ? 'customers' : 'credit-customers'}-${stamp}`;
    let body;
    let filename;
    if (format === 'csv') {
      body = detail === 'invoices' ? toCsv(data.invoices, INVOICE_COLUMNS, true) : toCsv(data.summaries, SUMMARY_COLUMNS, true);
      filename = `${base}${detail === 'invoices' ? '-unpaid-invoices' : ''}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    } else {
      const shop = db.prepare("SELECT value FROM settings WHERE key = 'shop.name'").get();
      body = toXlsx(data, { includeInvoices: detail === 'invoices', shopName: shop ? shop.value : '', exportedBy: req.user.username, now });
      filename = `${base}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    logActivity({
      userId: req.user.id,
      action: 'CUSTOMER_EXPORT',
      entityType: 'CUSTOMER',
      details: { file: filename, scope, format, detail, customers: data.summaries.length, invoices: detail === 'invoices' ? data.invoices.length : undefined },
    });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Rows', String(data.summaries.length));
    res.send(body);
  } catch (err) {
    console.error('Error exporting customers:', err);
    res.status(500).json({ message: `Failed to export customers: ${err.message}` });
  }
});

// Get all customers (with optional search)
router.get('/', (req, res) => {
  try {
    const { q } = req.query;
    if (q) {
      const rows = db
        .prepare(
          `
          SELECT 
            id, name, phone, address, credit_limit, opening_balance,
            MAX(0, COALESCE(current_balance, 0)) as current_balance,
            MAX(0, -COALESCE(current_balance, 0)) as refund_due,
            is_active
          FROM customers
          WHERE name LIKE ? OR phone LIKE ?
          ORDER BY name
        `
        )
        .all(`%${q}%`, `%${q}%`);
      return res.json(rows);
    }
    const rows = db
      .prepare(
        `
        SELECT 
          id, name, phone, address, credit_limit, opening_balance,
          MAX(0, COALESCE(current_balance, 0)) as current_balance,
          MAX(0, -COALESCE(current_balance, 0)) as refund_due,
          is_active
        FROM customers
        ORDER BY name
      `
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
});

// Create customer
router.post('/', requirePermission('customers', 'sell'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const { name, phone, address, creditLimit = 0, openingBalance = 0 } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!Number.isFinite(Number(openingBalance)) || Number(openingBalance) < 0) {
      return res.status(400).json({ message: 'Opening balance must be zero or more' });
    }

    const result = db
      .prepare(
        `
        INSERT INTO customers (name, phone, address, credit_limit, opening_balance, current_balance, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `
      )
      .run(name, phone || null, address || null, creditLimit, openingBalance, openingBalance);

    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(result.lastInsertRowid);
    logActivity({ userId: req.user.id, action: 'CUSTOMER_CREATED', entityType: 'CUSTOMER', entityId: customer.id,
      after: { name: customer.name, phone: customer.phone, credit_limit: customer.credit_limit, opening_balance: customer.opening_balance } });
    res.status(201).json(customer);
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ message: 'Failed to create customer: ' + err.message });
  }
});

// Update customer
router.put('/:id', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const {
      name = existing.name,
      phone = existing.phone,
      address = existing.address,
      creditLimit = existing.credit_limit,
      openingBalance = existing.opening_balance || 0,
      isActive = !!existing.is_active,
    } = req.body;

    if (!Number.isFinite(Number(openingBalance)) || Number(openingBalance) < 0) {
      return res.status(400).json({ message: 'Opening balance must be zero or more' });
    }
    // Lowering the opening balance below what has already been paid would leave the shop owing the customer
    // money nobody handed back; overpayments are refunded, never held as credit
    const balanceAfterEdit = customerBalance(id) + (toCents(openingBalance) - toCents(existing.opening_balance)) / 100;
    if (toCents(balanceAfterEdit) < 0 && toCents(openingBalance) < toCents(existing.opening_balance)) {
      return res.status(400).json({
        code: 'OPENING_BELOW_PAID',
        message: `The customer has already paid more than this opening balance leaves them owing (they would be owed ${(-balanceAfterEdit).toFixed(2)}). Record a refund instead.`,
      });
    }

    // Transaction to ensure atomicity
    const tx = db.transaction(() => {
      db.prepare(
        `
        UPDATE customers
        SET name = ?, phone = ?, address = ?, credit_limit = ?, opening_balance = ?, is_active = ?
        WHERE id = ?
      `
      ).run(name, phone, address, creditLimit, openingBalance, isActive ? 1 : 0, id);
      // The balance follows from the opening balance, invoices and payments
      refreshCustomerBalance(id);

      return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    });

    const updated = tx();
    const change = changedFields(existing, updated, ['name', 'phone', 'address', 'credit_limit', 'opening_balance', 'is_active']);
    if (change) {
      logActivity({ userId: req.user.id, action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: id, details: { name: updated.name }, ...change });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ message: 'Failed to update customer: ' + err.message });
  }
});

// Deactivate customer
router.delete('/:id', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);
    logActivity({ userId: req.user.id, action: 'CUSTOMER_DEACTIVATED', entityType: 'CUSTOMER', entityId: id, details: { name: existing.name } });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deactivating customer:', err);
    res.status(500).json({ message: 'Failed to deactivate customer' });
  }
});

// Get customer invoices
router.get('/:id/invoices', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoices = db
      .prepare(
        `
        SELECT 
          i.*, 
          s.business_date,
          COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = i.id), 0) as paid_amount,
          COALESCE((SELECT SUM(amount) FROM balance_adjustments WHERE invoice_id = i.id AND type = 'WRITE_OFF'), 0) as written_off,
          MAX(0, i.total_amount
            - COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = i.id), 0)
            - COALESCE((SELECT SUM(amount) FROM balance_adjustments WHERE invoice_id = i.id AND type = 'WRITE_OFF'), 0)) as balance_amount
        FROM invoices i
        LEFT JOIN sessions s ON s.id = i.session_id
        WHERE i.customer_id = ?
        ORDER BY i.date_time DESC
      `
      )
      .all(id);
    res.json(invoices);
  } catch (err) {
    console.error('Error fetching customer invoices:', err);
    res.status(500).json({ message: 'Failed to fetch customer invoices' });
  }
});

// Get customer payments
router.get('/:id/payments', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const payments = db
      .prepare(
        `
        SELECT p.*, i.invoice_number, i.date_time as invoice_date
        FROM payments p
        LEFT JOIN invoices i ON i.id = p.invoice_id
        WHERE p.customer_id = ?
        ORDER BY p.created_at DESC
      `
      )
      .all(id);
    res.json(payments);
  } catch (err) {
    console.error('Error fetching customer payments:', err);
    res.status(500).json({ message: 'Failed to fetch customer payments' });
  }
});

// Balance adjustments: write-offs, charges and refunds (newest first)
router.get('/:id/adjustments', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = db
      .prepare(
        `
        SELECT a.*, u.username AS created_by_name, i.invoice_number
        FROM balance_adjustments a
        LEFT JOIN users u ON u.id = a.created_by
        LEFT JOIN invoices i ON i.id = a.invoice_id
        WHERE a.customer_id = ?
        ORDER BY a.id DESC
      `
      )
      .all(id);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching adjustments:', err);
    res.status(500).json({ message: 'Failed to fetch adjustments' });
  }
});

// Record a write-off (forgiven debt), a charge (debt on no invoice) or a refund (overpayment handed back)
router.post('/:id/adjustments', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const customerId = Number(req.params.id);
  const { type, amount, reason, invoiceId = null, paymentType = 'CASH' } = req.body || {};

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }
  if (!ADJUSTMENT_TYPES.includes(type)) {
    return res.status(400).json({ message: 'Type must be WRITE_OFF, CHARGE or REFUND' });
  }
  const cents = toCents(amount);
  if (!Number.isFinite(Number(amount)) || cents <= 0 || Math.abs(Number(amount) * 100 - cents) > 1e-6) {
    return res.status(400).json({ message: 'Amount must be more than zero, with at most 2 decimals' });
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ message: 'A reason is required' });
  }

  const owed = customerBalance(customerId);
  let sessionId = null;
  let refundPaymentType = null;
  if (type === 'WRITE_OFF') {
    if (invoiceId) {
      const invoice = db.prepare('SELECT id, customer_id, invoice_number FROM invoices WHERE id = ?').get(invoiceId);
      if (!invoice || invoice.customer_id !== customerId) {
        return res.status(400).json({ message: 'Invalid invoice' });
      }
      const remaining = invoiceRemaining(invoice.id);
      if (cents > toCents(remaining)) {
        return res.status(400).json({ message: `Write-off (${(cents / 100).toFixed(2)}) is more than what is left on ${invoice.invoice_number} (${remaining.toFixed(2)})` });
      }
    }
    if (cents > toCents(owed)) {
      return res.status(400).json({ message: `Write-off (${(cents / 100).toFixed(2)}) is more than the customer owes (${Math.max(0, owed).toFixed(2)})` });
    }
  } else if (type === 'REFUND') {
    if (invoiceId) {
      return res.status(400).json({ message: 'A refund is for the customer, not for one invoice' });
    }
    const due = Math.max(0, -owed);
    if (cents > toCents(due)) {
      return res.status(400).json({ message: `Refund (${(cents / 100).toFixed(2)}) is more than the shop owes this customer (${due.toFixed(2)})` });
    }
    if (!['CASH', 'CARD'].includes(paymentType)) {
      return res.status(400).json({ message: 'Refund method must be CASH or CARD' });
    }
    refundPaymentType = paymentType;
    if (paymentType === 'CASH') {
      // Cash leaves the drawer, so it belongs to the open day
      const session = db.prepare("SELECT id FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get();
      if (!session) {
        return res.status(400).json({ message: 'Open the day first: a cash refund is taken from the drawer' });
      }
      sessionId = session.id;
    }
  } else if (invoiceId) {
    return res.status(400).json({ message: 'A charge is for the customer, not for one invoice' });
  }

  try {
    const adjustment = db.transaction(() =>
      recordAdjustment({
        customerId,
        invoiceId: type === 'WRITE_OFF' ? invoiceId : null,
        type,
        amount: cents / 100,
        reason,
        paymentType: refundPaymentType,
        sessionId,
        userId: req.user.id,
      })
    )();
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    res.status(201).json({ adjustment, customer: updated });
  } catch (err) {
    console.error('Error recording adjustment:', err);
    res.status(400).json({ message: err.message });
  }
});

// Record credit payment
router.post('/:id/pay-credit', requirePermission('customers'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const customerId = Number(req.params.id);
  const { amount, paymentType = 'CASH', invoiceId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Amount must be greater than zero' });
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  // Check against what the customer really owes (the stored figure may have drifted before this fix)
  const owed = customerBalance(customerId);
  if (toCents(amount) > toCents(owed)) {
    return res.status(400).json({
      message: `Payment amount (${Number(amount).toFixed(2)}) exceeds the balance owed (${owed.toFixed(2)})`,
    });
  }

  // The money goes into today's drawer, whichever day the invoice it pays off was raised
  const openSession = db.prepare("SELECT id FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get();

  const tx = db.transaction(() => {
    // Work in cents so the allocation adds up exactly
    let remainingCents = toCents(amount);
    const invoiceOwedCents = (invId) => toCents(invoiceRemaining(invId));
    const pay = (invId, cents, note) => {
      if (cents <= 0) return;
      db.prepare(
        `
        INSERT INTO payments (customer_id, invoice_id, payment_type, amount, note, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(customerId, invId, paymentType, cents / 100, note, openSession ? openSession.id : null);
      if (invId) refreshInvoiceStatus(invId);
      remainingCents -= cents;
    };

    if (invoiceId === 'PAST_CREDIT') {
      pay(null, Math.min(remainingCents, toCents(pastCreditLeft(customerId))), 'Payment for Past Credit');
    } else if (invoiceId) {
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      if (!invoice || invoice.customer_id !== customerId) {
        throw new Error('Invalid invoice');
      }
      pay(invoice.id, Math.min(remainingCents, invoiceOwedCents(invoice.id)), null);
    }

    // Anything left: remaining opening balance first, then the oldest invoices that still owe money
    // (judged by money received, not by the status flag)
    if (remainingCents > 0) {
      pay(null, Math.min(remainingCents, toCents(pastCreditLeft(customerId))), 'Payment for Past Credit (FIFO)');
    }
    if (remainingCents > 0) {
      const invoiceList = db
        .prepare('SELECT id FROM invoices WHERE customer_id = ? ORDER BY date_time ASC, id ASC')
        .all(customerId);
      for (const inv of invoiceList) {
        if (remainingCents <= 0) break;
        pay(inv.id, Math.min(remainingCents, invoiceOwedCents(inv.id)), 'Overpayment Distribution (FIFO)');
      }
    }
    // Possible only when earlier payments on account already exceeded the opening balance
    if (remainingCents > 0) {
      pay(null, remainingCents, 'Payment on account');
    }

    const balanceAfter = refreshCustomerBalance(customerId);
    logActivity({ userId: req.user.id, action: 'CREDIT_PAYMENT_RECEIVED', entityType: 'CUSTOMER', entityId: customerId,
      details: { name: customer.name, amount: toCents(amount) / 100, payment_type: paymentType, applied_to: invoiceId || 'oldest first' },
      before: { balance: owed }, after: { balance: balanceAfter } });
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  });

  try {
    const updated = tx();

    res.json({ success: true, customer: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = {
  customersRouter: router,
};


