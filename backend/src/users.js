const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireRole, endLogins } = require('./auth');

const router = express.Router();

// Get all users
router.get('/', requireRole(['ADMIN']), (req, res) => {
  try {
    const users = db
      .prepare(
        `
      SELECT u.id, u.username, u.is_active, u.created_at, r.id as role_id, r.name as role_name, r.description as role_description
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC
    `
      )
      .all();

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all roles
router.get('/roles', requireRole(['ADMIN']), (req, res) => {
  try {
    const roles = db.prepare('SELECT id, name, description FROM roles ORDER BY name').all();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single user
router.get('/:id', requireRole(['ADMIN']), (req, res) => {
  try {
    const user = db
      .prepare(
        `
      SELECT u.id, u.username, u.is_active, u.created_at, r.id as role_id, r.name as role_name, r.description as role_description
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `
      )
      .get(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create user
router.post('/', requireRole(['ADMIN']), (req, res) => {
  try {
    const { username, password, role_id, is_active } = req.body;

    if (!username || !password || role_id === undefined || role_id === null || role_id === '') {
      return res.status(400).json({ message: 'Username, password, and role are required' });
    }

    // Validate username
    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    // Validate password
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Convert role_id to number and validate role exists
    const roleIdNum = Number(role_id);
    if (isNaN(roleIdNum)) {
      return res.status(400).json({ message: 'Invalid role ID format' });
    }

    const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(roleIdNum);
    if (!role) {
      return res.status(400).json({ message: `Invalid role. Role ID ${roleIdNum} does not exist` });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Create user
    const isActiveValue = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    
    const result = db
      .prepare(
        'INSERT INTO users (username, password_hash, role_id, is_active) VALUES (?, ?, ?, ?)'
      )
      .run(username.trim(), passwordHash, roleIdNum, isActiveValue);

    const newUser = db
      .prepare(
        `
      SELECT u.id, u.username, u.is_active, u.created_at, r.id as role_id, r.name as role_name, r.description as role_description
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `
      )
      .get(result.lastInsertRowid);

    if (!newUser) {
      return res.status(500).json({ message: 'User created but failed to retrieve user data' });
    }
    res.status(201).json(newUser);
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ message: err.message || 'Failed to create user' });
  }
});

// Update user
router.put('/:id', requireRole(['ADMIN']), (req, res) => {
  try {
    const { username, password, role_id, is_active } = req.body;
    const userId = parseInt(req.params.id, 10);

    // Check if user exists
    const existingUser = db.prepare('SELECT id, username, role_id, is_active FROM users WHERE id = ?').get(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent changing admin username
    if (existingUser.username === 'admin' && username !== 'admin') {
      return res.status(400).json({ message: 'Cannot change admin username' });
    }

    // Update username if provided
    if (username !== undefined) {
      if (username.length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
      }

      // Check if username is taken by another user
      const usernameTaken = db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(username, userId);
      if (usernameTaken) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
    }

    // Update password if provided
    if (password !== undefined && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const passwordHash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
      // A new password ends every login made with the old one
      endLogins(userId);
    }

    // Update role if provided
    if (role_id !== undefined) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(role_id);
      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      // Prevent changing admin role
      if (existingUser.username === 'admin') {
        const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('ADMIN');
        if (role_id !== adminRole.id) {
          return res.status(400).json({ message: 'Cannot change admin role' });
        }
      }

      db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(role_id, userId);
      if (Number(role_id) !== existingUser.role_id) {
        endLogins(userId);
      }
    }

    // Update active status if provided
    if (is_active !== undefined) {
      // Prevent deactivating admin
      if (existingUser.username === 'admin' && !is_active) {
        return res.status(400).json({ message: 'Cannot deactivate admin user' });
      }
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, userId);
      if (!is_active && existingUser.is_active) {
        endLogins(userId);
      }
    }

    // Return updated user
    const updatedUser = db
      .prepare(
        `
      SELECT u.id, u.username, u.is_active, u.created_at, r.id as role_id, r.name as role_name, r.description as role_description
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `
      )
      .get(userId);

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete user
router.delete('/:id', requireRole(['ADMIN']), (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Check if user exists
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting admin
    if (user.username === 'admin') {
      return res.status(400).json({ message: 'Cannot delete admin user' });
    }

    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get available page permissions
router.get('/permissions/available', requireRole(['ADMIN']), (req, res) => {
  try {
    const permissions = [
      { key: 'dashboard', label: 'Dashboard', description: 'View dashboard and statistics' },
      { key: 'sell', label: 'Sell', description: 'Create invoices and process sales' },
      { key: 'products', label: 'Products', description: 'Manage products and inventory' },
      { key: 'categories', label: 'Categories', description: 'Manage product categories' },
      { key: 'customers', label: 'Customers', description: 'Manage customers' },
      { key: 'expenses', label: 'Expenses', description: 'Record and manage expenses' },
      { key: 'reports', label: 'Reports', description: 'View sales reports and analytics' },
      { key: 'settings', label: 'Settings', description: 'Access system settings' },
    ];
    res.json(permissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user permissions
router.get('/:id/permissions', requireRole(['ADMIN']), (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const permissions = db
      .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?')
      .all(userId)
      .map((p) => p.permission_key);
    res.json(permissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update user permissions
router.put('/:id/permissions', requireRole(['ADMIN']), (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { permissions } = req.body;

    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete existing permissions
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);

    // Add new permissions
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const insertPermission = db.prepare(
        'INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)'
      );
      permissions.forEach((permission) => {
        insertPermission.run(userId, permission);
      });
    }

    // Return updated permissions
    const updatedPermissions = db
      .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ?')
      .all(userId)
      .map((p) => p.permission_key);

    res.json(updatedPermissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  usersRouter: router,
};

