const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');

const router = express.Router();

function getOpenSession() {
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
    .get();
}

// Record an expense (CASHIER can record expenses)
router.post('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
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

  res.status(201).json(expense);
});

// List expenses for current or specific session (CASHIER can view expenses)
router.get('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
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
router.put('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const { category, description, amount } = req.body;

  if (!category || typeof amount !== 'number') {
    return res.status(400).json({ message: 'Category and numeric amount are required' });
  }

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

  res.json({ success: true });
});

// Delete expense
router.delete('/:id', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const id = Number(req.params.id);

  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Expense not found' });
  }

  res.json({ success: true });
});

module.exports = {
  expensesRouter: router,
};


