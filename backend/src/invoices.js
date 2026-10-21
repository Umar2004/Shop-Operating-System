const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');

const router = express.Router();

function getOpenSession() {
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
    .get();
}

// Create invoice (billing)
router.post('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const userId = req.user.id;
  const { customerId, items, payments, discount = 0, additionalAmount = 0 } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one item is required' });
  }

  const session = getOpenSession();
  if (!session) {
    return res.status(400).json({ message: 'No open session. Start day first.' });
  }

  const tx = db.transaction(() => {
    // Calculate totals and validate stock
    let totalAmount = 0;
    let totalCost = 0;

    const detailedItems = items.map((item) => {
      const product = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      if (product.current_stock < item.quantity) {
        throw new Error(`Insufficient stock for product: ${product.name}`);
      }
      const unitPrice = item.unitPrice ?? product.selling_price;

      // Calculate item discount
      let itemDiscount = 0;
      const discountVal = Number(item.discount) || 0;
      if (item.discountType === 'percentage') {
        itemDiscount = (unitPrice * item.quantity * discountVal) / 100;
      } else {
        itemDiscount = discountVal;
      }

      const lineTotal = (unitPrice * item.quantity) - itemDiscount;
      totalAmount += lineTotal;
      totalCost += product.cost_price * item.quantity;
      return {
        product,
        quantity: item.quantity,
        unitPrice,
        discount: item.discount || 0,
        discountType: item.discountType || 'amount',
        lineTotal,
      };
    });

    const finalTotal = totalAmount - discount + (Number(additionalAmount) || 0);
    if (finalTotal < 0) {
      throw new Error('Discount cannot exceed total amount');
    }

    const allPaymentsSum = Array.isArray(payments)
      ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      : 0;
    const actualPaid = Array.isArray(payments)
      ? payments.filter(p => p.type !== 'CREDIT').reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      : 0;
    const remaining = finalTotal - allPaymentsSum;

    // Check if any payment method is CREDIT
    const hasCreditPayment = Array.isArray(payments)
      ? payments.some((p) => p.type === 'CREDIT' && p.amount > 0)
      : false;

    // Check credit limit if customer exists and there's remaining balance or credit payment
    if (customerId && (remaining > 0 || hasCreditPayment)) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (customer) {
        const balanceToAdd = hasCreditPayment ? finalTotal : remaining;
        const newBalance = customer.current_balance + balanceToAdd;
        if (customer.credit_limit > 0 && newBalance > customer.credit_limit) {
          const totalToPay = newBalance - customer.credit_limit;
          throw new Error(
            `Credit limit exceeded. Current balance: ${customer.current_balance.toFixed(2)}, Credit limit: ${customer.credit_limit.toFixed(2)}. Total amount to pay: ${totalToPay.toFixed(2)}`
          );
        }
      }
    }

    // Determine payment status
    let paymentStatus = 'PAID';
    if (hasCreditPayment) {
      // If any payment method is CREDIT, invoice status is CREDIT
      paymentStatus = 'CREDIT';
    } else if (remaining > 0 && totalPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else if (remaining > 0 && totalPaid === 0) {
      paymentStatus = 'CREDIT';
    }

    // Generate invoice number (simple incremental sequence)
    const lastInvoice = db
      .prepare('SELECT id, invoice_number FROM invoices ORDER BY id DESC LIMIT 1')
      .get();
    let nextNumber = 1;
    if (lastInvoice && lastInvoice.invoice_number) {
      const match = /INV-(\d+)/.exec(lastInvoice.invoice_number);
      if (match) {
        nextNumber = Number(match[1]) + 1;
      }
    }
    const invoiceNumber = `INV-${String(nextNumber).padStart(6, '0')}`;

    // Get current local datetime in SQLite format (YYYY-MM-DD HH:MM:SS)
    const now = new Date();
    const localDateTime = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');

    const invoiceResult = db
      .prepare(
        `
        INSERT INTO invoices
        (invoice_number, customer_id, session_id, date_time, total_amount, total_cost, discount, additional_amount, payment_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        invoiceNumber,
        customerId || null,
        session.id,
        localDateTime,
        finalTotal,
        totalCost,
        discount,
        Number(additionalAmount) || 0,
        paymentStatus,
        userId
      );

    const invoiceId = invoiceResult.lastInsertRowid;

    const insertItem = db.prepare(
      `
      INSERT INTO invoice_items
      (invoice_id, product_id, quantity, unit_price, cost_price, discount, discount_type, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    const updateStock = db.prepare(
      `
      UPDATE products SET current_stock = current_stock - ? WHERE id = ?
    `
    );
    const insertStockMovement = db.prepare(
      `
      INSERT INTO stock_movements
      (product_id, type, quantity_change, reason, reference_type, reference_id)
      VALUES (?, 'SALE', ?, 'Sale', 'INVOICE', ?)
    `
    );

    detailedItems.forEach(({ product, quantity, unitPrice, discount, discountType, lineTotal }) => {
      insertItem.run(
        invoiceId,
        product.id,
        quantity,
        unitPrice,
        product.cost_price,
        discount,
        discountType,
        lineTotal
      );
      updateStock.run(quantity, product.id);
      insertStockMovement.run(product.id, -quantity, invoiceId);
    });

    if (Array.isArray(payments) && payments.length > 0) {
      const insertPayment = db.prepare(
        `
        INSERT INTO payments
        (invoice_id, payment_type, amount)
        VALUES (?, ?, ?)
      `
      );
      payments.forEach((p) => {
        insertPayment.run(invoiceId, p.type, p.amount);
      });
    }

    // Update customer balance for CREDIT or PARTIAL invoices
    if (customerId && (paymentStatus === 'CREDIT' || paymentStatus === 'PARTIAL')) {
      // Logic from user: balanceToAdd = total_amount - actualPaid
      // actualPaid excludes 'CREDIT' type tagging.
      const balanceToAdd = finalTotal - actualPaid;
      if (balanceToAdd > 0) {
        db.prepare(
          `
          UPDATE customers
          SET current_balance = current_balance + ?
          WHERE id = ?
        `
        ).run(balanceToAdd, customerId);
      }
    }

    const invoice = db
      .prepare(
        `
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ?
      `
      )
      .get(invoiceId);

    const invoiceItems = db
      .prepare(
        `
        SELECT ii.*, p.name as product_name
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
      `
      )
      .all(invoiceId);

    return { invoice, items: invoiceItems };
  });

  try {
    const result = tx();




    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to create invoice' });
  }
});

// List all invoices with filters and pagination
router.get('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const {
      startDate,
      endDate,
      paymentStatus,
      customerId,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    let whereClauses = [];
    let params = [];

    if (startDate) {
      whereClauses.push('date(i.date_time) >= ?');
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push('date(i.date_time) <= ?');
      params.push(endDate);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      whereClauses.push('i.payment_status = ?');
      params.push(paymentStatus);
    }

    if (customerId) {
      whereClauses.push('i.customer_id = ?');
      params.push(customerId);
    }

    if (search) {
      whereClauses.push('(i.invoice_number LIKE ? OR c.name LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countResult = db
      .prepare(
        `
        SELECT COUNT(DISTINCT i.id) as total
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        ${whereClause}
      `
      )
      .get(...params);

    // Get paginated results
    const invoices = db
      .prepare(
        `
        SELECT
          i.id,
          i.invoice_number,
          i.date_time,
          i.total_amount,
          i.total_cost,
          i.discount,
          i.additional_amount,
          i.payment_status,
          i.total_amount - i.total_cost - i.discount as profit,
          c.id as customer_id,
          c.name as customer_name,
          s.business_date
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        LEFT JOIN sessions s ON s.id = i.session_id
        ${whereClause}
        ORDER BY i.date_time DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, parseInt(limit), parseInt(offset));

    res.json({
      invoices,
      total: countResult.total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get payments for an invoice (MUST come before /:id to avoid route conflicts)
router.get('/:id/payments', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const payments = db
    .prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC')
    .all(id);
  res.json(payments);
});

// Simple endpoint to get invoice by id (for reprint / history)
// NOTE: This must come after /:id/payments and before /customer/:customerId to avoid route conflicts
router.get('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const invoice = db
    .prepare(
      `
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = ?
    `
    )
    .get(id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }
  const items = db
    .prepare(
      `
      SELECT ii.*, p.name as product_name
      FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ?
    `
    )
    .all(id);
  const payments = db
    .prepare(
      `
      SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC
    `
    )
    .all(id);
  res.json({ invoice, items, payments });
});

// Get invoices by customer
router.get('/customer/:customerId', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const customerId = Number(req.params.customerId);
  const invoices = db
    .prepare(
      `
      SELECT i.*, s.business_date
      FROM invoices i
      LEFT JOIN sessions s ON s.id = i.session_id
      WHERE i.customer_id = ?
      ORDER BY i.date_time DESC
    `
    )
    .all(customerId);
  res.json(invoices);
});

// Delete invoice (soft delete - set status or remove) - CASHIER can delete invoices
router.delete('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const tx = db.transaction(() => {
    // Get all payments for this invoice to calculate balance adjustments
    const payments = db
      .prepare('SELECT * FROM payments WHERE invoice_id = ?')
      .all(id);

    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Get invoice items to restore stock
    const items = db
      .prepare(
        `
        SELECT ii.*, p.name as product_name
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
      `
      )
      .all(id);

    // Restore stock for each item
    items.forEach((item) => {
      db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(
        item.quantity,
        item.product_id
      );
    });

    // Update customer balance based on invoice status and payments
    if (invoice.customer_id) {
      if (invoice.payment_status === 'CREDIT' || invoice.payment_status === 'PARTIAL') {
        // Calculate the credit portion that was added to the balance
        // This is total_amount - totalPayments (what was already paid)
        const creditPortion = invoice.total_amount - totalPayments;

        if (creditPortion > 0) {
          db.prepare(
            `
            UPDATE customers
            SET current_balance = MAX(0, current_balance - ?)
            WHERE id = ?
          `
          ).run(creditPortion, invoice.customer_id);
        }
      }
      // PAID invoices don't affect balance (no credit)
    }

    // Delete payments first (they will be cascade deleted, but let's be explicit)
    payments.forEach((payment) => {
      db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
    });

    // Delete invoice (cascade will delete items)
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  });

  try {
    tx();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update invoice (edit) - CASHIER can edit invoices
router.put('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  // Check if invoice has payments - if it does, warn but allow editing
  const payments = db
    .prepare('SELECT COUNT(*) as count FROM payments WHERE invoice_id = ?')
    .get(id);
  const hasPayments = payments.count > 0;

  const { items, discount = 0, additionalAmount = 0, customerId } = req.body;

  // If items are provided, validate them
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }
  }

  const tx = db.transaction(() => {
    // Get old items for stock restoration
    const oldItems = db
      .prepare(
        `
        SELECT ii.*, p.name as product_name
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
      `
      )
      .all(id);

    // Restore stock for old items
    oldItems.forEach((oldItem) => {
      db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(
        oldItem.quantity,
        oldItem.product_id
      );
    });

    // Delete old invoice items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);

    let totalAmount = 0;
    let totalCost = 0;
    const newItems = [];

    // If items are provided, process new items
    if (items !== undefined) {
      // Calculate totals and validate stock for new items
      items.forEach((item) => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (product.current_stock < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product.name}`);
        }

        const unitPrice = item.unitPrice ?? product.selling_price;

        // Calculate item discount
        let itemDiscount = 0;
        const discountVal = Number(item.discount) || 0;
        if (item.discountType === 'percentage') {
          itemDiscount = (unitPrice * item.quantity * discountVal) / 100;
        } else {
          itemDiscount = discountVal;
        }

        const lineTotal = (unitPrice * item.quantity) - itemDiscount;
        totalAmount += lineTotal;
        totalCost += product.cost_price * item.quantity;

        newItems.push({
          product,
          quantity: item.quantity,
          unitPrice,
          discount: item.discount || 0,
          discountType: item.discountType || 'amount',
          lineTotal,
        });
      });

      // Deduct stock for new items
      const insertItem = db.prepare(
        `
        INSERT INTO invoice_items
        (invoice_id, product_id, quantity, unit_price, cost_price, discount, discount_type, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      );
      const updateStock = db.prepare(
        `
        UPDATE products SET current_stock = current_stock - ? WHERE id = ?
      `
      );
      const insertStockMovement = db.prepare(
        `
        INSERT INTO stock_movements
        (product_id, type, quantity_change, reason, reference_type, reference_id)
        VALUES (?, 'SALE', ?, 'Sale (Edited)', 'INVOICE', ?)
      `
      );

      newItems.forEach(({ product, quantity, unitPrice, discount, discountType, lineTotal }) => {
        insertItem.run(id, product.id, quantity, unitPrice, product.cost_price, discount, discountType, lineTotal);
        updateStock.run(quantity, product.id);
        insertStockMovement.run(product.id, -quantity, id);
      });
    } else {
      // If items not provided, recalculate from existing items (shouldn't happen, but handle it)
      oldItems.forEach((item) => {
        totalAmount += item.line_total;
        totalCost += item.cost_price * item.quantity;
      });
    }

    const finalTotal = Math.max(totalAmount - (Number(discount) || 0) + (Number(additionalAmount) || 0), 0);

    // Recalculate credit portion for balance adjustments
    const oldPaymentsRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE invoice_id = ?').get(id);
    const oldPaid = oldPaymentsRow.total;
    const oldCreditPortion = (invoice.payment_status === 'CREDIT' || invoice.payment_status === 'PARTIAL')
      ? Math.max(0, invoice.total_amount - oldPaid)
      : 0;

    // We assume payments are NOT edited via this endpoint (only items/discount/customer)
    // If the caller wants to edit payments, they should use the payments endpoint.
    // So the 'paid' amount remains the same, but 'total_amount' might change.
    const newCreditPortion = Math.max(0, finalTotal - oldPaid);

    // Update customer if changed
    const newCustomerId = customerId !== undefined ? (customerId || null) : invoice.customer_id;

    if (invoice.customer_id !== newCustomerId) {
      // Remove old credit portion from old customer
      if (invoice.customer_id && oldCreditPortion > 0) {
        db.prepare(
          `
          UPDATE customers
          SET current_balance = MAX(0, current_balance - ?)
          WHERE id = ?
        `
        ).run(oldCreditPortion, invoice.customer_id);
      }
      // Add new credit portion to new customer
      if (newCustomerId && newCreditPortion > 0) {
        const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(newCustomerId);
        if (newCustomer) {
          const newBalance = newCustomer.current_balance + newCreditPortion;
          if (newCustomer.credit_limit > 0 && newBalance > newCustomer.credit_limit) {
            throw new Error(
              `Credit limit would be exceeded for new customer. Current balance: ${newCustomer.current_balance.toFixed(2)}, Credit limit: ${newCustomer.credit_limit.toFixed(2)}`
            );
          }
          db.prepare(
            `
            UPDATE customers
            SET current_balance = current_balance + ?
            WHERE id = ?
          `
          ).run(newCreditPortion, newCustomerId);
        }
      }
    } else if (invoice.customer_id === newCustomerId && (invoice.payment_status === 'CREDIT' || invoice.payment_status === 'PARTIAL')) {
      // Same customer, update balance based on change in credit portion
      const difference = newCreditPortion - oldCreditPortion;

      if (difference !== 0 && invoice.customer_id) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);
        if (customer) {
          const newBalance = customer.current_balance + difference;
          if (customer.credit_limit > 0 && newBalance > customer.credit_limit) {
            throw new Error(
              `Credit limit would be exceeded. Current balance: ${customer.current_balance.toFixed(2)}, Credit limit: ${customer.credit_limit.toFixed(2)}`
            );
          }
        }

        db.prepare(
          `
          UPDATE customers
          SET current_balance = MAX(0, current_balance + ?)
          WHERE id = ?
        `
        ).run(difference, invoice.customer_id);
      }
    }

    // Update invoice
    db.prepare(
      'UPDATE invoices SET customer_id = ?, discount = ?, additional_amount = ?, total_amount = ?, total_cost = ? WHERE id = ?'
    ).run(newCustomerId, discount, Number(additionalAmount) || 0, finalTotal, totalCost, id);

    const updated = db
      .prepare(
        `
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ?
      `
      )
      .get(id);

    const updatedItems = db
      .prepare(
        `
        SELECT ii.*, p.name as product_name
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ?
      `
      )
      .all(id);

    return { invoice: updated, items: updatedItems };
  });

  try {
    const result = tx();
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete payment
router.delete('/payments/:paymentId', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) {
    return res.status(404).json({ message: 'Payment not found' });
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const tx = db.transaction(() => {
    // Delete payment
    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);

    // Update invoice payment status
    const invoicePayments = db
      .prepare(
        `
        SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid
        FROM payments
        WHERE invoice_id = ?
      `
      )
      .get(invoice.id);

    let newStatus = 'CREDIT';
    if (invoicePayments.total_paid > 0 && invoicePayments.total_paid < invoice.total_amount) {
      newStatus = 'PARTIAL';
    } else if (invoicePayments.total_paid >= invoice.total_amount) {
      newStatus = 'PAID';
    }

    const oldStatus = invoice.payment_status;
    db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(
      newStatus,
      invoice.id
    );

    // Update customer balance based on status change
    // If invoice was PARTIAL and now becomes CREDIT, increase balance
    // If invoice was PAID and now becomes PARTIAL/CREDIT, increase balance
    if (invoice.customer_id) {
      if (oldStatus === 'PARTIAL' && newStatus === 'CREDIT') {
        // Payment removed, invoice back to CREDIT, increase balance
        db.prepare(
          `
          UPDATE customers
          SET current_balance = current_balance + ?
          WHERE id = ?
        `
        ).run(payment.amount, invoice.customer_id);
      } else if (oldStatus === 'PAID' && (newStatus === 'PARTIAL' || newStatus === 'CREDIT')) {
        // Payment removed from paid invoice, increase balance
        db.prepare(
          `
          UPDATE customers
          SET current_balance = current_balance + ?
          WHERE id = ?
        `
        ).run(payment.amount, invoice.customer_id);
      }
    }
  });

  try {
    tx();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update invoice payment status
router.patch('/:id/status', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const id = Number(req.params.id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ message: 'Invoice not found' });
  }

  const { paymentStatus } = req.body;
  if (!['PAID', 'PARTIAL', 'CREDIT'].includes(paymentStatus)) {
    return res.status(400).json({ message: 'Invalid payment status' });
  }

  const oldStatus = invoice.payment_status;
  if (oldStatus === paymentStatus) {
    return res.json({ success: true, invoice });
  }

  const tx = db.transaction(() => {
    // Get total payments for this invoice
    const payments = db
      .prepare(
        `
        SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) as total_paid
        FROM payments
        WHERE invoice_id = ?
      `
      )
      .get(id);
    const totalPaid = payments.total_paid;

    // Validate status change based on payments
    if (paymentStatus === 'PAID' && totalPaid < invoice.total_amount) {
      throw new Error(
        `Cannot set status to PAID. Total paid (${totalPaid.toFixed(2)}) is less than invoice amount (${invoice.total_amount.toFixed(2)})`
      );
    }
    if (paymentStatus === 'CREDIT' && totalPaid > 0) {
      throw new Error(
        `Cannot set status to CREDIT. Invoice has payments totaling ${totalPaid.toFixed(2)}`
      );
    }

    // Update invoice status
    db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(paymentStatus, id);

    // Update customer balance based on status change
    if (invoice.customer_id) {
      if (oldStatus === 'CREDIT' && paymentStatus === 'PAID') {
        // CREDIT -> PAID: Remove full amount from balance
        db.prepare(
          `
          UPDATE customers
          SET current_balance = MAX(0, current_balance - ?)
          WHERE id = ?
        `
        ).run(invoice.total_amount, invoice.customer_id);
      } else if (oldStatus === 'CREDIT' && paymentStatus === 'PARTIAL') {
        // CREDIT -> PARTIAL: Remove full amount, then add back the paid portion
        // This means we're removing the unpaid portion
        const unpaidPortion = invoice.total_amount - totalPaid;
        db.prepare(
          `
          UPDATE customers
          SET current_balance = MAX(0, current_balance - ?)
          WHERE id = ?
        `
        ).run(unpaidPortion, invoice.customer_id);
      } else if (oldStatus === 'PARTIAL' && paymentStatus === 'PAID') {
        // PARTIAL -> PAID: Remove remaining amount from balance
        const remaining = invoice.total_amount - totalPaid;
        db.prepare(
          `
          UPDATE customers
          SET current_balance = MAX(0, current_balance - ?)
          WHERE id = ?
        `
        ).run(remaining, invoice.customer_id);
      } else if (oldStatus === 'PARTIAL' && paymentStatus === 'CREDIT') {
        // PARTIAL -> CREDIT: Add back the paid portion to balance
        db.prepare(
          `
          UPDATE customers
          SET current_balance = current_balance + ?
          WHERE id = ?
        `
        ).run(totalPaid, invoice.customer_id);
      } else if (oldStatus === 'PAID' && paymentStatus === 'CREDIT') {
        // PAID -> CREDIT: Add full amount back to balance
        db.prepare(
          `
          UPDATE customers
          SET current_balance = current_balance + ?
          WHERE id = ?
        `
        ).run(invoice.total_amount, invoice.customer_id);
      } else if (oldStatus === 'PAID' && paymentStatus === 'PARTIAL') {
        // PAID -> PARTIAL: Add back the overpaid portion (if any)
        // Since it was PAID, totalPaid >= total_amount
        // So we add back the difference
        const overpaid = totalPaid - invoice.total_amount;
        if (overpaid > 0) {
          db.prepare(
            `
            UPDATE customers
            SET current_balance = current_balance + ?
            WHERE id = ?
          `
          ).run(overpaid, invoice.customer_id);
        }
      }
    }

    const updated = db
      .prepare(
        `
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ?
      `
      )
      .get(id);

    return updated;
  });

  try {
    const updated = tx();
    res.json({ success: true, invoice: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = {
  invoicesRouter: router,
};


