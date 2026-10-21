const express = require('express');
const db = require('./db');
const { requireRole, requirePermission } = require('./auth');

const router = express.Router();

// User activity log (audit_logs): who did what, to which record, when, with before/after.
// Managers need the "activity" page permission; admins always see it.
const guard = [requireRole(['ADMIN', 'MANAGER']), requirePermission('activity')];

// Local calendar day 'YYYY-MM-DD' -> the UTC timestamp audit_logs.created_at is stored in (keeps the index usable)
function localDayStartUtc(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toISOString().replace('T', ' ').slice(0, 19);
}

function buildFilter(q) {
  const where = [];
  const params = [];
  if (q.userId) {
    where.push('a.user_id = ?');
    params.push(Number(q.userId));
  }
  if (q.action) {
    const actions = String(q.action).split(',').map((s) => s.trim()).filter(Boolean);
    if (actions.length) {
      where.push(`a.action IN (${actions.map(() => '?').join(',')})`);
      params.push(...actions);
    }
  }
  if (q.entityType) {
    where.push('a.entity_type = ?');
    params.push(String(q.entityType));
  }
  if (q.entityId) {
    where.push('a.entity_id = ?');
    params.push(Number(q.entityId));
  }
  // kept for older callers: ?invoiceId=
  if (q.invoiceId) {
    where.push("a.entity_type = 'INVOICE' AND a.entity_id = ?");
    params.push(Number(q.invoiceId));
  }
  if (q.from) {
    const from = localDayStartUtc(q.from);
    if (from) {
      where.push('a.created_at >= ?');
      params.push(from);
    }
  }
  if (q.to) {
    const [y, m, d] = String(q.to).split('-').map(Number);
    if (y && m && d) {
      where.push('a.created_at < ?');
      params.push(new Date(y, m - 1, d + 1).toISOString().replace('T', ' ').slice(0, 19));
    }
  }
  if (q.q) {
    where.push("(a.details LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')");
    const like = `%${String(q.q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const parse = (rows) =>
  rows.map((r) => {
    let details = null;
    try {
      details = r.details ? JSON.parse(r.details) : null;
    } catch (_) {
      details = { text: r.details };
    }
    return { ...r, details };
  });

const SELECT = `
  SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details, a.user_id, u.username
  FROM audit_logs a
  LEFT JOIN users u ON u.id = a.user_id`;

// One page of the log, newest first, with the total for paging
router.get('/page', ...guard, (req, res) => {
  try {
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 0, 0);
    const { clause, params } = buildFilter(req.query);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${clause}`).get(...params).n;
    const rows = db.prepare(`${SELECT} ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, page * pageSize);
    res.json({ rows: parse(rows), total, page, pageSize });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// For the filters: which actions and entity types occur, and which users appear
router.get('/filters', ...guard, (req, res) => {
  try {
    res.json({
      actions: db.prepare('SELECT action, COUNT(*) AS n FROM audit_logs GROUP BY action ORDER BY action').all(),
      entityTypes: db.prepare('SELECT entity_type AS entityType, COUNT(*) AS n FROM audit_logs WHERE entity_type IS NOT NULL GROUP BY entity_type ORDER BY entity_type').all(),
      users: db.prepare('SELECT DISTINCT u.id, u.username FROM audit_logs a JOIN users u ON u.id = a.user_id ORDER BY u.username').all(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Plain list (newest first): limit/offset plus the same filters as /page
router.get('/', ...guard, (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { clause, params } = buildFilter(req.query);
    const rows = db.prepare(`${SELECT} ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json(parse(rows));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  auditLogsRouter: router,
};
