const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

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
      SELECT u.id, u.username, u.password_hash, u.is_active, u.token_version, r.name as role_name
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
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = findUser('u.username = ?', username);

  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  res.json({
    token: generateToken(user),
    user: publicUser(user),
  });
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
  res.json({ success: true });
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
