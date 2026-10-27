// LAST RESORT: the admin password and the recovery key are both lost.
// Run on the shop PC with the app CLOSED (double-click reset-admin-password.cmd next to this file):
//   node reset-admin-password.js [--user admin] [--db <path to sop.db>]
// It makes a verified backup first, then gives the admin account a one-time password that must be changed at the
// next login, ends every login of that account, and records the reset in the activity log.
// Anyone who can run this can already read the database file: Windows access to the PC is the real protection.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { PRODUCT_NAME } = require('../src/brand');
const { installedDataDir, DB_FILE } = require('../src/appData');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (message) => {
  console.error(`\nNOT DONE: ${message}\nNothing was changed.\n`);
  process.exit(1);
};

// Same place as the installed app: DATA_DIR if set (that is how the app tells its backend), else Electron's
// userData\data, %APPDATA%\sos\data (backend/src/appData.js)
function defaultDbPath() {
  return path.join(process.env.DATA_DIR || installedDataDir(), DB_FILE);
}

const appAnswers = () =>
  new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4000/api/health', { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

// One-time password: 12 characters without look-alikes, e.g. K7QM-3XRA-PWZ9
function oneTimePassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  while (out.length < 12) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < alphabet.length * Math.floor(256 / alphabet.length)) out += alphabet[byte % alphabet.length];
  }
  return out.match(/.{4}/g).join('-');
}

(async () => {
  const dbPath = path.resolve(opt('--db') || defaultDbPath());
  const username = opt('--user') || 'admin';
  console.log(`Shop database: ${dbPath}`);
  if (!fs.existsSync(dbPath)) fail('the shop database was not found there. Use --db <path to sop.db>.');

  // The app must be closed: it holds the database open
  if (await appAnswers()) fail(`the app is running. Close ${PRODUCT_NAME} and run this again.`);
  if (process.platform === 'win32') {
    try {
      // The exe is named after the build's productName: the current one, or the one before the Vexora rename
      const running = execSync('tasklist /FO CSV /NH', { encoding: 'utf8' }).match(/"(Vexora Labs Shop Operating System|Shop Operating Platform)\.exe"/i);
      if (running) {
        fail(`"${running[1]}.exe" is still running. Close it and run this again.`);
      }
    } catch (_) {
      // tasklist not available: the port check above still applies
    }
  }
  for (const suffix of ['-journal', '-wal']) {
    if (fs.existsSync(dbPath + suffix)) fail(`${path.basename(dbPath + suffix)} exists: the database was not closed cleanly. Open and close the app once, then try again.`);
  }

  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma('foreign_keys = ON');
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
    db.close();
    fail('the database failed its integrity check. Restore a backup instead.');
  }
  const user = db
    .prepare('SELECT u.id, u.username, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?')
    .get(username);
  if (!user) {
    db.close();
    fail(`there is no user named "${username}". Use --user <admin username>.`);
  }
  if (user.role !== 'ADMIN') {
    db.close();
    fail(`"${username}" is not an admin. This tool only resets admin accounts; an admin can reset everyone else in Users.`);
  }

  // Verified backup first
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `pre_admin_reset_${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(backupPath);
  {
    const check = new Database(backupPath, { readonly: true });
    const ok = check.pragma('integrity_check', { simple: true }) === 'ok'
      && check.prepare('SELECT COUNT(*) c FROM users').get().c === db.prepare('SELECT COUNT(*) c FROM users').get().c
      && check.prepare('SELECT COUNT(*) c FROM invoices').get().c === db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
    check.close();
    if (!ok) {
      db.close();
      fail(`the backup could not be verified (${backupPath}).`);
    }
  }

  const code = oneTimePassword();
  const columns = db.prepare("SELECT name FROM pragma_table_info('users')").all().map((c) => c.name);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?').run(bcrypt.hashSync(code, 10), user.id);
    if (columns.includes('must_change_password')) db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(user.id);
    if (columns.includes('token_version')) db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(user.id);
    db.prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, 'ADMIN_PASSWORD_RESET_OFFLINE', 'USER', ?, ?)")
      .run(user.id, user.id, JSON.stringify({ username: user.username, by: 'on-PC reset tool', windows_user: os.userInfo().username, backup: path.basename(backupPath) }));
  })();
  db.close();

  console.log(`
Done. Backup saved first: ${backupPath}

  User:               ${user.username}
  One-time password:  ${code}

Open the app and log in with this password. You will be asked to choose a new one straight away.
Then go to Settings > Security and create a new recovery key, and write it down.
`);
})();
