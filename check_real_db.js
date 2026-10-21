const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'backend', 'data', 'sop.db');
const db = new Database(dbPath);
const products = db.prepare('SELECT id, name, current_stock FROM products WHERE current_stock < 0').all();
console.log(JSON.stringify(products, null, 2));
process.exit(0);
