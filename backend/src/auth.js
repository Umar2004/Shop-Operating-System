const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const passwords = require('./passwords');
const { logActivity } = require('./activityLog');

const router = express.Router();

// Each install signs logins with its own random secret, kept next to the database (not inside it, so a
// backup restored on another PC does not carry it). Created on first start; JWT_SECRET still overrides it.
const secretFile = path.join(path.dirname(db.name), '.jwt-secret');

function writeNewSecret() {
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch (err) {
    // Still secure, but logins will not survive a restart until the file can be written
    console.error(`Could not save login secret to ${secretFile}: ${err.message}`);
  }
  return secret;
}

function loadOrCreateJwtSecret() {
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (_) {
    // not created yet
  }
  return writeNewSecret();
}

let JWT_SECRET = process.env.JWT_SECRET || loadOrCreateJwtSecret();
// A login lasts until the user logs out (or is ended below); the token is renewed while the app is used
// (GET /api/auth/me), so this only ends a login on a PC nobody has opened for a month
const JWT_EXPIRES_IN = '30d';

// Every request is checked against the users table: a login ends at once when the user is deactivated or
// deleted, or their token_version moves on (password or role change, log out, reset, restore)
function endLogins(userId) {
  if (userId === undefined) {
    db.prepare('UPDATE users SET token_version = token_version + 1').run();
  } else {
    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  }
}

// After reset or restore: no token signed before survives, whatever database it is checked against
function endAllLogins() {
  endLogins();
  if (!process.env.JWT_SECRET) {
    JWT_SECRET = writeNewSecret();
  }
}

function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role_name,
    tv: user.token_version || 0,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const ALL_PAGES = ['dashboard', 'sell', 'products', 'categories', 'customers', 'invoices', 'expenses', 'reports', 'settings', 'users'];

function permissionsFor(user) {
  // ADMIN has access to all pages
  if (user.role_name === 'ADMIN') return ALL_PAGES;
  return db
    .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?')
    .all(user.id)
    .map((p) => p.permission_key);
}

const findUser = (where, value) =>
  db
    .prepare(
      `
      SELECT u.id, u.username, u.password_hash, u.is_active, u.token_version, u.must_change_password, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE ${where}
    `
    )
    .get(value);

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role_name,
  permissions: permissionsFor(user),
  mustChangePassword: !!user.must_change_password,
  // an admin without a recovery key is asked to create one (it is the way back in if the password is lost)
  recoveryKeyMissing: user.role_name === 'ADMIN' && !passwords.recoveryKeyInfo(),
});

const tooManyAttempts = (res, seconds) =>
  res.status(429).json({
    code: 'TOO_MANY_ATTEMPTS',
    retryAfter: seconds,
    message: `Too many wrong attempts. Try again in ${seconds >= 60 ? `${Math.ceil(seconds / 60)} minute(s)` : `${seconds} second(s)`}.`,
  });

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const key = passwords.attemptKey('login', username);
  const wait = passwords.waitSeconds(key);
  if (wait > 0) {
    return tooManyAttempts(res, wait);
  }

  const user = findUser('u.username = ?', username);
  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    const after = passwords.recordFailure(key);
    logActivity({
      userId: user ? user.id : null,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: user ? user.id : null,
      details: { username: String(username).slice(0, 64), reason: !user ? 'unknown user' : !user.is_active ? 'inactive user' : 'wrong password', attempt: after.fails, locked_for_seconds: after.waitSeconds || undefined },
    });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  passwords.recordSuccess(key);
  logActivity({ userId: user.id, action: 'LOGIN', entityType: 'USER', entityId: user.id, details: { username: user.username } });
  res.json({
    token: generateToken(user),
    user: publicUser(user),
  });
});

// Forgot password (admin accounts only): the recovery key written down at setup sets a new password.
// The key is used up: a new one is returned and must be written down again.
router.post('/recover', (req, res) => {
  const { username, recoveryKey, newPassword } = req.body || {};
  if (!username || !recoveryKey || !newPassword) {
    return res.status(400).json({ message: 'Username, recovery key and a new password are required' });
  }
  const key = passwords.attemptKey('recover', 'any'); // one limit for all names: the key is the secret
  const wait = passwords.waitSeconds(key);
  if (wait > 0) {
    return tooManyAttempts(res, wait);
  }
  const user = findUser('u.username = ?', username);
  if (!user || user.role_name !== 'ADMIN' || !passwords.recoveryKeyMatches(recoveryKey)) {
    passwords.recordFailure(key);
    logActivity({ userId: user ? user.id : null, action: 'RECOVERY_FAILED', entityType: 'USER', entityId: user ? user.id : null, details: { username: String(username).slice(0, 64) } });
    return res.status(401).json({ message: 'That username and recovery key do not match an admin account' });
  }
  const problem = passwords.passwordProblem(newPassword, user.username);
  if (problem) {
    return res.status(400).json({ message: problem });
  }
  passwords.recordSuccess(key);
  let newKey;
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, is_active = 1, token_version = token_version + 1 WHERE id = ?')
      .run(passwords.hashPassword(newPassword), user.id);
    newKey = passwords.setRecoveryKey(user.id);
    logActivity({ userId: user.id, action: 'PASSWORD_RECOVERED', entityType: 'USER', entityId: user.id, details: { username: user.username, recovery_key_replaced: true } });
  })();
  const fresh = findUser('u.id = ?', user.id);
  res.json({ token: generateToken(fresh), user: publicUser(fresh), newRecoveryKey: newKey });
});

// Middleware to verify JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token' });
  }
  const token = authHeader.substring(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  const user = findUser('u.id = ?', decoded.id);
  if (!user || !user.is_active || decoded.tv !== user.token_version) {
    return res.status(401).json({ code: 'LOGIN_ENDED', message: 'Your login has ended. Please log in again.' });
  }
  // Role and name come from the database, so a role change applies at once
  req.user = { id: user.id, username: user.username, role: user.role_name };
  // Until a required new password is set, nothing else can be done with this login
  const url = req.originalUrl.split('?')[0];
  if (user.must_change_password && !['/api/auth/me', '/api/auth/logout', '/api/auth/change-password'].includes(url)) {
    return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Please set a new password first.' });
  }
  next();
}

// Who am I: fresh role and page permissions, and a renewed token (keeps an open app logged in)
router.get('/me', authMiddleware, (req, res) => {
  const user = findUser('u.id = ?', req.user.id);
  res.json({ token: generateToken(user), user: publicUser(user) });
});

// Log out: the token stops working on the server too, not just in this window
router.post('/logout', authMiddleware, (req, res) => {
  endLogins(req.user.id);
  logActivity({ userId: req.user.id, action: 'LOGOUT', entityType: 'USER', entityId: req.user.id, details: { username: req.user.username } });
  res.json({ success: true });
});

// Change my password (needs the current one). Ends every other login of this user; this one gets a new token.
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = findUser('u.id = ?', req.user.id);
  const key = passwords.attemptKey('change', user.username);
  const wait = passwords.waitSeconds(key);
  if (wait > 0) {
    return tooManyAttempts(res, wait);
  }
  if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    passwords.recordFailure(key);
    logActivity({ userId: user.id, action: 'PASSWORD_CHANGE_FAILED', entityType: 'USER', entityId: user.id, details: { reason: 'wrong current password' } });
    return res.status(400).json({ message: 'Current password is not correct' });
  }
  passwords.recordSuccess(key);
  const problem = passwords.passwordProblem(newPassword, user.username);
  if (problem) {
    return res.status(400).json({ message: problem });
  }
  if (bcrypt.compareSync(newPassword, user.password_hash)) {
    return res.status(400).json({ message: 'The new password must be different from the current one' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?')
    .run(passwords.hashPassword(newPassword), user.id);
  logActivity({ userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'USER', entityId: user.id, details: { username: user.username, was_required: !!user.must_change_password } });
  const fresh = findUser('u.id = ?', user.id);
  res.json({ token: generateToken(fresh), user: publicUser(fresh) });
});

// Recovery key: whether one exists (admin), and creating a new one (admin, confirms with their password)
router.get('/recovery-key', authMiddleware, (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
  const info = passwords.recoveryKeyInfo();
  res.json({ exists: !!info, created_at: info ? info.created_at : null });
});

router.post('/recovery-key', authMiddleware, (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' });
  const user = findUser('u.id = ?', req.user.id);
  const key = passwords.attemptKey('change', user.username);
  const wait = passwords.waitSeconds(key);
  if (wait > 0) {
    return tooManyAttempts(res, wait);
  }
  if (!req.body || !req.body.password || !bcrypt.compareSync(req.body.password, user.password_hash)) {
    passwords.recordFailure(key);
    return res.status(400).json({ message: 'Password is not correct' });
  }
  passwords.recordSuccess(key);
  const replaced = !!passwords.recoveryKeyInfo();
  const recoveryKey = passwords.setRecoveryKey(user.id);
  logActivity({ userId: user.id, action: 'RECOVERY_KEY_CREATED', entityType: 'USER', entityId: user.id, details: { replaced_previous_key: replaced } });
  res.json({ recoveryKey });
});

// Role-based guard
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = {
  authRouter: router,
  authMiddleware,
  requireRole,
  endLogins,
  endAllLogins,
};
