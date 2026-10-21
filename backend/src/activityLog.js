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
  try {
    const body = scrub({ ...details, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
    db.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
      userId,
      action,
      entityType,
      entityId,
      JSON.stringify(body)
    );
  } catch (err) {
    console.error(`Could not write activity log (${action}):`, err.message);
  }
}

module.exports = { logActivity, scrub };
