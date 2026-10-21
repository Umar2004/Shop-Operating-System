const db = require('./backend/src/db');
const products = db.prepare('SELECT id, name, current_stock FROM products').all();
console.log(JSON.stringify(products, null, 2));
process.exit(0);
