const express = require('express');
const db = require('./db');
const { requireRole } = require('./auth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');

const router = express.Router();

// A backup is only usable if SQLite says the whole file is intact and the core tables are present.
// ('SELECT 1' only proves the header and schema can be read, not the data pages.)
const REQUIRED_BACKUP_TABLES = ['products', 'invoices', 'invoice_items', 'payments', 'customers', 'sessions', 'settings', 'users'];
function assertUsableBackup(testDb) {
  const integrity = testDb.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    throw new Error(`Backup file failed the integrity check (${integrity})`);
  }
  const tables = new Set(testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const missing = REQUIRED_BACKUP_TABLES.filter((t) => !tables.has(t));
  if (missing.length > 0) {
    throw new Error(`Backup file is missing tables: ${missing.join(', ')}`);
  }
}

// Ensure directories exist
// In production, use environment variables if set
// If not set, use user data directory to avoid permission issues in Program Files
let dataDir = process.env.DATA_DIR;
if (!dataDir) {
  // Default to user data directory to avoid permission issues
  // Windows: %APPDATA%\SOP\data
  // Linux/Mac: ~/.config/SOP/data
  const appName = 'SOP';
  if (process.platform === 'win32') {
    dataDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'data');
  } else {
    dataDir = path.join(os.homedir(), '.config', appName, 'data');
  }
}

let uploadsBaseDir = process.env.UPLOADS_DIR;
if (!uploadsBaseDir) {
  // Default to user data directory to avoid permission issues
  // Windows: %APPDATA%\SOP\uploads
  // Linux/Mac: ~/.config/SOP/uploads
  const appName = 'SOP';
  if (process.platform === 'win32') {
    uploadsBaseDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'uploads');
  } else {
    uploadsBaseDir = path.join(os.homedir(), '.config', appName, 'uploads');
  }
}

const uploadsDir = path.join(uploadsBaseDir, 'logo');
const defaultBackupsDir = path.join(dataDir, 'backups');

// Helper function to get backup directory from settings or use default
const getBackupDir = () => {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.path');
    if (setting && setting.value && setting.value.trim()) {
      const customPath = setting.value.trim();
      // Ensure directory exists
      try {
        if (!fs.existsSync(customPath)) {
          fs.mkdirSync(customPath, { recursive: true });
        }
        return customPath;
      } catch (dirErr) {
        console.error(`Failed to create custom backup directory: ${customPath}`, dirErr);
        // Fall through to default directory
      }
    }
  } catch (err) {
    console.error('Error reading backup path setting:', err);
  }
  // Use default if no custom path is set or if custom path failed
  try {
    if (!fs.existsSync(defaultBackupsDir)) {
      fs.mkdirSync(defaultBackupsDir, { recursive: true });
    }
  } catch (dirErr) {
    console.error(`Failed to create default backup directory: ${defaultBackupsDir}`, dirErr);
    throw new Error(`Cannot create backup directory: ${defaultBackupsDir}. Error: ${dirErr.message}`);
  }
  return defaultBackupsDir;
};

// Ensure default directories exist on startup
[uploadsDir, defaultBackupsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for logo upload
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Configure multer for backup upload
const backupStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const backupDir = getBackupDir();
      cb(null, backupDir);
    } catch (err) {
      console.error('Error getting backup directory:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // Keep only a plain file name (a crafted name like "..\\data\\sop.db" must not escape the folder)
    // and never overwrite an existing backup
    const safeName = path.basename(String(file.originalname).replace(/\\/g, '/')).replace(/[^\w.\- ]/g, '_');
    let finalName = safeName;
    try {
      if (fs.existsSync(path.join(getBackupDir(), finalName))) {
        finalName = safeName.replace(/\.db$/i, '') + `_uploaded_${Date.now()}.db`;
      }
    } catch (_) {}
    cb(null, finalName);
  },
});

const backupUpload = multer({
  storage: backupStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.db')) {
      cb(null, true);
    } else {
      cb(new Error('Only .db files are allowed'));
    }
  },
});

// Get all settings (readable by all authenticated users for shop name, logo, etc.)
router.get('/', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all();
    const settingsObj = {};
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });
    res.json(settingsObj);
  } catch (err) {
    // Check if database is corrupted
    if (err.message && (
      err.message.includes('malformed') || 
      err.message.includes('corrupt') ||
      err.message.includes('disk image')
    )) {
      return res.status(500).json({ 
        message: 'Database is corrupted. Please restore from a backup.',
        error: err.message,
        recovery_suggestion: 'Upload a backup file to restore the database.'
      });
    }
    res.status(500).json({ message: err.message });
  }
});

// Update multiple settings (MUST come before /:key route)
router.put('/bulk', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ message: 'Settings object is required' });
    }
    
    // Validate that settings object is not empty
    if (Object.keys(settings).length === 0) {
      return res.status(400).json({ message: 'Settings object cannot be empty' });
    }

    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        insertSetting.run(key, String(value));
      }
    });

    transaction(settings);
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Test write permissions for backup path
router.post('/backup/test-write', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { path: pathToTest } = req.body;
    if (!pathToTest || typeof pathToTest !== 'string') {
      return res.status(400).json({ 
        success: false,
        message: 'Path is required' 
      });
    }

    const cleanPath = pathToTest.trim();
    if (!cleanPath) {
      return res.status(400).json({ 
        success: false,
        message: 'Path cannot be empty' 
      });
    }

    try {
      // Ensure directory exists
      if (!fs.existsSync(cleanPath)) {
        fs.mkdirSync(cleanPath, { recursive: true });
      }

      // Test write by creating a temporary file
      const testFileName = `test_write_${Date.now()}.tmp`;
      const testFilePath = path.join(cleanPath, testFileName);
      
      fs.writeFileSync(testFilePath, 'test');
      fs.unlinkSync(testFilePath);

      return res.json({ 
        success: true,
        message: 'Path is writable',
        path: cleanPath 
      });
    } catch (err) {
      return res.status(400).json({ 
        success: false,
        message: `Cannot write to path: ${err.message}` 
      });
    }
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
});

// Get backup status
router.get('/backup/status', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const lastSuccess = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.last_success');
    const lastError = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.last_error');
    const backupCount = db.prepare('SELECT COUNT(*) as count FROM backups').get();

    res.json({
      last_success: lastSuccess ? lastSuccess.value : null,
      last_error: lastError ? lastError.value : null,
      backup_count: backupCount ? backupCount.count : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Validate backup path (keep for backward compatibility)
router.post('/backup/validate-path', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { path: pathToValidate } = req.body;
    if (!pathToValidate || typeof pathToValidate !== 'string') {
      return res.status(400).json({ message: 'Path is required' });
    }

    const cleanPath = pathToValidate.trim();
    if (!cleanPath) {
      return res.status(400).json({ message: 'Path cannot be empty' });
    }

    // Check if path exists and is a directory
    try {
      if (!fs.existsSync(cleanPath)) {
        // Try to create it
        try {
          fs.mkdirSync(cleanPath, { recursive: true });
          return res.json({ 
            valid: true, 
            message: 'Path created successfully',
            path: cleanPath 
          });
        } catch (mkdirErr) {
          return res.status(400).json({ 
            valid: false, 
            message: `Cannot create directory: ${mkdirErr.message}` 
          });
        }
      } else {
        // Path exists, check if it's a directory
        const stats = fs.statSync(cleanPath);
        if (stats.isDirectory()) {
          return res.json({ 
            valid: true, 
            message: 'Path is valid and accessible',
            path: cleanPath 
          });
        } else {
          return res.status(400).json({ 
            valid: false, 
            message: 'Path exists but is not a directory' 
          });
        }
      }
    } catch (err) {
      return res.status(400).json({ 
        valid: false, 
        message: `Path validation failed: ${err.message}` 
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List backups (MUST come before /:key route)
router.get('/backups', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    let backups = [];
    
    try {
      // Try to query backups from database
      backups = db
        .prepare(
          `
        SELECT b.*, u.username as created_by_name
        FROM backups b
        LEFT JOIN users u ON u.id = b.created_by
        ORDER BY b.created_at DESC
      `
        )
        .all();
    } catch (dbErr) {
      // If database query fails (e.g., corrupted database), try to list files from backup directory
      console.error('[BACKUPS LIST] Database query failed, falling back to file system:', dbErr);
      
      // Check if error is database corruption
      if (dbErr.message && (
        dbErr.message.includes('malformed') || 
        dbErr.message.includes('corrupt') ||
        dbErr.message.includes('disk image')
      )) {
        // Database is corrupted - list files from backup directory instead
        try {
          const backupDir = getBackupDir();
          if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir)
              .filter(file => file.endsWith('.db'))
              .map(file => {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                return {
                  file_name: file,
                  size_bytes: stats.size,
                  created_at: stats.birthtime.toISOString(),
                  created_by_name: null,
                  file_exists: true,
                };
              })
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            return res.json(files);
          }
        } catch (fsErr) {
          console.error('[BACKUPS LIST] File system fallback failed:', fsErr);
        }
        
        return res.status(500).json({ 
          message: 'Database is corrupted. Please restore from a backup file or reset the system.',
          error: dbErr.message,
          recovery_suggestion: 'Try uploading a backup file to restore the database.'
        });
      }
      
      // Re-throw if it's not a corruption error
      throw dbErr;
    }

    // Check if files still exist
    const backupDir = getBackupDir();
    const backupsWithStatus = backups.map((backup) => {
      try {
        const filePath = path.join(backupDir, backup.file_name);
        const exists = fs.existsSync(filePath);
        return {
          ...backup,
          file_exists: exists,
        };
      } catch (fileErr) {
        // If file check fails, mark as not existing
        return {
          ...backup,
          file_exists: false,
        };
      }
    });

    res.json(backupsWithStatus);
  } catch (err) {
    console.error('[BACKUPS LIST] Error:', err);
    res.status(500).json({ 
      message: err.message || 'Failed to list backups',
      error: err.message
    });
  }
});

// Printer Settings Endpoints (MUST come before /:key route)
// Get printer settings
router.get('/printer', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const nameSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.name');
    const paperSizeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.paperSize');
    const silentPrintSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.silentPrint');
    const autoCutSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.autoCut');
    const printLogoSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.printLogo');
    const useDirectSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.useDirect');
    const usbDeviceIdSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('printer.usbDeviceId');

    res.json({
      name: nameSetting?.value || '',
      paperSize: paperSizeSetting?.value || '80',
      silentPrint: silentPrintSetting?.value === 'true' || true,
      autoCut: autoCutSetting?.value === 'true' || false,
      printLogo: printLogoSetting?.value === 'true' || false,
      useDirect: useDirectSetting?.value === 'true' || false,
      usbDeviceId: usbDeviceIdSetting?.value || '',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update printer settings
router.put('/printer', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { name, paperSize, silentPrint, autoCut, printLogo, useDirect, usbDeviceId } = req.body;

    const tx = db.transaction(() => {
      if (name !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.name', String(name || ''));
      }
      if (paperSize !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.paperSize', String(paperSize || '80'));
      }
      if (silentPrint !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.silentPrint', String(silentPrint === true || silentPrint === 'true'));
      }
      if (autoCut !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.autoCut', String(autoCut === true || autoCut === 'true'));
      }
      if (printLogo !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.printLogo', String(printLogo === true || printLogo === 'true'));
      }
      if (useDirect !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.useDirect', String(useDirect === true || useDirect === 'true'));
      }
      if (usbDeviceId !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('printer.usbDeviceId', String(usbDeviceId || ''));
      }
    });

    tx();
    res.json({ message: 'Printer settings updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get receipt customization settings
router.get('/receipt', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const headerAlign = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.headerAlign');
    const itemAlign = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.itemAlign');
    const totalAlign = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.totalAlign');
    const footerAlign = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.footerAlign');
    const fontSize = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.fontSize');
    const headerFontSize = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.headerFontSize');
    const itemFontSize = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.itemFontSize');
    const totalFontSize = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.totalFontSize');
    const padding = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.padding');
    const paddingLeft = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.paddingLeft');
    const paddingRight = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.paddingRight');
    const lineSpacing = db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt.lineSpacing');

    res.json({
      headerAlign: headerAlign?.value ?? 'center',
      itemAlign: itemAlign?.value ?? 'left',
      totalAlign: totalAlign?.value ?? 'right',
      footerAlign: footerAlign?.value ?? 'center',
      fontSize: fontSize?.value ?? '12',
      headerFontSize: headerFontSize?.value ?? '14',
      itemFontSize: itemFontSize?.value ?? '11',
      totalFontSize: totalFontSize?.value ?? '13',
      padding: padding?.value ?? '10',
      paddingLeft: paddingLeft?.value ?? '0',
      paddingRight: paddingRight?.value ?? '0',
      lineSpacing: lineSpacing?.value ?? '1.3',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update receipt customization settings
router.put('/receipt', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { headerAlign, itemAlign, totalAlign, footerAlign, fontSize, headerFontSize, itemFontSize, totalFontSize, padding, paddingLeft, paddingRight, lineSpacing } = req.body;

    const tx = db.transaction(() => {
      // Save all provided values, preserving "0" and empty strings
      if (headerAlign !== undefined && headerAlign !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.headerAlign', String(headerAlign));
      }
      if (itemAlign !== undefined && itemAlign !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.itemAlign', String(itemAlign));
      }
      if (totalAlign !== undefined && totalAlign !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.totalAlign', String(totalAlign));
      }
      if (footerAlign !== undefined && footerAlign !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.footerAlign', String(footerAlign));
      }
      if (fontSize !== undefined && fontSize !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.fontSize', String(fontSize));
      }
      if (headerFontSize !== undefined && headerFontSize !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.headerFontSize', String(headerFontSize));
      }
      if (itemFontSize !== undefined && itemFontSize !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.itemFontSize', String(itemFontSize));
      }
      if (totalFontSize !== undefined && totalFontSize !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.totalFontSize', String(totalFontSize));
      }
      if (padding !== undefined && padding !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.padding', String(padding));
      }
      if (paddingLeft !== undefined && paddingLeft !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.paddingLeft', String(paddingLeft));
      }
      if (paddingRight !== undefined && paddingRight !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.paddingRight', String(paddingRight));
      }
      if (lineSpacing !== undefined && lineSpacing !== null) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('receipt.lineSpacing', String(lineSpacing));
      }
    });

    tx();
    res.json({ message: 'Receipt customization settings updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single setting
router.get('/:key', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const setting = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(req.params.key);
    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
    }
    res.json(setting);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get backup schedule
router.get('/backup/schedule', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const getSetting = (key, defaultValue) => {
      const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return setting ? setting.value : defaultValue;
    };

    const schedule = {
      daily: getSetting('backup.schedule.daily', 'disabled'),
      daily_skip_option: getSetting('backup.schedule.daily_skip_option', 'false'),
      weekly: getSetting('backup.schedule.weekly', 'disabled'),
      weekly_day: getSetting('backup.schedule.weekly_day', '0'),
      weekly_time: getSetting('backup.schedule.weekly_time', '02:00'),
      monthly: getSetting('backup.schedule.monthly', 'disabled'),
      monthly_day: getSetting('backup.schedule.monthly_day', '1'),
      monthly_time: getSetting('backup.schedule.monthly_time', '02:00'),
    };

    // Migrate old backup.daily_prompt to new format
    const oldDailyPrompt = getSetting('backup.daily_prompt', 'false');
    if (oldDailyPrompt === 'true' && schedule.daily === 'disabled') {
      schedule.daily = 'enabled';
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('backup.schedule.daily', 'enabled');
    }

    res.json(schedule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update backup schedule
router.put('/backup/schedule', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const {
      daily,
      daily_skip_option,
      weekly,
      weekly_day,
      weekly_time,
      monthly,
      monthly_day,
      monthly_time,
    } = req.body;

    const settings = {};
    if (daily !== undefined) settings['backup.schedule.daily'] = String(daily);
    if (daily_skip_option !== undefined) settings['backup.schedule.daily_skip_option'] = String(daily_skip_option);
    if (weekly !== undefined) settings['backup.schedule.weekly'] = String(weekly);
    if (weekly_day !== undefined) settings['backup.schedule.weekly_day'] = String(weekly_day);
    if (weekly_time !== undefined) settings['backup.schedule.weekly_time'] = String(weekly_time);
    if (monthly !== undefined) settings['backup.schedule.monthly'] = String(monthly);
    if (monthly_day !== undefined) settings['backup.schedule.monthly_day'] = String(monthly_day);
    if (monthly_time !== undefined) settings['backup.schedule.monthly_time'] = String(monthly_time);

    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(settings)) {
      insertSetting.run(key, value);
    }

    // Update scheduler
    const { updateScheduler } = require('./backupScheduler');
    updateScheduler();

    res.json({ message: 'Backup schedule updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Trigger backup on day end
router.post('/backup/end-day', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const getSetting = (key, defaultValue) => {
      const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return setting ? setting.value : defaultValue;
    };

    const dailyEnabled = getSetting('backup.schedule.daily', 'disabled') === 'enabled';
    
    if (!dailyEnabled) {
      return res.json({ 
        created: false, 
        message: 'Daily backup is not enabled' 
      });
    }

    const { createBackup } = require('./backupScheduler');
    const result = await createBackup();
    
    res.json({
      created: true,
      ...result,
      message: 'Backup created successfully',
    });
  } catch (err) {
    res.status(500).json({ 
      created: false,
      message: err.message || 'Failed to create backup' 
    });
  }
});

// Update single setting
router.put('/:key', requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ message: 'Value is required' });
    }

    // For backup.path, preserve the exact path as entered (only trim whitespace)
    const valueToSave = req.params.key === 'backup.path' 
      ? String(value).trim() 
      : String(value);
    
    // Log backup path changes for debugging
    if (req.params.key === 'backup.path') {
    }
    
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(req.params.key, valueToSave);
    } catch (dbErr) {
      // Check if database is corrupted
      if (dbErr.message && (
        dbErr.message.includes('malformed') || 
        dbErr.message.includes('corrupt') ||
        dbErr.message.includes('disk image')
      )) {
        return res.status(500).json({ 
          message: 'Database is corrupted. Cannot update settings. Please restore from a backup first.',
          error: dbErr.message,
          recovery_suggestion: 'Upload and restore a backup file to fix the database.'
        });
      }
      throw dbErr;
    }
    
    // Verify it was saved correctly
    if (req.params.key === 'backup.path') {
      const saved = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.path');
    }
    
    // If backup schedule is updated, update the scheduler
    if (req.params.key.startsWith('backup.schedule.')) {
      const { updateScheduler } = require('./backupScheduler');
      updateScheduler();
    }
    
    res.json({ key: req.params.key, value: valueToSave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create backup
router.post('/backup', requireRole(['ADMIN']), async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFilename = `sop_backup_${timestamp}.db`;
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, backupFilename);

    // Log the backup path being used
    
    // Verify the backup directory is writable
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Test write permissions
      const testFile = path.join(backupDir, `.test_write_${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (dirErr) {
      return res.status(500).json({ 
        message: `Cannot write to backup directory: ${backupDir}. Error: ${dirErr.message}` 
      });
    }

    // Create backup using SQLite backup API
    // Use the same path resolution as db.js (respects DATA_DIR environment variable)
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    const dbPath = path.join(dataDir, 'sop.db');
    
    console.log(`[BACKUP] Looking for database at: ${dbPath}`);
    console.log(`[BACKUP] DATA_DIR env var: ${process.env.DATA_DIR || 'not set'}`);
    
    // Verify source database exists
    if (!fs.existsSync(dbPath)) {
      return res.status(500).json({ 
        message: `Source database not found: ${dbPath}` 
      });
    }
    
    console.log(`[BACKUP] ✓ Database found at: ${dbPath}`);
    
    // Write to a .partial file, verify it, then rename (see backupScheduler.writeVerifiedBackup)
    const { writeVerifiedBackup } = require('./backupScheduler');
    await writeVerifiedBackup(backupPath);

    // Verify backup was created successfully
    if (!fs.existsSync(backupPath)) {
      return res.status(500).json({
        message: 'Backup file was not created successfully' 
      });
    }

    const stats = fs.statSync(backupPath);
    const sizeBytes = stats.size;

    // Record backup in database
    const userId = req.user.id;
    db.prepare('INSERT INTO backups (file_name, size_bytes, created_by) VALUES (?, ?, ?)').run(
      backupFilename,
      sizeBytes,
      userId
    );

    // Update last success
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'backup.last_success',
      new Date().toISOString()
    );
    
    // Clear last error
    db.prepare('DELETE FROM settings WHERE key = ?').run('backup.last_error');

    // Run cleanup
    const { cleanupOldBackups } = require('./backupScheduler');
    cleanupOldBackups();


    res.json({
      filename: backupFilename,
      size_bytes: sizeBytes,
      created_at: new Date().toISOString(),
      path: backupPath,
      directory: backupDir,
    });
  } catch (err) {
    console.error('Backup error:', err);
    
    // Update last error
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'backup.last_error',
      err.message || 'Failed to create backup'
    );
    
    res.status(500).json({ message: err.message || 'Failed to create backup' });
  }
});

// Upload backup - handle multer errors with custom error handler
router.post('/backup/upload', requireRole(['ADMIN']), (req, res, next) => {
  backupUpload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error during backup upload:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 100MB.' });
      }
      if (err.message && err.message.includes('.db')) {
        return res.status(400).json({ message: 'Only .db files are allowed' });
      }
      return res.status(500).json({ 
        message: `Upload failed: ${err.message || 'Unknown error'}` 
      });
    }
    next();
  });
}, async (req, res) => {
  let testDb = null;
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    uploadedFilePath = req.file.path;
    console.log(`[BACKUP UPLOAD] File received: ${req.file.originalname}, size: ${req.file.size}, path: ${uploadedFilePath}`);

    // Validate file exists and is readable
    if (!fs.existsSync(uploadedFilePath)) {
      return res.status(500).json({ message: 'Uploaded file not found on server' });
    }

    const stats = fs.statSync(uploadedFilePath);
    if (stats.size === 0) {
      fs.unlinkSync(uploadedFilePath);
      return res.status(400).json({ message: 'Uploaded file is empty' });
    }

    // Validate it's a valid SQLite database with better error handling
    try {
      const Database = require('better-sqlite3');
      
      // Open database in read-only mode to avoid locking issues
      testDb = new Database(uploadedFilePath, { readonly: true });
      
      // Try a simple query to validate the database
      assertUsableBackup(testDb);
      
      // Close the database properly
      testDb.close();
      testDb = null;
      
      console.log(`[BACKUP UPLOAD] Database validation successful for: ${req.file.originalname}`);
    } catch (dbErr) {
      console.error('[BACKUP UPLOAD] Invalid database file:', dbErr);
      
      // Ensure database is closed
      if (testDb) {
        try {
          testDb.close();
        } catch (closeErr) {
          console.error('Error closing test database:', closeErr);
        }
        testDb = null;
      }
      
      // Clean up invalid file
      try {
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
      } catch (unlinkErr) {
        console.error('Failed to delete invalid backup file:', unlinkErr);
      }
      
      return res.status(400).json({ 
        message: `Invalid database file: ${dbErr.message || 'File is not a valid SQLite database. Please ensure the file is a valid .db backup file.'}` 
      });
    }

    // Success - return file info
    res.json({
      filename: req.file.filename,
      size_bytes: req.file.size,
      path: req.file.path,
      message: 'Backup uploaded successfully. Use restore endpoint to apply it.',
    });
  } catch (err) {
    console.error('[BACKUP UPLOAD] Error processing backup upload:', err);
    console.error('[BACKUP UPLOAD] Error stack:', err.stack);
    
    // Ensure database is closed
    if (testDb) {
      try {
        testDb.close();
      } catch (closeErr) {
        console.error('Error closing test database in error handler:', closeErr);
      }
    }
    
    // Try to clean up uploaded file if it exists
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
      } catch (unlinkErr) {
        console.error('Failed to delete uploaded file after error:', unlinkErr);
      }
    }
    
    res.status(500).json({ 
      message: `Upload processing failed: ${err.message || 'Unknown error occurred during upload'}` 
    });
  }
});

// Restore from backup
router.post('/backup/restore/:filename', requireRole(['ADMIN']), async (req, res) => {
  try {
    const { filename } = req.params;
    const backupDir = getBackupDir();

    // Validate filename to prevent directory traversal (same rule as the delete endpoint)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    // Validate the backup file is a valid SQLite database
    let testDb = null;
    try {
      const Database = require('better-sqlite3');
      testDb = new Database(backupPath, { readonly: true });
      assertUsableBackup(testDb);
      testDb.close();
      testDb = null;
    } catch (dbErr) {
      if (testDb) {
        try {
          testDb.close();
        } catch (closeErr) {
          // Ignore
        }
      }
      return res.status(400).json({ 
        message: `Invalid backup file: ${dbErr.message || 'File is not a valid SQLite database'}` 
      });
    }

    // Create a backup of current database before restoring (if it exists and is readable)
    const currentBackupPath = path.join(
      backupDir,
      `pre_restore_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`
    );
    
    // Use the same path resolution as db.js (respects DATA_DIR environment variable)
    let dataDir = process.env.DATA_DIR;
    if (!dataDir) {
      const appName = 'SOP';
      if (process.platform === 'win32') {
        dataDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'data');
      } else {
        dataDir = path.join(os.homedir(), '.config', appName, 'data');
      }
    }
    const dbPath = path.join(dataDir, 'sop.db');
    
    // Try to backup current database, but don't fail if it's corrupted
    if (fs.existsSync(dbPath)) {
      try {
        // Try using the database backup method
        const backupPromise = db.backup(currentBackupPath);
        if (backupPromise && typeof backupPromise.then === 'function') {
          await backupPromise;
        }
        console.log(`[RESTORE] Created pre-restore backup: ${currentBackupPath}`);
      } catch (backupErr) {
        // If database is corrupted, just copy the file directly
        console.log(`[RESTORE] Database backup method failed (may be corrupted), using file copy: ${backupErr.message}`);
        try {
          fs.copyFileSync(dbPath, currentBackupPath);
          console.log(`[RESTORE] Created pre-restore backup via file copy: ${currentBackupPath}`);
        } catch (copyErr) {
          console.warn(`[RESTORE] Could not create pre-restore backup: ${copyErr.message}`);
          // Continue anyway - the restore is more important
        }
      }
    }

    // Copy backup file to main database location
    // Note: We don't close the database connection here as it's a singleton
    // The connection will be re-established when the server restarts
    fs.copyFileSync(backupPath, dbPath);
    console.log(`[RESTORE] Database restored from: ${backupPath} to ${dbPath}`);

    res.json({
      message: 'Database restored successfully. The server will need to be restarted to use the restored database.',
      warning: 'Please restart the server/application to complete the restore',
      restored_from: filename,
      restart_required: true,
    });
  } catch (err) {
    console.error('[RESTORE] Error:', err);
    res.status(500).json({ 
      message: `Restore failed: ${err.message || 'Unknown error'}`,
      error: err.message
    });
  }
});

// Delete backup file (allow ADMIN, MANAGER, and CASHIER)
router.delete('/backup/:filename', requireRole(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const { filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    
    const backupDir = getBackupDir();
    const backupPath = path.join(backupDir, decodedFilename);

    // Validate filename to prevent directory traversal
    if (decodedFilename.includes('..') || decodedFilename.includes('/') || decodedFilename.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    // Delete the file
    fs.unlinkSync(backupPath);

    // Remove from database
    db.prepare('DELETE FROM backups WHERE file_name = ?').run(decodedFilename);

    res.json({ message: 'Backup deleted successfully' });
  } catch (err) {
    console.error('Error deleting backup:', err);
    res.status(500).json({ message: err.message || 'Failed to delete backup' });
  }
});

// Reset system (clear all data except admin user and system tables)
router.post('/reset', requireRole(['ADMIN']), async (req, res) => {
  try {
    const { confirmation } = req.body;
    if (confirmation !== 'RESET') {
      return res.status(400).json({ message: 'Confirmation required. Type "RESET" to confirm.' });
    }

    // Get admin user info before deletion
    const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!adminUser) {
      return res.status(400).json({ message: 'Admin user not found' });
    }

    // Get admin role ID
    const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('ADMIN');

    // Never wipe the shop's data without a verified copy to come back to
    const preResetPath = path.join(
      getBackupDir(),
      `pre_reset_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`
    );
    try {
      const { writeVerifiedBackup } = require('./backupScheduler');
      await writeVerifiedBackup(preResetPath);
    } catch (backupErr) {
      return res.status(500).json({ message: `Reset cancelled: could not create a backup first (${backupErr.message})` });
    }

    // Delete all data from tables (in correct order to respect foreign keys)
    const tablesToClear = [
      'stock_movements',
      'invoice_items',
      'payments',
      'invoices',
      'expenses',
      'sessions',
      'products',
      'customers',
      'categories',
      'expense_categories',
    ];

    db.exec('PRAGMA foreign_keys = OFF');
    // All-or-nothing: a failure part-way must not leave half the data deleted
    db.transaction(() => {
      tablesToClear.forEach((table) => {
        db.prepare(`DELETE FROM ${table}`).run();
      });
    })();

    // Reset sequences/auto-increment
    db.exec('DELETE FROM sqlite_sequence WHERE name IN (' + tablesToClear.map(() => '?').join(',') + ')', tablesToClear);

    // Delete all users except admin
    db.prepare('DELETE FROM users WHERE username != ?').run('admin');

    // Ensure admin user exists with correct role
    const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!existingAdmin) {
      // Recreate admin if somehow deleted
      const bcrypt = require('bcryptjs');
      const passwordHash = bcrypt.hashSync('admin', 10);
      db.prepare('INSERT INTO users (username, password_hash, role_id, is_active) VALUES (?, ?, ?, 1)').run(
        'admin',
        passwordHash,
        adminRole.id
      );
    }

    db.exec('PRAGMA foreign_keys = ON');

    res.json({ message: 'System reset successfully. All data cleared except admin user.', backup: path.basename(preResetPath) });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: err.message || 'Failed to reset system' });
  }
});

// Upload logo
router.post('/logo', requireRole(['ADMIN', 'MANAGER']), logoUpload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoPath = `uploads/logo/${req.file.filename}`;
    
    // Save logo path in settings
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('shop.logo_path', logoPath);

    res.json({
      logo_path: logoPath,
      filename: req.file.filename,
      size_bytes: req.file.size,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get logo
router.get('/logo', (req, res) => {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('shop.logo_path');
    
    if (setting && setting.value && setting.value.trim()) {
      // Handle both absolute and relative paths
      let logoPath = setting.value.trim();
      
      // If it's a relative path, resolve it using UPLOADS_DIR or default uploads directory
      if (!path.isAbsolute(logoPath)) {
        // Use UPLOADS_DIR environment variable if set (for production), otherwise use relative path
        // logoPath is like "uploads/logo/logo.png", so we need to extract just "logo/logo.png"
        const logoRelativePath = logoPath.replace(/^uploads\//, '');
        logoPath = path.join(uploadsBaseDir, logoRelativePath);
      }
      
      // Resolve to absolute path
      logoPath = path.resolve(logoPath);
      
      console.log(`[LOGO] Attempting to serve logo from: ${logoPath}`);
      console.log(`[LOGO] File exists: ${fs.existsSync(logoPath)}`);
      
      if (fs.existsSync(logoPath)) {
        // Determine content type based on file extension
        const ext = path.extname(logoPath).toLowerCase();
        const contentTypeMap = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        };
        const contentType = contentTypeMap[ext] || 'image/jpeg';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        console.log(`[LOGO] ✓ Serving logo: ${logoPath}`);
        return res.sendFile(logoPath);
      } else {
        console.error(`[LOGO] ✗ Logo file not found at: ${logoPath}`);
        // Try to list the uploads directory to see what's there
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          console.error(`[LOGO] Files in logo directory: ${files.join(', ')}`);
        } else {
          console.error(`[LOGO] Logo directory does not exist: ${uploadsDir}`);
        }
      }
    } else {
      console.error('[LOGO] ✗ No logo path found in settings');
    }
    res.status(404).json({ message: 'Logo not found' });
  } catch (err) {
    console.error('[LOGO] ✗ Error serving logo:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  settingsRouter: router,
};
