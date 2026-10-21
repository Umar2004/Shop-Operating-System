const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');

const router = express.Router();

// Review trail of manual price/discount overrides, invoice edits and deletions (newest first)
router.get('/', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { action, invoiceId } = req.query;

    const whereClauses = [];
    const params = [];
    if (action) {
      whereClauses.push('a.action = ?');
      params.push(action);
    }
    if (invoiceId) {
      whereClauses.push("a.entity_type = 'INVOICE' AND a.entity_id = ?");
      params.push(Number(invoiceId));
    }
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `
        SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details, u.username
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        ${whereClause}
        ORDER BY a.id DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset);

    res.json(rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  auditLogsRouter: router,
};
