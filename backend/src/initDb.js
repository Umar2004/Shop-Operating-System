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

  // Activity log: indexes for the Activity Log page filters (newest first, by user, by action, by record)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
  `);

  // Logins carry the user's token_version; moving it on ends every login of that user (see auth.js)
  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Ignore if column already exists
  }

  // Passwords: a user flagged here must set a new password before doing anything else (see auth.js)
  try {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // Ignore if column already exists
  }
  // The recovery key (only its hash): lets the admin set a new password without the old one
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_recovery (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER
    );
  `);
  // The day (session) a payment was taken in, so a credit repayment counts in today's drawer
  // rather than on the day of the invoice it pays off (older rows stay NULL; see balances.sessionMoney)
  try {
    db.exec('ALTER TABLE payments ADD COLUMN session_id INTEGER');
  } catch (e) {
    // Ignore if column already exists
  }

  // Indexes for the lookups every sale, receipt, report and the start-up check below make (audit fix-01).
  // CREATE INDEX IF NOT EXISTS only adds them: no data changes, and an older version simply ignores them.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice   ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product   ON invoice_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer       ON invoices(customer_id, date_time);
    CREATE INDEX IF NOT EXISTS idx_invoices_date           ON invoices(date_time);
    CREATE INDEX IF NOT EXISTS idx_invoices_session        ON invoices(session_id);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice        ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_customer       ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_session        ON payments(session_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_session        ON expenses(session_id);
    CREATE INDEX IF NOT EXISTS idx_products_status_name    ON products(status, name);
    CREATE INDEX IF NOT EXISTS idx_sessions_status         ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  `);

  /* Balance adjustments: explicit write-offs, charges and refunds (see balances.js) */
  const hadAdjustments = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'balance_adjustments'")
    .get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS balance_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      invoice_id INTEGER,
      type TEXT NOT NULL CHECK (type IN ('WRITE_OFF', 'CHARGE', 'REFUND')),
      amount REAL NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
      payment_type TEXT,
      session_id INTEGER,
      provisional INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_balance_adjustments_customer ON balance_adjustments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_balance_adjustments_invoice ON balance_adjustments(invoice_id);
  `);
  if (!hadAdjustments) {
    carryOverBalances();
  }

  /* Invoice statuses and customer balances always follow the money and the adjustments */
  try {
    const { refreshAll } = require('./balances');
    const fixed = refreshAll();
    if (fixed.statuses || fixed.balances) {
      console.log(`Start-up check: corrected ${fixed.statuses} invoice status(es) and ${fixed.balances} balance(s)`);
    }
  } catch (e) {
    console.error('Failed to check invoice statuses and balances:', e);
  }
}

// Once, when upgrading from a version without adjustments: the old app lowered balances with no record
// (forgiven debts set by changing the invoice status). Keep every balance exactly as the old app showed it
// by recording the difference as PROVISIONAL adjustments, until the owner's credit review replaces them.
function carryOverBalances() {
  const { customerBalance, toCents } = require('./balances');
  const author = db.prepare("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN' ORDER BY u.id LIMIT 1").get()
    || db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const customers = db.prepare('SELECT id, current_balance FROM customers').all();
  if (!author || customers.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO balance_adjustments (customer_id, type, amount, reason, provisional, created_by) VALUES (?, ?, ?, ?, 1, ?)`
  );
  let rows = 0;
  db.transaction(() => {
    for (const c of customers) {
      const byRecords = toCents(customerBalance(c.id)); // the table is still empty here
      const shown = toCents(c.current_balance);
      if (byRecords > Math.max(0, shown)) {
        insert.run(c.id, 'WRITE_OFF', (byRecords - Math.max(0, shown)) / 100,
          'Carried over at upgrade: cleared in the old version without payment (pending credit review)', author.id);
        rows += 1;
      } else if (shown > 0 && byRecords < shown) {
        insert.run(c.id, 'CHARGE', (shown - byRecords) / 100,
          'Carried over at upgrade: owed in the old version but on no invoice (pending credit review)', author.id);
        rows += 1;
      }
    }
    db.prepare(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, 'CREDIT_CARRY_OVER', 'CUSTOMER', NULL, ?)`
    ).run(author.id, JSON.stringify({ provisional_adjustments: rows, customers: customers.length }));
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('credit.review_pending', 'true')").run();
  })();
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
  // Anyone still on the factory password must change it at the next login (includes a freshly seeded admin)
  try {
    require('./passwords').flagDefaultPasswords();
  } catch (e) {
    console.error('Failed to check for default passwords:', e);
  }
  pruneActivityLog();
}

// Activity log retention: keep 2 years of records, and 1 year of logins/logouts/failed logins (the bulk of the
// rows). Settings activity.retention_days / activity.login_retention_days change it; nothing newer is touched.
function pruneActivityLog() {
  try {
    const days = (key, fallback) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      const n = row ? parseInt(row.value, 10) : NaN;
      return Number.isFinite(n) ? Math.max(90, n) : fallback; // never less than 90 days
    };
    const all = days('activity.retention_days', 730);
    const logins = Math.min(all, days('activity.login_retention_days', 365));
    const old = db.prepare("DELETE FROM audit_logs WHERE created_at < datetime('now', ?)").run(`-${all} days`).changes;
    const oldLogins = db
      .prepare("DELETE FROM audit_logs WHERE action IN ('LOGIN', 'LOGOUT', 'LOGIN_FAILED') AND created_at < datetime('now', ?)")
      .run(`-${logins} days`).changes;
    if (old + oldLogins > 0) {
      require('./activityLog').logActivity({
        action: 'ACTIVITY_LOG_PRUNED',
        entityType: 'SYSTEM',
        details: { removed: old + oldLogins, older_than_days: all, logins_older_than_days: logins },
      });
    }
  } catch (e) {
    console.error('Failed to prune the activity log:', e);
  }
}

module.exports = {
  initDb,
};


