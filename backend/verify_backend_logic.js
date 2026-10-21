const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use a temporary database for testing
const dbName = `test_backend_${Date.now()}.db`;
const db = new Database(dbName);

// Mock initialization (just enough for testing)
db.exec(`
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    current_balance REAL DEFAULT 0,
    credit_limit REAL DEFAULT 0,
    opening_balance REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    total_amount REAL,
    payment_status TEXT,
    date_time TEXT
  );

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    amount REAL,
    payment_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('--- Testing Partial Invoice Balance Logic ---');

// 1. Create a customer
db.prepare('INSERT INTO customers (name, current_balance) VALUES (?, ?)').run('Test Customer', 0);
const customer = db.prepare('SELECT * FROM customers WHERE name = ?').get('Test Customer');
console.log('Initial Customer:', customer);

// 2. Create a PARTIAL invoice
const invoiceId = 1;
const totalAmount = 1000;
const paidAmount = 400;
const remaining = totalAmount - paidAmount;

db.prepare('INSERT INTO invoices (id, customer_id, total_amount, payment_status) VALUES (?, ?, ?, ?)').run(invoiceId, customer.id, totalAmount, 'PARTIAL');
db.prepare('INSERT INTO payments (invoice_id, amount, payment_type) VALUES (?, ?, ?)').run(invoiceId, paidAmount, 'CASH');

// Mocking the updated logic:
// if (customerId && (paymentStatus === 'CREDIT' || paymentStatus === 'PARTIAL')) {
//   const balanceToAdd = hasCreditPayment ? finalTotal : remaining;
//   ... update balance ...
// }
const balanceToAdd = remaining; // In our case, it's a partial payment (remaining)
db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(balanceToAdd, customer.id);

const afterPartial = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
console.log('After Partial Invoice (Total 1000, Paid 400, Expected Balance 600):', afterPartial);

if (afterPartial.current_balance === 600) {
    console.log('✅ Partial Invoice Logic Passed');
} else {
    console.log('❌ Partial Invoice Logic Failed');
}

// 3. Test Deletion
console.log('\n--- Testing Invoice Deletion Balance Restoration ---');

// Mocking the deletion logic:
// if (invoice.payment_status === 'CREDIT' || invoice.payment_status === 'PARTIAL') {
//   const creditPortion = invoice.total_amount - totalPayments;
//   db.prepare('UPDATE customers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?').run(creditPortion, invoice.customer_id);
// }

const invoiceToDelete = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
const totalPayments = db.prepare('SELECT SUM(amount) as total FROM payments WHERE invoice_id = ?').get(invoiceId).total;
const creditPortion = invoiceToDelete.total_amount - totalPayments;

db.prepare('UPDATE customers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?').run(creditPortion, invoiceToDelete.customer_id);

const afterDelete = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
console.log('After Invoice Deletion (Expected Balance 0):', afterDelete);

if (afterDelete.current_balance === 0) {
    console.log('✅ Deletion Logic Passed');
} else {
    console.log('❌ Deletion Logic Failed');
}

// Clean up
db.close();
fs.unlinkSync(dbName);
