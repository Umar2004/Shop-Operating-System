const db = require('./db');

// One place to write the user activity log (audit_logs): who did what to which record, with what was there
// before and after. Secrets never reach it: password-like fields are removed from details/before/after.
const SECRET_FIELDS = new Set([
  'password', 'password_hash', 'currentPassword', 'newPassword', 'confirmPassword',
  'token', 'recoveryKey', 'recovery_key', 'recovery_key_hash', 'secret', 'api_key', 'sms.api_key',
]);

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.has(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

// logActivity({ userId, action, entityType, entityId, details, before, after })
// userId may be null (e.g. a failed login names no real user). Never throws: a logging problem must not
// break the action being logged.
function logActivity({ userId = null, action, entityType = null, entityId = null, details = {}, before, after }) {
  const body = scrub({ ...details, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
  const insert = (uid, extra) =>
    db.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      uid,
      action,
      entityType,
      entityId,
      JSON.stringify({ ...body, ...extra })
    );
  try {
    insert(userId, {});
  } catch (err) {
    // The user may not exist in this database (e.g. right after restoring an older backup): keep the record anyway
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' && userId !== null) {
      try {
        insert(null, { by_user_id: userId });
        return;
      } catch (_) {
        // fall through
      }
    }
    console.error(`Could not write activity log (${action}):`, err.message);
  }
}

// Only the fields that changed, as { before, after } (null when nothing changed)
function changedFields(before, after, fields) {
  const b = {};
  const a = {};
  for (const f of fields) {
    const x = before ? before[f] : undefined;
    const y = after ? after[f] : undefined;
    if (String(x ?? '') !== String(y ?? '')) {
      b[f] = x ?? null;
      a[f] = y ?? null;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

// ---- settings and backups: one logger for the whole settings router -------------------------------------------
// Every successful write is compared with the settings as they were before it; changed keys are logged with their
// old and new values (secret ones only as "changed"). Backup actions are logged by route.
const SECRET_SETTING_KEYS = new Set(['sms.api_key']);
const IGNORED_SETTING_KEYS = new Set(['backup.last_success']);
const settingsSnapshot = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((s) => [s.key, s.value]));
const BACKUP_ROUTES = [
  ['POST', /^\/backup$/, 'BACKUP_CREATED'],
  ['POST', /^\/backup\/end-day$/, 'BACKUP_CREATED'],
  ['POST', /^\/backup\/upload$/, 'BACKUP_UPLOADED'],
  ['POST', /^\/backup\/restore\/([^/]+)$/, 'BACKUP_RESTORED'],
  ['DELETE', /^\/backup\/([^/]+)$/, 'BACKUP_DELETED'],
];

function settingsActivityLogger(req, res, next) {
  if (req.method === 'GET' || req.path === '/reset') return next(); // reset logs itself (SYSTEM_RESET)
  const before = settingsSnapshot();
  const json = res.json.bind(res);
  res.json = (body) => {
    res.locals.activityBody = body;
    return json(body);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const backup = BACKUP_ROUTES.find(([m, re]) => m === req.method && re.test(req.path));
    if (backup) {
      const body = res.locals.activityBody || {};
      const match = req.path.match(backup[1]);
      logActivity({
        userId: req.user.id,
        action: backup[2],
        entityType: 'BACKUP',
        details: { file: (match && match[1]) || body.filename || body.backup || null, path: body.path || undefined, username: req.user.username },
      });
      return;
    }
    const after = settingsSnapshot();
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !IGNORED_SETTING_KEYS.has(k) && before[k] !== after[k]);
    if (keys.length === 0) return;
    const show = (k, v) => (SECRET_SETTING_KEYS.has(k) ? (v ? '(set)' : '(empty)') : v ?? null);
    logActivity({
      userId: req.user.id,
      action: 'SETTINGS_CHANGED',
      entityType: 'SETTINGS',
      details: { keys, username: req.user.username },
      before: Object.fromEntries(keys.map((k) => [k, show(k, before[k])])),
      after: Object.fromEntries(keys.map((k) => [k, show(k, after[k])])),
    });
  });
  next();
}

module.exports = { logActivity, scrub, changedFields, settingsActivityLogger };
