const Database = require('./backend/node_modules/better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'sos', 'data', 'sop.db');
const db = new Database(dbPath);
const products = db.prepare('SELECT id, name, current_stock FROM products WHERE current_stock = -13497 OR current_stock = -1636').all();
console.log(JSON.stringify(products, null, 2));
process.exit(0);
