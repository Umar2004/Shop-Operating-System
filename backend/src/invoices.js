const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');
const {
  invoicePaid,
  invoiceWrittenOff,
  statusFor,
  refreshInvoiceStatus,
  customerBalance,
  refreshCustomerBalance,
  recordAdjustment,
} = require('./balances');

// An error that carries its own HTTP status and machine-readable code back to the route's catch
function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.extra = extra;
  return err;
}

const router = express.Router();

// Money comparisons are done in whole cents so float noise (0.1 + 0.2) can't create a phantom balance.
const toCents = (value) => Math.round((Number(value) || 0) * 100);

// Validates line quantities and returns the total requested per product.
// A product can appear on several lines, so stock must be checked against the sum, not each line.
function requestedQuantities(items) {
  const totals = new Map();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Every line needs a quantity greater than zero');
    }
    const productId = Number(item.productId);
    totals.set(productId, (totals.get(productId) || 0) + quantity);
  }
  return totals;
}

// Line price/discount, allowing manual overrides but rejecting clearly invalid values
function lineAmounts(item, product) {
  const quantity = Number(item.quantity);
  const isBlank = (v) => v === undefined || v === null || v === '';
  const unitPrice = isBlank(item.unitPrice) ? product.selling_price : Number(item.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(`Price for ${product.name} must be zero or more`);
  }
  const discountVal = isBlank(item.discount) ? 0 : Number(item.discount);
  if (!Number.isFinite(discountVal) || discountVal < 0) {
    throw new Error(`Discount for ${product.name} must be zero or more`);
  }
  const subtotal = unitPrice * quantity;
  let itemDiscount;
  if (item.discountType === 'percentage') {
    if (discountVal > 100) {
      throw new Error(`Discount for ${product.name} cannot be more than 100%`);
    }
    itemDiscount = (subtotal * discountVal) / 100;
  } else {
    if (toCents(discountVal) > toCents(subtotal)) {
      throw new Error(`Discount for ${product.name} cannot be more than the line amount`);
    }
    itemDiscount = discountVal;
  }
  return { unitPrice, discountVal, itemDiscount, lineTotal: subtotal - itemDiscount };
}

// Invoice-level discount and additional amount must be plain non-negative numbers
function assertInvoiceAmounts(discount, additionalAmount) {
  for (const [label, value] of [['Discount', discount], ['Additional amount', additionalAmount]]) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${label} must be zero or more`);
    }
  }
}

// Audit trail (audit_logs table): one row per manual override, edit or deletion, so they can be reviewed
function writeAudit(userId, action, invoiceId, details) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, 'INVOICE', ?, ?)`
  ).run(userId, action, invoiceId, JSON.stringify(details));
}

function auditOverrides(userId, invoiceId, invoiceNumber, lines, invoiceDiscount, context) {
  for (const line of lines) {
    const base = {
      invoice_number: invoiceNumber,
      context,
      product_id: line.product.id,
      product_name: line.product.name,
      quantity: line.quantity,
    };
    if (toCents(line.unitPrice) !== toCents(line.product.selling_price)) {
      writeAudit(userId, 'PRICE_OVERRIDE', invoiceId, { ...base, list_price: line.product.selling_price, charged_price: line.unitPrice });
    }
    if (line.itemDiscount > 0) {
      writeAudit(userId, 'LINE_DISCOUNT', invoiceId, {
        ...base,
        discount: line.discount,
        discount_type: line.discountType,
        discount_amount: line.itemDiscount,
      });
    }
  }
  if (Number(invoiceDiscount) > 0) {
    writeAudit(userId, 'INVOICE_DISCOUNT', invoiceId, { invoice_number: invoiceNumber, context, amount: Number(invoiceDiscount) });
  }
}

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
    const requested = requestedQuantities(items);

    const detailedItems = items.map((item) => {
      const product = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      if (product.current_stock < requested.get(product.id)) {
        throw new Error(`Insufficient stock for product: ${product.name}`);
      }
      // Price and discount may be overridden by any user; lineAmounts() rejects nonsense values
      const { unitPrice, discountVal, itemDiscount, lineTotal } = lineAmounts(item, product);
      totalAmount += lineTotal;
      totalCost += product.cost_price * item.quantity;
      return {
        product,
        quantity: item.quantity,
        unitPrice,
        discount: discountVal,
        discountType: item.discountType || 'amount',
        itemDiscount,
        lineTotal,
      };
    });

    assertInvoiceAmounts(discount, additionalAmount);
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
    const remaining = (toCents(finalTotal) - toCents(allPaymentsSum)) / 100;

    // Change handed back is not money received: net it out of the cash lines before they are stored,
    // keeping what was tendered in the payment note (amounts below are in cents)
    const changeCents = Math.max(0, toCents(allPaymentsSum) - toCents(finalTotal));
    const storedPayments = (Array.isArray(payments) ? payments : []).map((p) => ({
      type: p.type,
      amount: toCents(p.amount),
      note: null,
    }));
    let changeLeft = changeCents;
    for (let i = storedPayments.length - 1; i >= 0 && changeLeft > 0; i--) {
      const p = storedPayments[i];
      if (p.type !== 'CASH' || p.amount <= 0) continue;
      const taken = Math.min(p.amount, changeLeft);
      p.note = `Tendered ${(p.amount / 100).toFixed(2)}, change ${(taken / 100).toFixed(2)}`;
      p.amount -= taken;
      changeLeft -= taken;
    }
    if (changeLeft > 0) {
      throw new Error('Card or credit payments are more than the invoice total. Only cash can be overpaid (change is given in cash).');
    }

    // Check if any payment method is CREDIT
    const hasCreditPayment = Array.isArray(payments)
      ? payments.some((p) => p.type === 'CREDIT' && p.amount > 0)
      : false;

    // An unpaid balance (part-payment or credit) must be owed by a named customer
    if (!customerId && (remaining > 0 || hasCreditPayment)) {
      const err = new Error(
        remaining > 0
          ? `A balance of ${remaining.toFixed(2)} remains. Select a customer to record it as credit, or take full payment.`
          : 'Select a customer for a credit payment.'
      );
      err.code = 'CUSTOMER_REQUIRED';
      throw err;
    }

    // Check credit limit if customer exists and there's remaining balance or credit payment
    if (customerId && (remaining > 0 || hasCreditPayment)) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (customer) {
        const balanceToAdd = hasCreditPayment ? finalTotal : remaining;
        const currentBalance = customerBalance(customerId); // the real figure, not the cached column
        const newBalance = currentBalance + balanceToAdd;
        if (customer.credit_limit > 0 && toCents(newBalance) > toCents(customer.credit_limit)) {
          const totalToPay = newBalance - customer.credit_limit;
          throw new Error(
            `Credit limit exceeded. Current balance: ${currentBalance.toFixed(2)}, Credit limit: ${customer.credit_limit.toFixed(2)}. Total amount to pay: ${totalToPay.toFixed(2)}`
          );
        }
      }
    }

    // Determine payment status
    let paymentStatus = 'PAID';
    if (hasCreditPayment) {
      // If any payment method is CREDIT, invoice status is CREDIT
      paymentStatus = 'CREDIT';
    } else if (remaining > 0 && actualPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else if (remaining > 0) {
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

    auditOverrides(userId, invoiceId, invoiceNumber, detailedItems, discount, 'sale');

    if (storedPayments.length > 0) {
      const insertPayment = db.prepare(
        `
        INSERT INTO payments
        (invoice_id, payment_type, amount, note, session_id)
        VALUES (?, ?, ?, ?, ?)
      `
      );
      storedPayments.forEach((p) => {
        if (p.amount > 0) {
          insertPayment.run(invoiceId, p.type, p.amount / 100, p.note, session.id);
        }
      });
    }

    // Status and customer balance follow the money just recorded (see balances.js)
    refreshInvoiceStatus(invoiceId);
    if (customerId) {
      refreshCustomerBalance(customerId);
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
    res.status(400).json({ message: err.message || 'Failed to create invoice', code: err.code });
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
          i.total_amount - i.total_cost as profit,
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

    // Restore stock for each item, and record it so the stock ledger stays in step with current_stock
    items.forEach((item) => {
      db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(
        item.quantity,
        item.product_id
      );
      db.prepare(
        `INSERT INTO stock_movements (product_id, type, quantity_change, reason, reference_type, reference_id)
         VALUES (?, 'RETURN', ?, 'Invoice deleted', 'INVOICE', ?)`
      ).run(item.product_id, item.quantity, id);
    });

    // Delete payments first (they will be cascade deleted, but let's be explicit)
    payments.forEach((payment) => {
      db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
    });

    // Write-offs on this invoice go with it (ON DELETE CASCADE); keep what they were in the audit row
    const adjustments = db.prepare('SELECT id, type, amount, reason FROM balance_adjustments WHERE invoice_id = ?').all(id);

    writeAudit(req.user.id, 'INVOICE_DELETED', id, {
      invoice_number: invoice.invoice_number,
      total: invoice.total_amount,
      payment_status: invoice.payment_status,
      customer_id: invoice.customer_id,
      payments: payments.map((p) => ({ payment_type: p.payment_type, amount: p.amount })),
      adjustments,
      items: items.map((i) => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price })),
    });

    // Delete invoice (cascade will delete items)
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    // The customer no longer owes for this invoice; their balance follows from what is left
    if (invoice.customer_id) {
      refreshCustomerBalance(invoice.customer_id);
    }
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

  const { items, discount = 0, additionalAmount = 0, customerId, refundExcess = false, refundMethod = 'CASH' } = req.body;

  // The edit replaces every line, so the full item list is required
  // (without it the old lines would be deleted and their stock restored with nothing put back)
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one item is required' });
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

    // Restore stock for old items, and record it so the stock ledger stays in step with current_stock
    oldItems.forEach((oldItem) => {
      db.prepare('UPDATE products SET current_stock = current_stock + ? WHERE id = ?').run(
        oldItem.quantity,
        oldItem.product_id
      );
      db.prepare(
        `INSERT INTO stock_movements (product_id, type, quantity_change, reason, reference_type, reference_id)
         VALUES (?, 'RETURN', ?, 'Invoice edited (old lines returned)', 'INVOICE', ?)`
      ).run(oldItem.product_id, oldItem.quantity, id);
    });

    // Delete old invoice items
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);

    let totalAmount = 0;
    let totalCost = 0;
    const newItems = [];

    // If items are provided, process new items
    if (items !== undefined) {
      const requested = requestedQuantities(items);
      // Calculate totals and validate stock for new items
      items.forEach((item) => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (product.current_stock < requested.get(product.id)) {
          throw new Error(`Insufficient stock for product: ${product.name}`);
        }

        // Price and discount may be overridden by any user; lineAmounts() rejects nonsense values
        const { unitPrice, discountVal, itemDiscount, lineTotal } = lineAmounts(item, product);
        totalAmount += lineTotal;
        totalCost += product.cost_price * item.quantity;

        newItems.push({
          product,
          quantity: item.quantity,
          unitPrice,
          discount: discountVal,
          discountType: item.discountType || 'amount',
          itemDiscount,
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

    assertInvoiceAmounts(discount, additionalAmount);
    const finalTotal = Math.max(totalAmount - (Number(discount) || 0) + (Number(additionalAmount) || 0), 0);

    // Customer balances are recomputed from the money after the update (see balances.js)
    const newCustomerId = customerId !== undefined ? (customerId || null) : invoice.customer_id;
    const balanceBefore = newCustomerId ? customerBalance(newCustomerId) : 0;

    // Money already taken and debt already forgiven must still fit the edited invoice
    const paidCents = toCents(invoicePaid(id));
    const writtenOffCents = toCents(invoiceWrittenOff(id));
    if (writtenOffCents > 0 && newCustomerId !== invoice.customer_id) {
      throw httpError(409, 'HAS_WRITE_OFF', 'Part of this invoice was written off, so it cannot be moved to another customer');
    }
    if (writtenOffCents > 0 && toCents(finalTotal) < paidCents + writtenOffCents) {
      throw httpError(409, 'WRITE_OFF_EXCEEDS_TOTAL',
        `The new total (${finalTotal.toFixed(2)}) is less than what was paid and written off (${((paidCents + writtenOffCents) / 100).toFixed(2)})`);
    }

    // Update invoice
    db.prepare(
      'UPDATE invoices SET customer_id = ?, discount = ?, additional_amount = ?, total_amount = ?, total_cost = ? WHERE id = ?'
    ).run(newCustomerId, discount, Number(additionalAmount) || 0, finalTotal, totalCost, id);

    // Overpayment created by the edit is handed back, never kept as credit. For a named customer the extra money
    // first counts against their other debts; only what would leave the shop owing them is refunded.
    let refundCents = 0;
    if (toCents(finalTotal) < paidCents) {
      refundCents = newCustomerId
        ? Math.min(paidCents - toCents(finalTotal), Math.max(0, -toCents(customerBalance(newCustomerId))))
        : paidCents - toCents(finalTotal);
    }
    if (refundCents > 0) {
      if (!refundExcess) {
        throw httpError(409, 'REFUND_REQUIRED',
          `The customer has paid ${(paidCents / 100).toFixed(2)} but the new total is ${finalTotal.toFixed(2)}: ${(refundCents / 100).toFixed(2)} must be refunded`,
          { refund: refundCents / 100 });
      }
      if (!['CASH', 'CARD'].includes(refundMethod)) {
        throw httpError(400, 'BAD_REFUND_METHOD', 'Refund method must be CASH or CARD');
      }
      const session = db.prepare("SELECT id FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get();
      if (refundMethod === 'CASH' && !session) {
        throw httpError(400, 'NO_OPEN_DAY', 'Open the day first: a cash refund is taken from the drawer');
      }
      recordAdjustment({
        customerId: newCustomerId,
        invoiceId: newCustomerId ? null : id,
        type: 'REFUND',
        amount: refundCents / 100,
        reason: `Refund after editing ${invoice.invoice_number} (total ${invoice.total_amount.toFixed(2)} -> ${finalTotal.toFixed(2)})`,
        paymentType: refundMethod,
        sessionId: refundMethod === 'CASH' ? session.id : null,
        userId: req.user.id,
      });
    }

    // Status and balances follow the money; an edit may not push the customer over their credit limit
    refreshInvoiceStatus(id);
    if (invoice.customer_id && invoice.customer_id !== newCustomerId) {
      refreshCustomerBalance(invoice.customer_id);
    }
    if (newCustomerId) {
      const balanceAfter = refreshCustomerBalance(newCustomerId);
      const limitRow = db.prepare('SELECT credit_limit FROM customers WHERE id = ?').get(newCustomerId);
      if (limitRow && limitRow.credit_limit > 0 && toCents(balanceAfter) > toCents(limitRow.credit_limit) && toCents(balanceAfter) > toCents(balanceBefore)) {
        throw new Error(
          `Credit limit would be exceeded. Balance after this edit: ${balanceAfter.toFixed(2)}, Credit limit: ${limitRow.credit_limit.toFixed(2)}`
        );
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

    writeAudit(req.user.id, 'INVOICE_EDITED', id, {
      invoice_number: invoice.invoice_number,
      before: { total: invoice.total_amount, discount: invoice.discount, customer_id: invoice.customer_id,
        items: oldItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount })) },
      after: { total: updated.total_amount, discount: updated.discount, customer_id: updated.customer_id,
        items: updatedItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount })) },
    });
    auditOverrides(req.user.id, id, invoice.invoice_number, newItems, discount, 'edit');

    return { invoice: updated, items: updatedItems };
  });

  try {
    const result = tx();
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message, ...(err.code ? { code: err.code, ...err.extra } : {}) });
  }
});

// Delete payment
router.delete('/payments/:paymentId', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) {
    return res.status(404).json({ message: 'Payment not found' });
  }

  // A payment on account (no invoice) belongs to its customer; otherwise to the invoice's customer
  const invoice = payment.invoice_id ? db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id) : null;
  const customerIdForBalance = invoice ? invoice.customer_id : payment.customer_id;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
    // Status and balance follow the money that is left
    if (invoice) refreshInvoiceStatus(invoice.id);
    refreshCustomerBalance(customerIdForBalance);
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

  // The status is derived from the money received. Changing it by hand used to move the customer's
  // balance with no money involved; now it can only be set to what the payments (and write-offs) say.
  const paid = invoicePaid(id);
  const writtenOff = invoiceWrittenOff(id);
  const derived = statusFor(invoice.total_amount, paid, writtenOff);
  if (paymentStatus !== derived) {
    return res.status(409).json({
      code: 'STATUS_FOLLOWS_PAYMENTS',
      message: `Status follows payments: ${paid.toFixed(2)} of ${invoice.total_amount.toFixed(2)} has been paid${writtenOff > 0 ? ` and ${writtenOff.toFixed(2)} written off` : ''}, so this invoice is ${derived}. Record a payment, or use "Write off" on the customer to forgive the rest.`,
    });
  }

  const tx = db.transaction(() => {
    refreshInvoiceStatus(id);
    if (invoice.customer_id) refreshCustomerBalance(invoice.customer_id);
    return db
      .prepare(
        `
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ?
      `
      )
      .get(id);
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


