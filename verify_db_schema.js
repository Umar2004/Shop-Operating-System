const db = require('./backend/src/db');

try {
    const tableInfo = db.prepare('PRAGMA table_info(customers)').all();
    const hasOpeningBalance = tableInfo.some(col => col.name === 'opening_balance');

    if (hasOpeningBalance) {
        console.log('SUCCESS: opening_balance column exists in customers table.');
    } else {
        // Attempt to run the migration manually if it didn't run (since initDb runs on server start)
        console.log('Column not found. Attempting to add it...');
        try {
            db.exec('ALTER TABLE customers ADD COLUMN opening_balance REAL NOT NULL DEFAULT 0');
            // Fix any null balances (copied from initDb logic just in case)
            db.exec('UPDATE customers SET current_balance = 0 WHERE current_balance IS NULL');
            console.log('SUCCESS: Added opening_balance column.');
        } catch (e) {
            console.error('ERROR: Failed to add column:', e.message);
        }
    }

    // Verify checking a customer
    // let's create a dummy customer if none exists
    try {
        const check = db.prepare('SELECT * FROM customers LIMIT 1').get();
        if (check) {
            console.log('Sample customer check:', check);
        }
    } catch (e) {
        console.log('Could not select customers:', e.message);
    }

} catch (err) {
    console.error('Database error:', err.message);
}
