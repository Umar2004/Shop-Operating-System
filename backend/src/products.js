const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./db');
const { requireRole } = require('./auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all active products (with optional search)
router.get('/', (req, res) => {
  const { q } = req.query;
  if (q) {
    const rows = db
      .prepare(
        `
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'ACTIVE'
          AND (p.name LIKE ? OR c.name LIKE ?)
        ORDER BY p.name
      `
      )
      .all(`%${q}%`, `%${q}%`);
    return res.json(rows);
  }
  const rows = db
    .prepare(
      `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'ACTIVE'
      ORDER BY p.name
    `
    )
    .all();
  res.json(rows);
});

// Alerts: low stock, expired, expiring soon
router.get('/alerts', (req, res) => {
  // Products where current stock is at or below minimum stock (and minimum > 0)
  const lowStock = db
    .prepare(
      `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'ACTIVE'
        AND p.minimum_stock > 0
        AND p.current_stock <= p.minimum_stock
      ORDER BY p.current_stock ASC
    `
    )
    .all();

  // Expired products (EXP date in the past)
  const expired = db
    .prepare(
      `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'ACTIVE'
        AND p.exp IS NOT NULL
        AND p.exp <> ''
        AND date(p.exp) < date('now')
      ORDER BY p.exp ASC
    `
    )
    .all();

  // Expiring soon: within next 30 days (including today)
  const expiringSoon = db
    .prepare(
      `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'ACTIVE'
        AND p.exp IS NOT NULL
        AND p.exp <> ''
        AND date(p.exp) >= date('now')
        AND date(p.exp) <= date('now', '+30 day')
      ORDER BY p.exp ASC
    `
    )
    .all();

  res.json({ lowStock, expired, expiringSoon });
});

// Download Excel template for bulk upload
router.get('/bulk-template', (req, res) => {
  const header = [
    'Product Name',
    'Category',
    'Unit',
    'Cost Price',
    'Selling Price',
    'Opening Stock',
    'Minimum Stock',
    'MFD',
    'EXP',
    'Status',
  ];
  const sampleRow = [
    'Sample Product',
    'Sample Category',
    'pcs',
    10,
    15,
    100,
    10,
    '2025-01-01',
    '2026-01-01',
    'ACTIVE',
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, sampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="products_template.xlsx"'
  );
  res.type(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.send(buffer);
});

// Download all products as Excel
router.get('/download', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const { status } = req.query;

    // Check if product_code column exists
    let hasProductCode = false;
    try {
      const tableInfo = db.prepare("PRAGMA table_info(products)").all();
      hasProductCode = tableInfo.some(col => col.name === 'product_code');
    } catch (e) {
      // Ignore error, assume column doesn't exist
    }

    // Build query - use simple column names to avoid alias issues
    // Only include product_code if the column exists
    let query = `
      SELECT 
        p.id,
        ${hasProductCode ? 'p.product_code,' : ''}
        p.name,
        c.name as category_name,
        p.unit,
        p.cost_price,
        p.selling_price,
        p.current_stock,
        p.opening_stock,
        p.minimum_stock,
        p.mfd,
        p.exp,
        p.status,
        p.created_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
    `;

    const params = [];
    if (status && status !== 'ALL') {
      query += ' WHERE p.status = ?';
      params.push(status);
    } else {
      // Default: get all products (including inactive)
      query += ' WHERE 1=1';
    }

    query += ' ORDER BY p.name';

    const products = db.prepare(query).all(...params);

    // Prepare data for Excel
    const header = [
      'Product ID',
      'Product Name',
      'Category',
      'Unit',
      'Cost Price',
      'Selling Price',
      'Current Stock',
      'Opening Stock',
      'Minimum Stock',
      'MFD',
      'EXP',
      'Status',
      'Created At',
    ];

    const rows = products.map((p) => {
      // Generate product code if missing
      let productId = '';
      if (hasProductCode && p.product_code) {
        productId = p.product_code;
      } else {
        productId = `PORD-${String(p.id || '').padStart(5, '0')}`;
      }

      return [
        productId,
        p.name || '',
        p.category_name || '',
        p.unit || '',
        p.cost_price || 0,
        p.selling_price || 0,
        p.current_stock || 0,
        p.opening_stock || 0,
        p.minimum_stock || 0,
        p.mfd || '',
        p.exp || '',
        p.status || '',
        p.created_at || '',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Auto-size columns
    const colWidths = header.map((_, idx) => {
      let maxLength = header[idx].length;
      rows.forEach((row) => {
        const cellValue = String(row[idx] || '');
        if (cellValue.length > maxLength) {
          maxLength = cellValue.length;
        }
      });
      return { wch: Math.min(maxLength + 2, 50) };
    });
    ws['!cols'] = colWidths;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="products_export_${timestamp}.xlsx"`
    );
    res.type(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(buffer);
  } catch (err) {
    console.error('Error downloading products', err);
    res.status(500).json({ message: 'Failed to generate export file: ' + err.message });
  }
});

// In-memory storage for bulk upload progress (simple approach)
const bulkUploadJobs = new Map();

// Bulk upload products from Excel - Validation only (dry run) - CASHIER can validate
router.post(
  '/bulk-upload/validate',
  requireRole(['ADMIN', 'MANAGER', 'CASHIER']),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const autoCreateCategories =
      String(req.body.autoCreateCategories || '').toLowerCase() === 'true';

    let rows;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch (err) {
      console.error('Failed to parse Excel', err);
      return res.status(400).json({ message: 'Invalid Excel file' });
    }

    const requiredColumns = [
      'Product Name',
      'Category',
      'Unit',
      'Cost Price',
      'Selling Price',
      'Opening Stock',
      'Minimum Stock',
      'MFD',
      'EXP',
      'Status',
    ];

    const results = [];
    let validCount = 0;
    let errorCount = 0;

    const parseDate = (value) => {
      const v = String(value || '').trim();
      if (!v) return null;
      // Try multiple date formats
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        return null;
      }
      // Return ISO date string (YYYY-MM-DD)
      return d.toISOString().split('T')[0];
    };

    const validateRow = (row, index) => {
      const data = {};
      requiredColumns.forEach((col) => {
        data[col] = row[col] !== undefined ? row[col] : '';
      });

      const errors = {}; // Field-level errors
      const warnings = []; // General warnings
      let isValid = true;

      const name = String(data['Product Name'] || '').trim();
      const categoryName = String(data.Category || '').trim();
      const unit = String(data.Unit || '').trim() || null;
      const costPriceStr = String(data['Cost Price'] || '').trim();
      const sellingPriceStr = String(data['Selling Price'] || '').trim();
      const openingStockStr = String(data['Opening Stock'] || '').trim();
      const minimumStockStr = String(data['Minimum Stock'] || '').trim();
      const mfdStr = String(data.MFD || '').trim();
      const expStr = String(data.EXP || '').trim();
      const statusText = String(data.Status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE';

      // Validate Product Name
      if (!name) {
        errors['Product Name'] = 'Product Name is required';
        isValid = false;
      }

      // Validate Category
      if (!categoryName) {
        errors.Category = 'Category is required';
        isValid = false;
      } else {
        // Check if category exists (only if not auto-creating)
        if (!autoCreateCategories) {
          const existingCategory = db
            .prepare('SELECT id FROM categories WHERE name = ?')
            .get(categoryName);
          if (!existingCategory) {
            errors.Category = 'Category does not exist';
            isValid = false;
          }
        }
      }

      // Validate Cost Price
      const costPrice = Number(costPriceStr);
      if (!costPriceStr || Number.isNaN(costPrice) || costPrice < 0) {
        errors['Cost Price'] = 'Cost Price must be a valid positive number';
        isValid = false;
      }

      // Validate Selling Price
      const sellingPrice = Number(sellingPriceStr);
      if (!sellingPriceStr || Number.isNaN(sellingPrice) || sellingPrice < 0) {
        errors['Selling Price'] = 'Selling Price must be a valid positive number';
        isValid = false;
      } else if (costPriceStr && !Number.isNaN(costPrice) && sellingPrice < costPrice) {
        errors['Selling Price'] = 'Selling Price must be greater than or equal to Cost Price';
        isValid = false;
      } else if (costPriceStr && !Number.isNaN(costPrice) && sellingPrice === costPrice) {
        warnings.push('Selling Price equals Cost Price (no profit margin)');
      }

      // Validate Opening Stock
      const openingStock = Number(openingStockStr);
      if (openingStockStr === '' || Number.isNaN(openingStock) || openingStock < 0) {
        errors['Opening Stock'] = 'Opening Stock must be zero or a positive number';
        isValid = false;
      }

      // Validate Minimum Stock
      const minimumStock = Number(minimumStockStr);
      if (minimumStockStr === '' || Number.isNaN(minimumStock) || minimumStock < 0) {
        errors['Minimum Stock'] = 'Minimum Stock must be zero or a positive number';
        isValid = false;
      }

      // Date validation with new logic
      const mfdDate = parseDate(mfdStr);
      const expDate = parseDate(expStr);

      // If MFD is provided but invalid
      if (mfdStr && !mfdDate) {
        errors.MFD = 'Invalid MFD date format (use YYYY-MM-DD)';
        isValid = false;
      }

      // If EXP is provided but invalid
      if (expStr && !expDate) {
        errors.EXP = 'Invalid EXP date format (use YYYY-MM-DD)';
        isValid = false;
      }

      // If both dates are present, validate exp > mfd
      if (mfdDate && expDate && expDate <= mfdDate) {
        errors.EXP = 'EXP date must be after MFD date';
        isValid = false;
      }

      // Validate Status
      if (statusText !== 'ACTIVE' && statusText !== 'INACTIVE') {
        errors.Status = 'Status must be ACTIVE or INACTIVE';
        isValid = false;
      }

      // Check for duplicates (only if valid so far)
      if (isValid && name && categoryName) {
        let resolvedCategoryId = null;
        if (autoCreateCategories) {
          // In dry run, we can't check if category will exist, so skip duplicate check
          // This will be checked during actual import
        } else {
          const existingCategory = db
            .prepare('SELECT id FROM categories WHERE name = ?')
            .get(categoryName);
          if (existingCategory) {
            resolvedCategoryId = existingCategory.id;
            const duplicate = db
              .prepare(
                `
                SELECT id FROM products
                WHERE name = ? AND category_id = ? AND status = 'ACTIVE'
              `
              )
              .get(name, resolvedCategoryId);
            if (duplicate) {
              errors['Product Name'] = 'Duplicate product (same name & category already exists)';
              isValid = false;
            }
          }
        }
      }

      if (isValid) {
        validCount += 1;
      } else {
        errorCount += 1;
      }

      results.push({
        index: index + 2, // Excel row number (header is row 1)
        status: isValid ? 'valid' : 'error',
        errors,
        warnings,
        data,
      });
    };

    // Process all rows
    rows.forEach((row, index) => validateRow(row, index));

    res.json({
      summary: {
        totalRows: rows.length,
        valid: validCount,
        errors: errorCount,
      },
      rows: results,
    });
  }
);

// Bulk upload products from Excel - Actual import (only valid products)
router.post(
  '/bulk-upload/import',
  requireRole(['ADMIN', 'MANAGER', 'CASHIER']),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const autoCreateCategories =
      String(req.body.autoCreateCategories || '').toLowerCase() === 'true';
    const jobId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job progress
    bulkUploadJobs.set(jobId, {
      total: 0,
      processed: 0,
      inserted: 0,
      failed: 0,
      status: 'processing',
      errors: [], // Array of { row, productName, errors: [] }
    });

    // Process asynchronously
    setImmediate(() => {
      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const job = bulkUploadJobs.get(jobId);
        job.total = rows.length;

        const parseDate = (value) => {
          const v = String(value || '').trim();
          if (!v) return null;
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) {
            return null;
          }
          return d.toISOString().split('T')[0];
        };

        // Helper function to validate and parse numbers
        const parseNumber = (value, fieldName, allowZero = true) => {
          const str = String(value || '').trim();
          if (!str) {
            return { valid: false, value: null, error: `${fieldName} is required` };
          }
          // Check if it's a valid number string (allows decimals and negative for validation)
          if (!/^-?\d*\.?\d+$/.test(str)) {
            return { valid: false, value: null, error: `${fieldName} must be a valid number` };
          }
          const num = Number(str);
          if (Number.isNaN(num)) {
            return { valid: false, value: null, error: `${fieldName} must be a valid number` };
          }
          if (!allowZero && num <= 0) {
            return { valid: false, value: null, error: `${fieldName} must be greater than zero` };
          }
          if (allowZero && num < 0) {
            return { valid: false, value: null, error: `${fieldName} must be zero or a positive number` };
          }
          return { valid: true, value: num, error: null };
        };

        const tx = db.transaction(() => {
          rows.forEach((row, index) => {
            const rowNumber = index + 2; // Excel row number (header is row 1)
            const name = String(row['Product Name'] || '').trim();
            const categoryName = String(row.Category || '').trim();
            const unit = String(row.Unit || '').trim() || null;
            const mfdStr = String(row.MFD || '').trim();
            const expStr = String(row.EXP || '').trim();
            const statusText = String(row.Status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE';

            const errors = [];

            // Validate Product Name - must be non-empty after trim
            if (!name || name.length === 0) {
              errors.push('Product Name is required and cannot be empty');
            }

            // Validate Category - must be non-empty after trim
            if (!categoryName || categoryName.length === 0) {
              errors.push('Category is required and cannot be empty');
            }

            // Validate Status - only ACTIVE or INACTIVE allowed
            if (statusText !== 'ACTIVE' && statusText !== 'INACTIVE') {
              errors.push(`Status must be either "ACTIVE" or "INACTIVE" (got: "${statusText}")`);
            }

            // Validate and parse Cost Price
            const costPriceResult = parseNumber(row['Cost Price'], 'Cost Price', false);
            if (!costPriceResult.valid) {
              errors.push(costPriceResult.error);
            }
            const costPrice = costPriceResult.value;

            // Validate and parse Selling Price
            const sellingPriceResult = parseNumber(row['Selling Price'], 'Selling Price', false);
            if (!sellingPriceResult.valid) {
              errors.push(sellingPriceResult.error);
            }
            const sellingPrice = sellingPriceResult.value;

            // Validate Selling Price >= Cost Price (only if both are valid)
            if (costPriceResult.valid && sellingPriceResult.valid && sellingPrice < costPrice) {
              errors.push('Selling Price must be greater than or equal to Cost Price');
            }

            // Validate and parse Opening Stock
            const openingStockResult = parseNumber(row['Opening Stock'], 'Opening Stock', true);
            if (!openingStockResult.valid) {
              errors.push(openingStockResult.error);
            }
            const openingStock = openingStockResult.value;

            // Validate and parse Minimum Stock
            const minimumStockResult = parseNumber(row['Minimum Stock'], 'Minimum Stock', true);
            if (!minimumStockResult.valid) {
              errors.push(minimumStockResult.error);
            }
            const minimumStock = minimumStockResult.value;

            // Date validation
            const mfdDate = parseDate(mfdStr);
            const expDate = parseDate(expStr);
            if (mfdStr && !mfdDate) {
              errors.push('Invalid MFD date format (use YYYY-MM-DD)');
            }
            if (expStr && !expDate) {
              errors.push('Invalid EXP date format (use YYYY-MM-DD)');
            }
            if (mfdDate && expDate && expDate <= mfdDate) {
              errors.push('EXP date must be after MFD date');
            }

            // If there are validation errors, record them and skip - DO NOT IMPORT
            if (errors.length > 0) {
              job.failed += 1;
              job.processed += 1;
              job.errors.push({
                row: rowNumber,
                productName: name || '(No name)',
                errors: errors,
              });
              return; // Skip this row completely - do not import
            }

            // Resolve or create category
            let resolvedCategoryId = null;
            if (categoryName) {
              let existingCategory = db
                .prepare('SELECT id FROM categories WHERE name = ?')
                .get(categoryName);
              if (existingCategory) {
                resolvedCategoryId = existingCategory.id;
              } else if (autoCreateCategories) {
                try {
                  const insertCategory = db
                    .prepare('INSERT INTO categories (name, is_active) VALUES (?, 1)')
                    .run(categoryName);
                  resolvedCategoryId = insertCategory.lastInsertRowid;
                } catch (e) {
                  job.failed += 1;
                  job.processed += 1;
                  job.errors.push({
                    row: rowNumber,
                    productName: name || '(No name)',
                    errors: [`Failed to create category "${categoryName}": ${e.message}`],
                  });
                  return; // Skip this row - do not import
                }
              } else {
                job.failed += 1;
                job.processed += 1;
                job.errors.push({
                  row: rowNumber,
                  productName: name || '(No name)',
                  errors: [`Category "${categoryName}" does not exist`],
                });
                return; // Skip this row - do not import
              }
            }

            // Check for duplicates - if duplicate found, skip import
            if (resolvedCategoryId !== null) {
              const duplicate = db
                .prepare(
                  `
                  SELECT id FROM products
                  WHERE name = ? AND category_id = ? AND status = 'ACTIVE'
                `
                )
                .get(name, resolvedCategoryId);
              if (duplicate) {
                job.failed += 1;
                job.processed += 1;
                job.errors.push({
                  row: rowNumber,
                  productName: name || '(No name)',
                  errors: ['Duplicate product (same name & category already exists)'],
                });
                return; // Skip this row - do not import
              }
            }

            // Insert product - only valid products reach here
            try {
              const result = db
                .prepare(
                  `
                  INSERT INTO products
                  (name, category_id, unit, cost_price, selling_price, opening_stock, current_stock, minimum_stock, status, mfd, exp)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
                )
                .run(
                  name,
                  resolvedCategoryId,
                  unit,
                  costPrice,
                  sellingPrice,
                  openingStock,
                  openingStock,
                  minimumStock,
                  statusText,
                  mfdStr || null,
                  expStr || null
                );

              const productId = result.lastInsertRowid;
              const productCode = `PROD-${String(productId).padStart(5, '0')}`;
              try {
                db.prepare('UPDATE products SET product_code = ? WHERE id = ?').run(
                  productCode,
                  productId
                );
              } catch (e) {
                // ignore product_code update errors
              }

              if (openingStock && openingStock !== 0) {
                db.prepare(
                  `
                  INSERT INTO stock_movements
                  (product_id, type, quantity_change, reason, reference_type)
                  VALUES (?, 'OPENING', ?, 'Opening stock (bulk)', 'BULK_UPLOAD')
                `
                ).run(productId, openingStock);
              }

              job.inserted += 1;
              job.processed += 1;
            } catch (e) {
              // Database insertion error - product was NOT imported
              job.failed += 1;
              job.processed += 1;
              job.errors.push({
                row: rowNumber,
                productName: name || '(No name)',
                errors: [`Database error: ${e.message}`],
              });
              // Do not rethrow - continue with next row, this row is skipped
            }
          });
        });

        tx();
        job.status = 'completed';
      } catch (err) {
        console.error('Bulk upload import failed', err);
        const job = bulkUploadJobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = err.message;
        }
      }
    });

    res.json({ jobId });
  }
);

// Get bulk upload progress - CASHIER can check progress
router.get('/bulk-upload/progress/:jobId', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { jobId } = req.params;
  const job = bulkUploadJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }
  res.json(job);
});

// Create product (CASHIER can create products)
router.post('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const {
      name,
      categoryId,
      categoryName,
      unit,
      costPrice,
      sellingPrice,
      openingStock = 0,
      minimumStock = 0,
      status = 'ACTIVE',
      mfd = null,
      exp = null,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    // Resolve category id from either categoryId or categoryName
    let resolvedCategoryId = categoryId || null;
    if (!resolvedCategoryId && categoryName && categoryName.trim()) {
      const existingCategory = db
        .prepare('SELECT id FROM categories WHERE name = ?')
        .get(categoryName.trim());
      if (existingCategory) {
        resolvedCategoryId = existingCategory.id;
      } else {
        const insertCategory = db
          .prepare('INSERT INTO categories (name, is_active) VALUES (?, 1)')
          .run(categoryName.trim());
        resolvedCategoryId = insertCategory.lastInsertRowid;
      }
    }

    const result = db
      .prepare(
        `
      INSERT INTO products
      (name, category_id, unit, cost_price, selling_price, opening_stock, current_stock, minimum_stock, status, mfd, exp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        name,
        resolvedCategoryId,
        unit || null,
        costPrice ?? 0,
        sellingPrice ?? 0,
        openingStock,
        openingStock,
        minimumStock,
        status,
        mfd || null,
        exp || null
      );

    // Generate product code like PORD-00001
    const productId = result.lastInsertRowid;
    const productCode = `PORD-${String(productId).padStart(5, '0')}`;
    try {
      db.prepare('UPDATE products SET product_code = ? WHERE id = ?').run(
        productCode,
        productId
      );
    } catch (e) {
      // If unique constraint fails or column missing, just ignore for now
    }

    // Record stock movement for opening stock
    if (openingStock && openingStock !== 0) {
      db.prepare(
        `
      INSERT INTO stock_movements
      (product_id, type, quantity_change, reason, reference_type)
      VALUES (?, 'OPENING', ?, 'Opening stock', 'SYSTEM')
    `
      ).run(result.lastInsertRowid, openingStock);
    }

    const product = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(product);
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ message: err.message || 'Failed to create product' });
  }
});

// Update product
router.put('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const {
    name = existing.name,
    categoryId = existing.category_id,
    categoryName,
    unit = existing.unit,
    costPrice = existing.cost_price,
    sellingPrice = existing.selling_price,
    minimumStock = existing.minimum_stock,
    status = existing.status,
    mfd = existing.mfd,
    exp = existing.exp,
  } = req.body;

  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId && categoryName && categoryName.trim()) {
    const existingCategory = db
      .prepare('SELECT id FROM categories WHERE name = ?')
      .get(categoryName.trim());
    if (existingCategory) {
      resolvedCategoryId = existingCategory.id;
    } else {
      const insertCategory = db
        .prepare('INSERT INTO categories (name, is_active) VALUES (?, 1)')
        .run(categoryName.trim());
      resolvedCategoryId = insertCategory.lastInsertRowid;
    }
  }

  db.prepare(
    `
    UPDATE products
    SET name = ?, category_id = ?, unit = ?, cost_price = ?, selling_price = ?, minimum_stock = ?, status = ?, mfd = ?, exp = ?
    WHERE id = ?
  `
  ).run(
    name,
    resolvedCategoryId,
    unit,
    costPrice,
    sellingPrice,
    minimumStock,
    status,
    mfd || null,
    exp || null,
    id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(updated);
});

// Soft delete / deactivate product
router.delete('/:id', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ message: 'Product not found' });
  }
  db.prepare('UPDATE products SET status = ? WHERE id = ?').run('INACTIVE', id);
  res.json({ success: true });
});

// Bulk delete / deactivate products
router.post('/bulk-delete', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids must be a non-empty array' });
  }

  const stmt = db.prepare('UPDATE products SET status = ? WHERE id = ?');
  const tx = db.transaction(() => {
    ids.forEach((id) => {
      stmt.run('INACTIVE', id);
    });
  });

  try {
    tx();
  } catch (err) {
    console.error('Bulk delete failed', err);
    return res.status(500).json({ message: 'Bulk delete failed' });
  }

  res.json({ success: true, count: ids.length });
});

// Stock adjustment
router.post('/:id/adjust-stock', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const id = Number(req.params.id);
  const { quantityChange, reason } = req.body;
  if (!quantityChange || typeof quantityChange !== 'number') {
    return res.status(400).json({ message: 'quantityChange must be a number' });
  }
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  // Read the current stock inside the transaction (the dialog's figure may be stale) and never go below zero
  const adjust = db.transaction(() => {
    const current = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(id).current_stock;
    const newStock = current + quantityChange;
    if (newStock < 0) {
      const err = new Error(`Stock cannot go below zero (current stock is ${current})`);
      err.status = 400;
      throw err;
    }
    db.prepare(
      `
      UPDATE products SET current_stock = ? WHERE id = ?
    `
    ).run(newStock, id);

    db.prepare(
      `
      INSERT INTO stock_movements
      (product_id, type, quantity_change, reason, reference_type)
      VALUES (?, 'ADJUSTMENT', ?, ?, 'MANUAL')
    `
    ).run(id, quantityChange, reason || 'Manual adjustment');
  });

  try {
    adjust();
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(updated);
});

module.exports = {
  productsRouter: router,
};


