const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');
const { logActivity, changedFields } = require('./activityLog');
const { sessionMoney } = require('./balances');

const router = express.Router();

function getOpenSession() {
  return db
    .prepare("SELECT * FROM sessions WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
    .get();
}

// Start day / open session (CASHIER can also start sessions)
router.post('/start', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { openingCash, businessDate } = req.body;
  const userId = req.user.id;

  const parsedOpeningCash = Number(openingCash);
  if (!Number.isFinite(parsedOpeningCash) || parsedOpeningCash <= 0) {
    return res
      .status(400)
      .json({ message: 'Opening cash must be greater than zero' });
  }

  // Check if there's already an open session
  const openSession = getOpenSession();
  if (openSession) {
    return res.status(400).json({ 
      message: 'A session is already open. Please end the current day before starting a new one.',
      openSession: {
        id: openSession.id,
        business_date: openSession.business_date,
        opened_at: openSession.opened_at
      }
    });
  }

  // Get the requested business date or use today
  const requestedDate = businessDate || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  
  // Check if there's a closed session from yesterday or earlier that needs to be checked
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  
  // Check for any unclosed session from previous days
  const previousOpenSession = db
    .prepare(`
      SELECT * FROM sessions 
      WHERE status = 'OPEN' 
      AND business_date < ?
      ORDER BY business_date DESC 
      LIMIT 1
    `)
    .get(requestedDate);
  
  if (previousOpenSession) {
    return res.status(400).json({ 
      message: `Cannot start a new day. There is an unclosed session from ${previousOpenSession.business_date}. Please end that day first before starting a new day.`,
      previousSession: {
        id: previousOpenSession.id,
        business_date: previousOpenSession.business_date,
        opened_at: previousOpenSession.opened_at
      }
    });
  }

  // Check if trying to start a new day after midnight without closing previous day
  const currentHour = new Date().getHours();
  if (currentHour >= 0 && currentHour < 6) {
    // Between midnight and 6 AM - check if yesterday's session was closed
    const yesterdaySession = db
      .prepare(`
        SELECT * FROM sessions 
        WHERE business_date = ? 
        ORDER BY id DESC 
        LIMIT 1
      `)
      .get(yesterdayStr);
    
    if (yesterdaySession && yesterdaySession.status === 'OPEN') {
      return res.status(400).json({ 
        message: `Cannot start a new day. The previous day (${yesterdayStr}) has not been closed. Please end the previous day before starting a new day.`,
        previousSession: {
          id: yesterdaySession.id,
          business_date: yesterdaySession.business_date,
          opened_at: yesterdaySession.opened_at
        }
      });
    }
  }

  const result = db
    .prepare(
      `
      INSERT INTO sessions
      (business_date, status, opening_cash, opened_by)
      VALUES (?, 'OPEN', ?, ?)
    `
    )
    .run(requestedDate, parsedOpeningCash, userId);

  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(result.lastInsertRowid);
  logActivity({ userId, action: 'DAY_OPENED', entityType: 'SESSION', entityId: session.id, after: { business_date: session.business_date, opening_cash: session.opening_cash } });

  res.status(201).json(session);
});

// End day / close session
router.post('/end', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const { actualCash, skipBackup } = req.body;
  const userId = req.user.id;

  const parsedActualCash = Number(actualCash);
  if (!Number.isFinite(parsedActualCash) || parsedActualCash <= 0) {
    return res
      .status(400)
      .json({ message: 'Closing cash must be greater than zero' });
  }

  const session = getOpenSession();
  if (!session) {
    return res.status(400).json({ message: 'No open session to close' });
  }

  // Calculate expected cash:
  // opening_cash + cash taken today (sales and credit repayments) - expenses - cash refunds
  const money = sessionMoney(session.id);

  const expensesRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      WHERE session_id = ?
    `
    )
    .get(session.id);

  const expectedCash =
    (session.opening_cash || 0) +
    (money.cash || 0) -
    (expensesRow.expenses || 0) -
    (money.cash_refunds || 0);

  const difference = (actualCash || 0) - expectedCash;

  // Check if daily backup should be created
  let backupResult = null;
  let localBackupTried = false;
  if (!skipBackup) {
    try {
      const getSetting = (key, defaultValue) => {
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return setting ? setting.value : defaultValue;
      };

      const dailyEnabled = getSetting('backup.schedule.daily', 'disabled') === 'enabled';
      
      if (dailyEnabled) {
        localBackupTried = true; // createBackup also queues the Google Drive copy
        const { createBackup } = require('./backupScheduler');
        try {
          backupResult = await createBackup({ cloudKind: 'day-end' });
        } catch (backupErr) {
          console.error('Backup failed on day end:', backupErr);
          // Continue with day end even if backup fails
        }
      }
    } catch (err) {
      console.error('Error checking backup settings:', err);
      // Continue with day end even if backup check fails
    }
  }

  db.prepare(
    `
    UPDATE sessions
    SET status = 'CLOSED',
        closing_cash_expected = ?,
        closing_cash_actual = ?,
        cash_difference = ?,
        closed_by = ?,
        closed_at = datetime('now')
    WHERE id = ?
  `
  ).run(expectedCash, actualCash || 0, difference, userId, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  logActivity({ userId, action: 'DAY_CLOSED', entityType: 'SESSION', entityId: session.id,
    details: { business_date: updated.business_date, expected_cash: expectedCash, counted_cash: actualCash || 0, difference } });
  // "Skip" (or daily backups off) skips only the LOCAL backup: Google Drive still gets a day-end copy, taken now so
  // it includes the closed day. Not awaited; does nothing unless Drive is connected.
  if (!localBackupTried) require('./cloud/uploader').enqueue('day-end', null);
  res.json({
    ...updated,
    backup: backupResult,
  });
});

// Get current session info
router.get('/current', (req, res) => {
  const session = getOpenSession();
  res.json(session || null);
});

module.exports = {
  sessionsRouter: router,
};


