const express = require('express');
const db = require('./db');
const { requireRole, requirePermission } = require('./auth');
const { sessionMoney } = require('./balances');

const router = express.Router();

// Day summary report by business date (CASHIER can view their own day summary)
router.get('/day-summary', requirePermission('dashboard', 'reports'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { date } = req.query; // YYYY-MM-DD
  if (!date) {
    return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
  }

  const session = db
    .prepare(
      `
      SELECT * FROM sessions
      WHERE business_date = ?
      ORDER BY id DESC
      LIMIT 1
    `
    )
    .get(date);

  if (!session) {
    return res.status(404).json({ message: 'No session found for this date' });
  }

  const salesRow = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(discount), 0) as total_discount
      FROM invoices
      WHERE session_id = ?
    `
    )
    .get(session.id);

  const expensesRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE session_id = ?
    `
    )
    .get(session.id);

  const invoiceStats = db
    .prepare(
      `
      SELECT COUNT(*) as invoice_count
      FROM invoices
      WHERE session_id = ?
    `
    )
    .get(session.id);

  // Money taken in this day (sales and credit repayments) and refunds handed back (see balances.sessionMoney)
  const money = sessionMoney(session.id);
  const paymentBreakdown = {
    cash_sales: money.cash - money.cash_repayments,
    card_sales: money.card,
    credit_sales: money.credit,
    cash_repayments: money.cash_repayments,
    cash_refunds: money.cash_refunds,
    refunds: money.all_refunds,
  };

  // Get total products count (active products only)
  const productsCount = db
    .prepare(
      `
      SELECT COUNT(*) as total_products
      FROM products
      WHERE status = 'ACTIVE'
    `
    )
    .get();

  // Calculate profit: Sales - Cost - Expenses
  // (total_amount is already net of the invoice discount, so the discount is not subtracted again)
  const profit = Number(
    (salesRow.total_sales || 0) -
    (salesRow.total_cost || 0) -
    (expensesRow.total_expenses || 0)
  );

  const expectedCash =
    (session.opening_cash || 0) +
    (money.cash || 0) -
    (expensesRow.total_expenses || 0) -
    (money.cash_refunds || 0);

  res.json({
    session,
    sales: salesRow,
    expenses: expensesRow,
    cashSales: { cash_sales: paymentBreakdown.cash_sales },
    payments: paymentBreakdown,
    invoiceStats,
    profit,
    expectedCash,
    products: {
      total_products: productsCount.total_products || 0,
    },
  });
});

// Sales Trends - Time series data
router.get('/sales/trends', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  let dateFormat, groupByClause;
  switch (groupBy) {
    case 'week':
      dateFormat = "strftime('%Y-W%W', i.date_time)";
      groupByClause = "strftime('%Y-W%W', i.date_time)";
      break;
    case 'month':
      dateFormat = "strftime('%Y-%m', i.date_time)";
      groupByClause = "strftime('%Y-%m', i.date_time)";
      break;
    default: // day
      dateFormat = "date(i.date_time)";
      groupByClause = "date(i.date_time)";
  }

  const trends = db
    .prepare(
      `
      SELECT
        ${dateFormat} as period,
        COALESCE(SUM(i.total_amount), 0) as revenue,
        COALESCE(SUM(i.total_cost), 0) as cost,
        COALESCE(SUM(i.total_amount - i.total_cost), 0) as profit,
        COUNT(DISTINCT i.id) as transaction_count
      FROM invoices i
      JOIN sessions s ON s.id = i.session_id
      WHERE date(i.date_time) >= ? AND date(i.date_time) <= ?
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `
    )
    .all(startDate, endDate);

  res.json(trends);
});

// Sales by Payment Method
router.get('/sales/payment-methods', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  const breakdown = db
    .prepare(
      `
      SELECT
        p.payment_type,
        COALESCE(SUM(p.amount), 0) as amount,
        COUNT(DISTINCT p.invoice_id) as transaction_count
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE date(i.date_time) >= ? AND date(i.date_time) <= ?
      GROUP BY p.payment_type
    `
    )
    .all(startDate, endDate);

  res.json(breakdown);
});

// Sales by Product Category
router.get('/sales/by-category', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  const categorySales = db
    .prepare(
      `
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        COALESCE(SUM(ii.line_total), 0) as revenue,
        COALESCE(SUM(ii.quantity), 0) as quantity,
        COALESCE(SUM(ii.line_total - (ii.cost_price * ii.quantity)), 0) as profit
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE date(i.date_time) >= ? AND date(i.date_time) <= ?
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `
    )
    .all(startDate, endDate);

  res.json(categorySales);
});

// Top Products
router.get('/sales/top-products', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { startDate, endDate, limit = 10, sortBy = 'revenue' } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  const orderBy = sortBy === 'quantity' ? 'quantity DESC' : 'revenue DESC';

  const topProducts = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        COALESCE(c.name, 'Uncategorized') as category_name,
        COALESCE(SUM(ii.line_total), 0) as revenue,
        COALESCE(SUM(ii.quantity), 0) as quantity,
        COALESCE(SUM(ii.line_total - (ii.cost_price * ii.quantity)), 0) as profit,
        COALESCE(AVG(ii.unit_price), 0) as avg_price
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE date(i.date_time) >= ? AND date(i.date_time) <= ?
      GROUP BY p.id, p.name, c.name
      ORDER BY ${orderBy}
      LIMIT ?
    `
    )
    .all(startDate, endDate, parseInt(limit));

  res.json(topProducts);
});

// Sales Summary (KPIs)
router.get('/sales/summary', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  const summary = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(i.total_amount), 0) as total_sales,
        COALESCE(SUM(i.total_cost), 0) as total_cost,
        COALESCE(SUM(i.discount), 0) as total_discount,
        COALESCE(SUM(i.total_amount - i.total_cost), 0) as total_profit,
        COUNT(DISTINCT i.id) as transaction_count,
        COALESCE(AVG(i.total_amount), 0) as avg_transaction_value
      FROM invoices i
      WHERE date(i.date_time) >= ? AND date(i.date_time) <= ?
    `
    )
    .get(startDate, endDate);

  // Calculate profit margin
  const profitMargin = summary.total_sales > 0
    ? ((summary.total_profit / summary.total_sales) * 100).toFixed(2)
    : 0;

  // Get total outstanding amount from customers
  // current_balance is derived from invoices, payments and adjustments (balances.js). Only positive balances are
  // owed to the shop; customers who have overpaid are owed a refund, reported separately instead of netting it off
  const outstanding = db
    .prepare('SELECT SUM(MAX(0, current_balance)) as total, -SUM(MIN(0, current_balance)) as refund_due FROM customers')
    .get();
  // Debt forgiven and money refunded in the period: shown on their own, never mixed into sales or payments
  // (provisional carry-over rows from the upgrade are not a decision taken in the period)
  const adjustmentsInPeriod = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'WRITE_OFF' THEN amount END), 0) as write_offs,
        COALESCE(SUM(CASE WHEN type = 'REFUND' THEN amount END), 0) as refunds,
        COALESCE(SUM(CASE WHEN type = 'CHARGE' THEN amount END), 0) as charges
      FROM balance_adjustments
      WHERE provisional = 0 AND date(created_at, 'localtime') >= ? AND date(created_at, 'localtime') <= ?
    `
    )
    .get(startDate, endDate);

  res.json({
    ...summary,
    profit_margin: parseFloat(profitMargin),
    total_outstanding: outstanding.total || 0,
    customer_refund_due: outstanding.refund_due || 0,
    ...adjustmentsInPeriod,
  });
});

// Detailed Sales List (CASHIER can view sales details)
router.get('/sales/detail', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const {
    startDate,
    endDate,
    paymentType,
    customerId,
    search,
    limit = 50,
    offset = 0
  } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate and endDate (YYYY-MM-DD) are required' });
  }

  let whereClauses = ['date(i.date_time) >= ?', 'date(i.date_time) <= ?'];
  let params = [startDate, endDate];

  if (paymentType && paymentType !== 'ALL') {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM payments p 
      WHERE p.invoice_id = i.id AND p.payment_type = ?
    )`);
    params.push(paymentType);
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

  const whereClause = whereClauses.join(' AND ');

  // Get total count
  const countResult = db
    .prepare(
      `
      SELECT COUNT(DISTINCT i.id) as total
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE ${whereClause}
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
        i.payment_status,
        i.total_amount - i.total_cost as profit,
        c.id as customer_id,
        c.name as customer_name,
        (
          SELECT GROUP_CONCAT(p.payment_type || ':' || p.amount, ', ')
          FROM payments p
          WHERE p.invoice_id = i.id
        ) as payment_details
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE ${whereClause}
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
});

// Stock Valuation Report
router.get('/stock-valuation', requirePermission('reports'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { search = '', categoryId = '' } = req.query;

    let where = `p.status = 'ACTIVE'`;
    const params = [];

    if (search) {
      where += ` AND (p.name LIKE ? OR c.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (categoryId) {
      where += ` AND p.category_id = ?`;
      params.push(categoryId);
    }

    const rows = db.prepare(`
      SELECT
        p.id,
        p.name,
        c.name            AS category_name,
        p.unit,
        p.current_stock,
        p.minimum_stock,
        p.cost_price,
        p.selling_price,
        ROUND(p.current_stock * p.cost_price, 2)    AS cost_value,
        ROUND(p.current_stock * p.selling_price, 2) AS selling_value,
        ROUND((p.current_stock * p.selling_price) - (p.current_stock * p.cost_price), 2) AS potential_profit,
        CASE WHEN p.current_stock <= 0 THEN 'out'
             WHEN p.current_stock <= p.minimum_stock THEN 'low'
             ELSE 'ok' END AS stock_status
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY c.name ASC, p.name ASC
    `).all(...params);

    // Totals
    const totals = rows.reduce((acc, r) => ({
      totalItems:         acc.totalItems + 1,
      totalUnits:         acc.totalUnits + (r.current_stock || 0),
      totalCostValue:     acc.totalCostValue + (r.cost_value || 0),
      totalSellingValue:  acc.totalSellingValue + (r.selling_value || 0),
      totalPotentialProfit: acc.totalPotentialProfit + (r.potential_profit || 0),
      outOfStock:         acc.outOfStock + (r.stock_status === 'out' ? 1 : 0),
      lowStock:           acc.lowStock + (r.stock_status === 'low' ? 1 : 0),
    }), {
      totalItems: 0, totalUnits: 0, totalCostValue: 0,
      totalSellingValue: 0, totalPotentialProfit: 0, outOfStock: 0, lowStock: 0,
    });

    res.json({ items: rows, totals });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  reportsRouter: router,
};


