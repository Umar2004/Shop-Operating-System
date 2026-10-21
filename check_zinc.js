const path = require('path');
process.env.DATA_DIR = path.join(__dirname, 'backend', 'data');
const db = require('./backend/src/db');
const products = db.prepare('SELECT id, name, current_stock FROM products WHERE name LIKE ?').all('%Zinc%');
console.log(JSON.stringify(products, null, 2));
process.exit(0);
