const path = require('path');
const Database = require('better-sqlite3');
const os = require('os');
const fs = require('fs');
const { DB_FILE } = require('./appData');

// Path to the SQLite database file (stored locally on the machine)
// In production, use DATA_DIR environment variable if set
// If not set, use user data directory to avoid permission issues in Program Files
let dataDir = process.env.DATA_DIR;

if (!dataDir) {
  // Default to user data directory to avoid permission issues (only when run without the app: the installed app
  // always sets DATA_DIR, to %APPDATA%\sos\data; see appData.js)
  // Windows: %APPDATA%\SOP\data
  // Linux/Mac: ~/.config/SOP/data
  const appName = 'SOP';
  if (process.platform === 'win32') {
    dataDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'data');
  } else {
    dataDir = path.join(os.homedir(), '.config', appName, 'data');
  }
}

const dbPath = path.join(dataDir, DB_FILE);

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
try {
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (error) {
  console.error(`Failed to create database directory: ${dbDir}`, error);
  throw new Error(`Cannot create database directory: ${dbDir}. Error: ${error.message}`);
}

// Create and export a singleton database connection
const db = new Database(dbPath);

// Enforce foreign keys
db.pragma('foreign_keys = ON');

module.exports = db;


