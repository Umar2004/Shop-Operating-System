const express = require('express');
const db = require('./db');
const { requireRole, requirePermission } = require('./auth');
const { logActivity, changedFields } = require('./activityLog');

const router = express.Router();

// List active expense categories
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT id, name
      FROM expense_categories
      WHERE is_active = 1
      ORDER BY name
    `
    )
    .all();
  res.json(rows);
});

// Create a new expense category (CASHIER can create categories for expenses)
router.post('/', requirePermission('categories', 'expenses'), requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  try {
    const result = db
      .prepare(
        `
        INSERT INTO expense_categories (name, is_active)
        VALUES (?, 1)
      `
      )
      .run(name.trim());

    const category = db
      .prepare('SELECT id, name FROM expense_categories WHERE id = ?')
      .get(result.lastInsertRowid);
    logActivity({ userId: req.user.id, action: 'EXPENSE_CATEGORY_CREATED', entityType: 'EXPENSE_CATEGORY', entityId: category.id, after: { name: category.name } });

    res.status(201).json(category);
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ message: 'Category already exists' });
    }
    console.error('Error creating expense category', err);
    res.status(500).json({ message: 'Failed to create expense category' });
  }
});

// Delete expense category (soft delete - set is_active = 0)
router.delete('/:id', requirePermission('categories'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'Invalid category ID' });
  }

  // Check if category exists
  const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  // Check if category is in use by any expenses
  const expensesUsingCategory = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM expenses
      WHERE category = (SELECT name FROM expense_categories WHERE id = ?)
    `
    )
    .get(id);

  if (expensesUsingCategory.count > 0) {
    return res.status(400).json({
      message: `Cannot delete category: ${expensesUsingCategory.count} expense(s) are using this category`,
    });
  }

  // Soft delete (set is_active = 0)
  try {
    db.prepare('UPDATE expense_categories SET is_active = 0 WHERE id = ?').run(id);
    logActivity({ userId: req.user.id, action: 'EXPENSE_CATEGORY_DELETED', entityType: 'EXPENSE_CATEGORY', entityId: id, before: { name: category.name } });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    console.error('Error deleting expense category', err);
    res.status(500).json({ message: 'Failed to delete category' });
  }
});

// Bulk delete expense categories
router.post('/bulk-delete', requirePermission('categories'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids must be a non-empty array' });
  }

  const errors = [];
  const deleted = [];

  ids.forEach((id) => {
    const categoryId = Number(id);
    if (!categoryId) {
      errors.push({ id, error: 'Invalid category ID' });
      return;
    }

    const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(categoryId);
    if (!category) {
      errors.push({ id: categoryId, error: 'Category not found' });
      return;
    }

    // Check if category is in use
    const expensesUsingCategory = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM expenses
        WHERE category = (SELECT name FROM expense_categories WHERE id = ?)
      `
      )
      .get(categoryId);

    if (expensesUsingCategory.count > 0) {
      errors.push({
        id: categoryId,
        error: `${expensesUsingCategory.count} expense(s) are using this category`,
      });
      return;
    }

    try {
      db.prepare('UPDATE expense_categories SET is_active = 0 WHERE id = ?').run(categoryId);
      deleted.push(categoryId);
    } catch (err) {
      errors.push({ id: categoryId, error: err.message });
    }
  });

  if (deleted.length) {
    logActivity({ userId: req.user.id, action: 'EXPENSE_CATEGORY_DELETED', entityType: 'EXPENSE_CATEGORY', details: { count: deleted.length, category_ids: deleted } });
  }
  res.json({
    success: true,
    deleted: deleted.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});

module.exports = {
  expenseCategoriesRouter: router,
};


