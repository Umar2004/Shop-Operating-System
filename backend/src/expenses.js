const express = require('express');
const db = require('./db');
const { requireRole, requirePermission } = require('./auth');
const { logActivity, changedFields } = require('./activityLog');

const router = express.Router();

function getOpenSession() {
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
    .get();
}

// Record an expense (CASHIER can record expenses)
router.post('/', requirePermission('expenses'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { category, description, amount } = req.body;
  const userId = req.user.id;

  if (!category || typeof amount !== 'number') {
    return res.status(400).json({ message: 'Category and numeric amount are required' });
  }

  const session = getOpenSession();
  if (!session) {
    return res.status(400).json({ message: 'No open session. Start day first.' });
  }

  const result = db
    .prepare(
      `
      INSERT INTO expenses
      (session_id, category, description, amount, created_by)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(session.id, category, description || null, amount, userId);

  const expense = db
    .prepare('SELECT * FROM expenses WHERE id = ?')
    .get(result.lastInsertRowid);
  logActivity({ userId, action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: expense.id, after: { category: expense.category, description: expense.description, amount: expense.amount } });

  res.status(201).json(expense);
});

// List expenses for current or specific session (CASHIER can view expenses)
router.get('/', requirePermission('expenses'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { sessionId } = req.query;
  let sid = sessionId ? Number(sessionId) : null;

  if (!sid) {
    const current = getOpenSession();
    sid = current ? current.id : null;
  }

  if (!sid) {
    return res.json([]);
  }

  const rows = db
    .prepare(
      `
      SELECT * FROM expenses
      WHERE session_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(sid);
  res.json(rows);
});

// Update expense
router.put('/:id', requirePermission('expenses'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const { category, description, amount } = req.body;

  if (!category || typeof amount !== 'number') {
    return res.status(400).json({ message: 'Category and numeric amount are required' });
  }

  const before = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  const result = db
    .prepare(
      `
      UPDATE expenses
      SET category = ?, description = ?, amount = ?
      WHERE id = ?
    `
    )
    .run(category, description || null, amount, id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Expense not found' });
  }
  const change = changedFields(before, db.prepare('SELECT * FROM expenses WHERE id = ?').get(id), ['category', 'description', 'amount']);
  if (change) {
    logActivity({ userId: req.user.id, action: 'EXPENSE_UPDATED', entityType: 'EXPENSE', entityId: id, ...change });
  }

  res.json({ success: true });
});

// Delete expense
router.delete('/:id', requirePermission('expenses'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const id = Number(req.params.id);

  const before = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Expense not found' });
  }
  logActivity({ userId: req.user.id, action: 'EXPENSE_DELETED', entityType: 'EXPENSE', entityId: id, before: { category: before.category, description: before.description, amount: before.amount } });

  res.json({ success: true });
});

module.exports = {
  expensesRouter: router,
};


