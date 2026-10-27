const cron = require('node-cron');
const db = require('./db');
const fs = require('fs');
const path = require('path');

let dailyJob = null;

// A scheduled backup and its result go to the activity log (no user: the app did it)
async function scheduledBackup(kind) {
  const { logActivity } = require('./activityLog');
  try {
    const result = await createBackup({ cloudKind: kind });
    logActivity({ action: 'BACKUP_CREATED', entityType: 'BACKUP', details: { file: result.filename, path: result.path, scheduled: kind } });
    cleanupOldBackups();
  } catch (err) {
    logActivity({ action: 'BACKUP_FAILED', entityType: 'BACKUP', details: { scheduled: kind, error: err.message } });
  }
}
let weeklyJob = null;
let monthlyJob = null;

// Where backups go: the folder set in Settings, or the default folder when none is set or the set one can't be
// created (e.g. the backup drive is unplugged). Returns { dir, configured, fallback, reason }, so the UI can show
// where backups really go instead of falling back silently.
const defaultBackupDir = () => path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'backups');
const resolveBackupDir = (defaultDir = defaultBackupDir()) => {
  let configured = null;
  let reason = null;
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup.path');
    if (setting && setting.value && setting.value.trim()) {
      configured = setting.value.trim();
      try {
        if (!fs.existsSync(configured)) {
          fs.mkdirSync(configured, { recursive: true });
        }
        return { dir: configured, configured, fallback: false, reason: null };
      } catch (dirErr) {
        reason = dirErr.message;
        console.error(`Backup folder ${configured} can't be used (${dirErr.message}); using ${defaultDir}`);
      }
    }
  } catch (err) {
    console.error('Error reading backup path setting:', err);
  }
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
  } catch (dirErr) {
    throw new Error(`Cannot create backup directory: ${defaultDir}. Error: ${dirErr.message}`);
  }
  return { dir: defaultDir, configured, fallback: !!configured, reason };
};
const getBackupDir = () => resolveBackupDir().dir;

// Remembers where the last backup really went (shown in Settings and on the Dashboard)
const recordBackupLocation = (location) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'backup.last_location',
    JSON.stringify({ dir: location.dir, fallback_from: location.fallback ? location.configured : null, at: new Date().toISOString() })
  );
};

// Back up the live database to `finalPath` atomically: SQLite backup API -> integrity check -> rename.
// Throws (and leaves no file at finalPath) if any step fails.
const writeVerifiedBackup = async (finalPath) => {
  const partialPath = `${finalPath}.partial`;
  try {
    await db.backup(partialPath);
    const Database = require('better-sqlite3');
    const check = new Database(partialPath, { readonly: true, fileMustExist: true });
    let result;
    try {
      result = check.pragma('integrity_check', { simple: true });
    } finally {
      check.close();
    }
    if (result !== 'ok') {
      throw new Error(`Backup failed verification: ${result}`);
    }
    fs.renameSync(partialPath, finalPath);
  } catch (err) {
    try { fs.unlinkSync(partialPath); } catch (_) {}
    throw err;
  }
};

// Create a backup. cloudKind ('day-end' | 'weekly' | 'monthly'): also queue a copy for Google Drive when it is
// connected. That is not awaited: the cloud never delays or fails a local backup.
const createBackup = async ({ cloudKind = null } = {}) => {
  const queueForCloud = (localPath) => {
    if (cloudKind) require('./cloud/uploader').enqueue(cloudKind, localPath);
  };
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFilename = `sop_backup_${timestamp}.db`;
    const location = resolveBackupDir();
    const backupDir = location.dir;
    const backupPath = path.join(backupDir, backupFilename);

    // Log the backup path being used
    console.log(`📦 Creating backup to: ${backupPath}`);
    
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
      throw new Error(`Cannot write to backup directory: ${backupDir}. Error: ${dirErr.message}`);
    }

    // Use the same path resolution as db.js (respects DATA_DIR environment variable)
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    const dbPath = path.join(dataDir, 'sop.db');
    
    console.log(`[BACKUP SCHEDULER] Looking for database at: ${dbPath}`);
    console.log(`[BACKUP SCHEDULER] DATA_DIR env var: ${process.env.DATA_DIR || 'not set'}`);
    
    // Verify source database exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Source database not found: ${dbPath}`);
    }
    
    console.log(`[BACKUP SCHEDULER] ✓ Database found at: ${dbPath}`);
    
    // Write to a .partial file, verify it, then rename: an interrupted backup can never look like a real one.
    // (No raw file-copy fallback: copying a live database file can produce a corrupt backup.)
    await writeVerifiedBackup(backupPath);

    // Verify backup was created successfully
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file was not created successfully');
    }

    const stats = fs.statSync(backupPath);
    const sizeBytes = stats.size;

    // Record backup in database (system user)
    db.prepare('INSERT INTO backups (file_name, size_bytes, created_by) VALUES (?, ?, NULL)').run(
      backupFilename,
      sizeBytes
    );

    // Update last success
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'backup.last_success',
      new Date().toISOString()
    );
    
    // Clear last error
    db.prepare('DELETE FROM settings WHERE key = ?').run('backup.last_error');
    recordBackupLocation(location);

    console.log(`✅ Backup created successfully: ${backupFilename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) at ${backupPath}`);
    queueForCloud(backupPath);
    return { 
      filename: backupFilename, 
      size_bytes: sizeBytes,
      path: backupPath,
      directory: backupDir,
      fallback_from: location.fallback ? location.configured : null,
    };
  } catch (err) {
    console.error('❌ Automatic backup failed:', err);
    
    // Update last error
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'backup.last_error',
      err.message || 'Failed to create backup'
    );
    // e.g. the backup drive is unplugged: the cloud copy is then taken from a fresh snapshot
    queueForCloud(null);
    throw err;
  }
};

// Cleanup old backups (keep last 30 days)
const cleanupOldBackups = () => {
  try {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    files.forEach((file) => {
      if (file.endsWith('.db') && file.startsWith('sop_backup_')) {
        const filePath = path.join(backupDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (err) {
          console.error(`Error deleting old backup ${file}:`, err);
        }
      }
    });

    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
    }
  } catch (err) {
    console.error('Error cleaning up old backups:', err);
  }
};

// Start scheduler
const startScheduler = () => {
  console.log('🔄 Starting backup scheduler...');
  updateScheduler();
  
  // Run cleanup daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    cleanupOldBackups();
  });
};

// Update scheduler based on settings
const updateScheduler = () => {
  // Stop existing jobs
  if (dailyJob) {
    dailyJob.stop();
    dailyJob = null;
  }
  if (weeklyJob) {
    weeklyJob.stop();
    weeklyJob = null;
  }
  if (monthlyJob) {
    monthlyJob.stop();
    monthlyJob = null;
  }

  try {
    // Get schedule settings
    const getSetting = (key, defaultValue) => {
      const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return setting ? setting.value : defaultValue;
    };

    const dailyEnabled = getSetting('backup.schedule.daily', 'disabled') === 'enabled';
    const weeklyEnabled = getSetting('backup.schedule.weekly', 'disabled') === 'enabled';
    const monthlyEnabled = getSetting('backup.schedule.monthly', 'disabled') === 'enabled';

    // Daily backup - Note: This is handled on day end, not via cron
    // We don't schedule daily via cron since it's triggered when ending the day

    // Weekly backup
    if (weeklyEnabled) {
      const weeklyDay = parseInt(getSetting('backup.schedule.weekly_day', '0'), 10); // 0 = Sunday
      const weeklyTime = getSetting('backup.schedule.weekly_time', '02:00');
      const [hours, minutes] = weeklyTime.split(':').map(Number);

      // Convert day of week: 0=Sunday, 1=Monday, etc.
      // node-cron uses 0=Sunday, 1=Monday, etc. (same format)
      const cronExpression = `${minutes} ${hours} * * ${weeklyDay}`;
      
      weeklyJob = cron.schedule(cronExpression, async () => {
        console.log('📅 Weekly backup triggered');
        await scheduledBackup('weekly');
      }, {
        scheduled: true,
        timezone: 'UTC'
      });
      
      console.log(`✅ Weekly backup scheduled: Day ${weeklyDay} at ${weeklyTime}`);
    }

    // Monthly backup
    if (monthlyEnabled) {
      const monthlyDay = parseInt(getSetting('backup.schedule.monthly_day', '1'), 10);
      const monthlyTime = getSetting('backup.schedule.monthly_time', '02:00');
      const [hours, minutes] = monthlyTime.split(':').map(Number);

      // Monthly: day of month at specified time
      const cronExpression = `${minutes} ${hours} ${monthlyDay} * *`;
      
      monthlyJob = cron.schedule(cronExpression, async () => {
        console.log('📅 Monthly backup triggered');
        await scheduledBackup('monthly');
      }, {
        scheduled: true,
        timezone: 'UTC'
      });
      
      console.log(`✅ Monthly backup scheduled: Day ${monthlyDay} at ${monthlyTime}`);
    }

    console.log('✅ Backup scheduler updated');
  } catch (err) {
    console.error('❌ Error updating backup scheduler:', err);
  }
};

module.exports = {
  startScheduler,
  updateScheduler,
  createBackup,
  cleanupOldBackups,
  getBackupDir,
  resolveBackupDir,
  recordBackupLocation,
  writeVerifiedBackup,
};

