const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');
const { toCents, invoicePaid, refreshInvoiceStatus, customerBalance, pastCreditLeft, refreshCustomerBalance } = require('./balances');


const router = express.Router();

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
router.post('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const { name, phone, address, creditLimit = 0, openingBalance = 0 } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
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
    res.status(201).json(customer);
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ message: 'Failed to create customer: ' + err.message });
  }
});

// Update customer
router.put('/:id', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
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
    res.json(updated);
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ message: 'Failed to update customer: ' + err.message });
  }
});

// Deactivate customer
router.delete('/:id', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deactivating customer:', err);
    res.status(500).json({ message: 'Failed to deactivate customer' });
  }
});

// Get customer invoices
router.get('/:id/invoices', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const id = Number(req.params.id);
    const invoices = db
      .prepare(
        `
        SELECT 
          i.*, 
          s.business_date,
          COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = i.id), 0) as paid_amount,
          (i.total_amount - COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = i.id), 0)) as balance_amount
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
router.get('/:id/payments', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
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

// Record credit payment
router.post('/:id/pay-credit', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
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

  const tx = db.transaction(() => {
    // Work in cents so the allocation adds up exactly
    let remainingCents = toCents(amount);
    const invoiceOwedCents = (invId) => {
      const inv = db.prepare('SELECT total_amount FROM invoices WHERE id = ?').get(invId);
      return Math.max(0, toCents(inv.total_amount) - toCents(invoicePaid(invId)));
    };
    const pay = (invId, cents, note) => {
      if (cents <= 0) return;
      db.prepare(
        `
        INSERT INTO payments (customer_id, invoice_id, payment_type, amount, note)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(customerId, invId, paymentType, cents / 100, note);
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

    refreshCustomerBalance(customerId);
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


