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
function loadOrCreateJwtSecret() {
  const secretFile = path.join(path.dirname(db.name), '.jwt-secret');
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (_) {
    // not created yet
  }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch (err) {
    // Still secure, but logins will not survive a restart until the file can be written
    console.error(`Could not save login secret to ${secretFile}: ${err.message}`);
  }
  return secret;
}

const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateJwtSecret();
const JWT_EXPIRES_IN = '8h';

function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role_name,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = db
    .prepare(
      `
      SELECT u.id, u.username, u.password_hash, u.is_active, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ?
    `
    )
    .get(username);

  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = generateToken(user);
  
  // Get user permissions (ADMIN has all permissions)
  let permissions = [];
  if (user.role_name === 'ADMIN') {
    // Admin has access to all pages
    permissions = ['dashboard', 'sell', 'products', 'categories', 'customers', 'expenses', 'reports', 'settings', 'users'];
  } else {
    // Get user-specific permissions
    const userPerms = db
      .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?')
      .all(user.id)
      .map((p) => p.permission_key);
    permissions = userPerms;
  }
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role_name,
      permissions: permissions,
    },
  });
});

// Middleware to verify JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

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
};


