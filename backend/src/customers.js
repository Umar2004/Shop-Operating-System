const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');


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

    // Calculate difference if opening balance changed
    const oldOpeningBalance = existing.opening_balance || 0;
    const diff = openingBalance - oldOpeningBalance;

    // Transaction to ensure atomicity
    const tx = db.transaction(() => {
      db.prepare(
        `
        UPDATE customers
        SET name = ?, phone = ?, address = ?, credit_limit = ?, opening_balance = ?, current_balance = current_balance + ?, is_active = ?
        WHERE id = ?
      `
      ).run(name, phone, address, creditLimit, openingBalance, diff, isActive ? 1 : 0, id);

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

  if (amount > customer.current_balance) {
    return res.status(400).json({
      message: `Payment amount (${amount}) exceeds customer balance (${customer.current_balance})`,
    });
  }

  const tx = db.transaction(() => {
    let remainingPayment = amount;

    // Helper to apply payment to accurate status
    const updateInvoicePayment = (invId, payAmt, note = null) => {
      // Insert payment record
      db.prepare(
        `
        INSERT INTO payments (customer_id, invoice_id, payment_type, amount, note)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(customerId, invId, paymentType, payAmt, note);

      if (invId) {
        // Get updated total paid for this invoice
        const payments = db
          .prepare('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = ?')
          .get(invId);
        const invoice = db.prepare('SELECT total_amount FROM invoices WHERE id = ?').get(invId);

        // Update status
        let newStatus = 'CREDIT';
        if (payments.total_paid >= invoice.total_amount) {
          newStatus = 'PAID';
        } else if (payments.total_paid > 0) {
          newStatus = 'PARTIAL';
        }

        db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(newStatus, invId);
      }
    };

    if (invoiceId === 'PAST_CREDIT') {
      // Direct payment to opening balance
      const totalUnpaidInvoices = db.prepare(`
        SELECT COALESCE(SUM(total_amount - paid), 0) as total
        FROM (
          SELECT total_amount, COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = invoices.id), 0) as paid
          FROM invoices WHERE customer_id = ? AND payment_status != 'PAID'
        )
      `).get(customerId).total;
      const currentBalance = db.prepare('SELECT current_balance FROM customers WHERE id = ?').get(customerId).current_balance;
      const pastCreditBalance = Math.max(0, currentBalance - totalUnpaidInvoices);

      const amtToApply = Math.min(amount, pastCreditBalance);
      updateInvoicePayment(null, amtToApply, 'Payment for Past Credit');
      remainingPayment -= amtToApply;
      // Fall through to FIFO for any remainder after settling past credit
    } else if (invoiceId) {
      // Specific invoice payment
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      if (!invoice || invoice.customer_id !== customerId) {
        throw new Error('Invalid invoice');
      }
      
      const paidAlready = db.prepare('SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = ?').get(invoiceId).total_paid;
      const balance = invoice.total_amount - paidAlready;
      
      const amtToApply = Math.min(amount, balance);
      updateInvoicePayment(invoiceId, amtToApply, amount > balance ? `Full payment for ${invoice.invoice_number}` : null);
      remainingPayment -= amtToApply;
      // Fall through to FIFO for any remainder after settling this specific invoice
    }

    // Now handle the remaining payment (General Payment / Overflow)
    if (remainingPayment > 0) {
      // 1. Calculate how much of current_balance is actually "Past Credit"
      const customer = db.prepare('SELECT current_balance FROM customers WHERE id = ?').get(customerId);
      const unpaidInvoices = db.prepare("SELECT id, total_amount, payment_status FROM invoices WHERE customer_id = ? AND payment_status != 'PAID'").all(customerId);
      
      let totalUnpaidInvoiceAmt = 0;
      for (const inv of unpaidInvoices) {
        const paid = db.prepare("SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid FROM payments WHERE invoice_id = ?").get(inv.id).total_paid;
        totalUnpaidInvoiceAmt += (inv.total_amount - paid);
      }

      const pastCreditBalance = Math.max(0, customer.current_balance - totalUnpaidInvoiceAmt);
      
      // 2. Pay Past Credit First (if not already paid above)
      if (pastCreditBalance > 0) {
        const amtToPastCredit = Math.min(remainingPayment, pastCreditBalance);
        updateInvoicePayment(null, amtToPastCredit, 'Payment for Past Credit (FIFO)');
        remainingPayment -= amtToPastCredit;
      }

      // 3. Pay Invoices (Oldest First)
      if (remainingPayment > 0) {
        const invoiceList = db
          .prepare(
            `
          SELECT 
            id, total_amount,
            COALESCE((SELECT SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END) FROM payments WHERE invoice_id = invoices.id), 0) as paid_amount
          FROM invoices
          WHERE customer_id = ? AND payment_status != 'PAID'
          ORDER BY date_time ASC
        `
          )
          .all(customerId);

        for (const inv of invoiceList) {
          if (remainingPayment <= 0) break;

          const balance = inv.total_amount - inv.paid_amount;
          if (balance <= 0) continue;

          const amountToApply = Math.min(remainingPayment, balance);
          updateInvoicePayment(inv.id, amountToApply, 'Overpayment Distribution (FIFO)');
          remainingPayment -= amountToApply;
        }
      }
    }

    // Finally, update customer balance (total credit owed)
    db.prepare(
      `
      UPDATE customers
      SET current_balance = MAX(0, current_balance - ?)
      WHERE id = ?
    `
    ).run(amount, customerId);

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


