const db = require('./db');
const bcrypt = require('bcryptjs');

function runMigrations() {
  // Users, roles, permissions
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER,
      unit TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      opening_stock REAL NOT NULL DEFAULT 0,
      current_stock REAL NOT NULL DEFAULT 0,
      minimum_stock REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      credit_limit REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_date TEXT NOT NULL,
      status TEXT NOT NULL, -- OPEN / CLOSED
      opening_cash REAL NOT NULL DEFAULT 0,
      closing_cash_expected REAL,
      closing_cash_actual REAL,
      cash_difference REAL,
      opened_by INTEGER NOT NULL,
      closed_by INTEGER,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (opened_by) REFERENCES users(id),
      FOREIGN KEY (closed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      session_id INTEGER,
      date_time TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      total_amount REAL NOT NULL,
      total_cost REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL, -- PAID / PARTIAL / CREDIT
      created_by INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      payment_type TEXT NOT NULL, -- CASH / CARD / CREDIT
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- OPENING / SALE / ADJUSTMENT / RETURN
      quantity_change REAL NOT NULL,
      reason TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      PRIMARY KEY (user_id, permission_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Lightweight schema evolution for products
  try {
    db.exec('ALTER TABLE products ADD COLUMN product_code TEXT UNIQUE');
  } catch (e) {
    // Ignore if column already exists
  }
  try {
    db.exec('ALTER TABLE products ADD COLUMN mfd TEXT');
  } catch (e) {
    // Ignore if column already exists
  }
  try {
    db.exec('ALTER TABLE products ADD COLUMN exp TEXT');
  } catch (e) {
    // Ignore if column already exists
  }

  // Add additional_amount column to invoices table
  try {
    db.exec('ALTER TABLE invoices ADD COLUMN additional_amount REAL NOT NULL DEFAULT 0');
  } catch (e) {
    // Ignore if column already exists
  }

  // Add discount columns to invoice_items table
  try {
    db.exec('ALTER TABLE invoice_items ADD COLUMN discount REAL NOT NULL DEFAULT 0');
  } catch (e) {
    // Ignore if column already exists
  }
  try {
    db.exec("ALTER TABLE invoice_items ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'amount'");
  } catch (e) {
    // Ignore if column already exists
  }

  // Fix any NULL current_balance values
  try {
    db.exec(`
      UPDATE customers 
      SET current_balance = 0 
      WHERE current_balance IS NULL
    `);
  } catch (e) {
    // Ignore if error (table might not exist yet)
  }

  // Add opening_balance column to customers table
  try {
    db.exec('ALTER TABLE customers ADD COLUMN opening_balance REAL NOT NULL DEFAULT 0');
  } catch (e) {
    // Ignore if column already exists
  }

  // Create user_permissions table if it doesn't exist (migration)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id INTEGER NOT NULL,
        permission_key TEXT NOT NULL,
        PRIMARY KEY (user_id, permission_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch (e) {
    // Ignore if error (table already exists)
  }

  /* Migrate payments table to support nullable invoice_id, add note column and customer_id */
  try {
    const tableInfo = db.prepare('PRAGMA table_info(payments)').all();
    if (tableInfo.length > 0) {
      const hasCustomerId = tableInfo.some(col => col.name === 'customer_id');
      const hasNote = tableInfo.some(col => col.name === 'note');
      const invoiceIdCol = tableInfo.find(col => col.name === 'invoice_id');
      const isNullable = invoiceIdCol && invoiceIdCol.notnull === 0;

      if (!hasCustomerId || !hasNote || !isNullable) {
        db.exec('PRAGMA foreign_keys=OFF');
        db.exec(`
          CREATE TABLE payments_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            invoice_id INTEGER,
            payment_type TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
          )
        `);
        
        // Try to migrate data, joining with invoices to get customer_id
        db.exec(`
          INSERT INTO payments_new (id, customer_id, invoice_id, payment_type, amount, created_at)
          SELECT p.id, i.customer_id, p.invoice_id, p.payment_type, p.amount, p.created_at 
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
        `);
        
        db.exec('DROP TABLE payments');
        db.exec('ALTER TABLE payments_new RENAME TO payments');
        db.exec('PRAGMA foreign_keys=ON');
      }
    }
  } catch (e) {
    console.error('Failed to migrate payments table:', e);
  }

  /* Audit and fix invoice statuses that might be incorrect due to CREDIT payments being counted as paid */
  try {
    db.exec(`
      UPDATE invoices
      SET payment_status = CASE 
        WHEN (
          SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) 
          FROM payments 
          WHERE invoice_id = invoices.id
        ) >= total_amount THEN 'PAID'
        WHEN (
          SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) 
          FROM payments 
          WHERE invoice_id = invoices.id
        ) > 0 THEN 'PARTIAL'
        ELSE 'CREDIT'
      END
      WHERE (
        SELECT COALESCE(SUM(CASE WHEN payment_type != 'CREDIT' THEN amount ELSE 0 END), 0) 
        FROM payments 
        WHERE invoice_id = invoices.id
      ) < total_amount AND payment_status = 'PAID'
    `);
  } catch (e) {
    console.error('Failed to audit invoice statuses:', e);
  }
}

function seedDefaults() {
  // Seed roles
  const existingRoles = db.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (existingRoles.count === 0) {
    const insertRole = db.prepare(
      'INSERT INTO roles (name, description) VALUES (?, ?)'
    );
    insertRole.run('ADMIN', 'Full access to all features');
    insertRole.run('CASHIER', 'Can create invoices and manage basic operations');
    insertRole.run('MANAGER', 'Can view reports and manage products/customers');
  }

  // Seed admin user if none exists
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count === 0) {
    const adminRole = db
      .prepare('SELECT id FROM roles WHERE name = ?')
      .get('ADMIN');
    const passwordHash = bcrypt.hashSync('admin', 10); // Default password; should be changed on first login
    db.prepare(
      'INSERT INTO users (username, password_hash, role_id, is_active) VALUES (?, ?, ?, 1)'
    ).run('admin', passwordHash, adminRole.id);
  }

  // Seed default SMS settings
  const smsEnabled = db.prepare("SELECT key FROM settings WHERE key = 'sms.enabled'").get();
  if (!smsEnabled) {
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('sms.enabled', 'false');
    insertSetting.run('sms.provider', 'GENERIC'); // GENERIC or TWILIO
    insertSetting.run('sms.api_url', 'https://api.example.com/send?to={to}&msg={message}&sender={sender}&key={key}');
    insertSetting.run('sms.api_key', '');
    insertSetting.run('sms.sender_id', '0707256618');
  }
}

function initDb() {
  runMigrations();
  seedDefaults();
}

module.exports = {
  initDb,
};


