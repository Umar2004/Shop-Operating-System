const express = require('express');
const db = require('./db');
const { requireRole, endLogins } = require('./auth');
const { passwordProblem, hashPassword } = require('./passwords');
const { logActivity } = require('./activityLog');

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

    // Validate password (a temporary one: the new user chooses their own at the first login)
    const problem = passwordProblem(password, username.trim());
    if (problem) {
      return res.status(400).json({ message: problem });
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

    // Create user
    const isActiveValue = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    const result = db
      .prepare(
        'INSERT INTO users (username, password_hash, role_id, is_active, must_change_password) VALUES (?, ?, ?, ?, 1)'
      )
      .run(username.trim(), hashPassword(password), roleIdNum, isActiveValue);
    logActivity({
      userId: req.user.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: Number(result.lastInsertRowid),
      after: { username: username.trim(), role: role.name, is_active: isActiveValue },
    });

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

// Update user: everything is checked first, then applied in one transaction and written to the activity log
router.put('/:id', requireRole(['ADMIN']), (req, res) => {
  try {
    const { username, password, role_id, is_active } = req.body;
    const userId = parseInt(req.params.id, 10);

    const existingUser = db
      .prepare('SELECT u.id, u.username, u.role_id, u.is_active, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?')
      .get(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isAdminAccount = existingUser.username === 'admin';

    const newUsername = username !== undefined && username !== null ? String(username).trim() : existingUser.username;
    // Prevent changing admin username
    if (isAdminAccount && newUsername !== 'admin') {
      return res.status(400).json({ message: 'Cannot change admin username' });
    }
    if (newUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }
    const usernameTaken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(newUsername, userId);
    if (usernameTaken) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Setting someone else's password gives them a temporary one: they must choose their own at the next login
    const settingPassword = typeof password === 'string' && password.trim() !== '';
    if (settingPassword) {
      if (userId === req.user.id) {
        return res.status(400).json({ message: 'To change your own password, use "Change my password" (it asks for your current password)' });
      }
      const problem = passwordProblem(password, newUsername);
      if (problem) {
        return res.status(400).json({ message: problem });
      }
    }

    let newRole = { id: existingUser.role_id, name: existingUser.role_name };
    if (role_id !== undefined && role_id !== null && role_id !== '') {
      const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(Number(role_id));
      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      // Prevent changing admin role
      if (isAdminAccount && role.name !== 'ADMIN') {
        return res.status(400).json({ message: 'Cannot change admin role' });
      }
      newRole = role;
    }

    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : existingUser.is_active;
    // Prevent deactivating admin
    if (isAdminAccount && !newActive) {
      return res.status(400).json({ message: 'Cannot deactivate admin user' });
    }

    db.transaction(() => {
      db.prepare('UPDATE users SET username = ?, role_id = ?, is_active = ? WHERE id = ?').run(newUsername, newRole.id, newActive, userId);
      if (settingPassword) {
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(password), userId);
      }
      // A new password, a new role or deactivation ends every login of that user at once
      if (settingPassword || newRole.id !== existingUser.role_id || (!newActive && existingUser.is_active)) {
        endLogins(userId);
      }

      const log = (action, extra) => logActivity({ userId: req.user.id, action, entityType: 'USER', entityId: userId, ...extra });
      if (newUsername !== existingUser.username) {
        log('USER_RENAMED', { before: { username: existingUser.username }, after: { username: newUsername } });
      }
      if (newRole.id !== existingUser.role_id) {
        log('ROLE_CHANGED', { details: { username: newUsername }, before: { role: existingUser.role_name }, after: { role: newRole.name } });
      }
      if (newActive !== existingUser.is_active) {
        log(newActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', { details: { username: newUsername } });
      }
      if (settingPassword) {
        log('PASSWORD_RESET_BY_ADMIN', { details: { username: newUsername, must_change_at_next_login: true } });
      }
    })();

    // Return updated user
    const updatedUser = db
      .prepare(
        `
      SELECT u.id, u.username, u.is_active, u.created_at, u.must_change_password, r.id as role_id, r.name as role_name, r.description as role_description
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

    // A user who has ever logged in, sold, opened a day or recorded anything stays on record (their name is on
    // that history): the database refuses the delete, and they can be deactivated instead
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        logActivity({ userId: req.user.id, action: 'USER_DELETED', entityType: 'USER', entityId: userId, before: { username: user.username } });
      })();
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(409).json({
          code: 'USER_HAS_HISTORY',
          message: `${user.username} has history in the shop records, so they can't be deleted. Deactivate them instead: they won't be able to log in.`,
        });
      }
      throw err;
    }

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
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const current = () =>
      db
        .prepare('SELECT permission_key FROM user_permissions WHERE user_id = ? ORDER BY permission_key')
        .all(userId)
        .map((p) => p.permission_key);
    const before = current();

    db.transaction(() => {
      // Delete existing permissions
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);

      // Add new permissions
      if (permissions && Array.isArray(permissions) && permissions.length > 0) {
        const insertPermission = db.prepare(
          'INSERT OR IGNORE INTO user_permissions (user_id, permission_key) VALUES (?, ?)'
        );
        permissions.forEach((permission) => {
          insertPermission.run(userId, permission);
        });
      }
    })();

    // Return updated permissions
    const updatedPermissions = current();
    if (before.join(',') !== updatedPermissions.join(',')) {
      logActivity({
        userId: req.user.id,
        action: 'PERMISSIONS_CHANGED',
        entityType: 'USER',
        entityId: userId,
        details: { username: user.username },
        before: { pages: before },
        after: { pages: updatedPermissions },
      });
    }

    res.json(updatedPermissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  usersRouter: router,
};

