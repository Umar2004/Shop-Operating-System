const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

// ---- password rules -------------------------------------------------------------------------------------------
const MIN_LENGTH = 8;

// Returns an error message, or null when the password is acceptable
function passwordProblem(password, username) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  const lower = password.toLowerCase();
  if (username && lower === String(username).toLowerCase()) {
    return 'Password must not be the same as the username';
  }
  if (['admin', 'password', '12345678', '123456789', 'admin123', 'password1'].includes(lower)) {
    return 'That password is too easy to guess';
  }
  return null;
}

const hashPassword = (password) => bcrypt.hashSync(password, 10);

// Flags every user whose password is still the factory one ('admin') or their own username
function flagDefaultPasswords() {
  let flagged = 0;
  for (const u of db.prepare('SELECT id, username, password_hash FROM users WHERE must_change_password = 0').all()) {
    if (bcrypt.compareSync('admin', u.password_hash) || bcrypt.compareSync(u.username, u.password_hash)) {
      db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(u.id);
      flagged += 1;
    }
  }
  return flagged;
}

// ---- recovery key: shown once, only its hash is kept ------------------------------------------------------------
// 20 characters from an alphabet without look-alikes (no 0/O, 1/I/L): about 100 bits, written as 4 groups of 5
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newRecoveryKey() {
  let raw = '';
  while (raw.length < 20) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < KEY_ALPHABET.length * Math.floor(256 / KEY_ALPHABET.length)) raw += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  }
  return raw.match(/.{5}/g).join('-');
}

const normalizeKey = (key) => String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function recoveryKeyInfo() {
  return db.prepare('SELECT created_at, created_by FROM auth_recovery WHERE id = 1').get() || null;
}

// Creates (or replaces) the recovery key; returns the key to show once
function setRecoveryKey(userId) {
  const key = newRecoveryKey();
  db.prepare(
    `INSERT INTO auth_recovery (id, key_hash, created_at, created_by) VALUES (1, ?, datetime('now'), ?)
     ON CONFLICT(id) DO UPDATE SET key_hash = excluded.key_hash, created_at = excluded.created_at, created_by = excluded.created_by`
  ).run(bcrypt.hashSync(normalizeKey(key), 10), userId);
  return key;
}

function recoveryKeyMatches(key) {
  const row = db.prepare('SELECT key_hash FROM auth_recovery WHERE id = 1').get();
  return !!row && bcrypt.compareSync(normalizeKey(key), row.key_hash);
}

// ---- wrong-password limit ---------------------------------------------------------------------------------------
// After 5 wrong attempts for the same name, wait 1 minute; every further miss doubles the wait, up to 15 minutes.
// Kept in memory: a restart clears it, which needs someone at the shop PC anyway.
const FREE_ATTEMPTS = 5;
const MAX_WAIT_MS = 15 * 60 * 1000;
const attempts = new Map();

function attemptKey(kind, username) {
  return `${kind}:${String(username || '').trim().toLowerCase()}`;
}

// Seconds to wait before another try (0 = may try now)
function waitSeconds(key) {
  const a = attempts.get(key);
  if (!a || !a.lockedUntil) return 0;
  return Math.max(0, Math.ceil((a.lockedUntil - Date.now()) / 1000));
}

function recordFailure(key) {
  const a = attempts.get(key) || { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= FREE_ATTEMPTS) {
    a.lockedUntil = Date.now() + Math.min(MAX_WAIT_MS, 60 * 1000 * 2 ** (a.fails - FREE_ATTEMPTS));
  }
  attempts.set(key, a);
  return { fails: a.fails, waitSeconds: waitSeconds(key) };
}

function recordSuccess(key) {
  attempts.delete(key);
}

module.exports = {
  MIN_LENGTH,
  passwordProblem,
  hashPassword,
  flagDefaultPasswords,
  newRecoveryKey,
  normalizeKey,
  recoveryKeyInfo,
  setRecoveryKey,
  recoveryKeyMatches,
  attemptKey,
  waitSeconds,
  recordFailure,
  recordSuccess,
};
