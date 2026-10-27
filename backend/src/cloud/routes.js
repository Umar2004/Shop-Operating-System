const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { requireRole, requirePermission } = require('../auth');
const { logActivity } = require('../activityLog');
const { paths } = require('./config');
const dpapi = require('./dpapi');
const store = require('./store');
const outbox = require('./outbox');
const oauth = require('./oauth');
const drive = require('./drive');
const uploader = require('./uploader');

// /api/cloud: Google Drive backup. Status for the Dashboard (ADMIN/MANAGER); everything else is ADMIN only.
const router = express.Router();
const admin = [requirePermission('settings'), requireRole(['ADMIN'])];

router.get('/status', requirePermission('dashboard', 'settings'), requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const s = uploader.status();
  if (req.user.role !== 'ADMIN') {
    // a manager sees whether it works, not the account or the error details
    return res.json({ configured: s.configured, connected: s.connected, state: s.state, lastSuccess: s.lastSuccess && { at: s.lastSuccess.at }, queued: s.queued });
  }
  res.json(s);
});

// Starts the Google sign-in; the app window opens the returned URL in the system browser
router.post('/connect', ...admin, async (req, res) => {
  if (!uploader.isConfigured()) return res.status(400).json({ message: 'Google Drive backup is not set up on this PC (no Google sign-in client configured)' });
  if (!dpapi.supported) return res.status(400).json({ message: 'Google Drive backup needs Windows' });
  const userId = req.user.id;
  try {
    const authUrl = await oauth.startConnect((email) => {
      logActivity({ userId, action: 'CLOUD_CONNECTED', entityType: 'BACKUP', details: { account: email } });
      uploader.kick();
    });
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/connect/cancel', ...admin, (req, res) => {
  oauth.cancelConnect();
  res.json({ ok: true });
});

// Disconnect: ask Google to forget the token, delete it here, and empty the queue (it was for that account).
// Local backups are not touched.
router.post('/disconnect', ...admin, async (req, res) => {
  oauth.cancelConnect();
  const account = store.readState().email || null;
  const revoked = await oauth.revoke();
  store.deleteRefreshToken();
  outbox.clear();
  store.clearState();
  logActivity({ userId: req.user.id, action: 'CLOUD_DISCONNECTED', entityType: 'BACKUP', details: { account, revoked_at_google: revoked } });
  res.json({ ok: true, revoked });
});

// Tries the queue now, ignoring back-off (answers at once; the upload runs on)
router.post('/upload-now', ...admin, (req, res) => {
  if (!uploader.isConnected()) return res.status(400).json({ message: 'Google Drive is not connected' });
  uploader.kick({ force: true });
  res.json(uploader.status());
});

const needsConnection = (req, res, next) => (uploader.isConnected() ? next() : res.status(400).json({ message: 'Google Drive is not connected' }));
const cloudError = (res, err) => res.status(err.kind === 'offline' ? 503 : err.kind === 'auth' ? 401 : 502).json({ message: err.message, kind: err.kind || 'error' });

// The cloud copies, newest first (asked for by the owner, so this one does wait on Google)
router.get('/backups', ...admin, needsConnection, async (req, res) => {
  try {
    const files = await drive.listBackups();
    res.json(files.map((f) => ({
      id: f.id,
      name: f.name,
      size_bytes: Number(f.size) || 0,
      kind: (f.appProperties && f.appProperties.kind) || null,
      created_at: (f.appProperties && f.appProperties.createdAt) || f.createdTime,
    })));
  } catch (err) {
    cloudError(res, err);
  }
});

// Restore, step 1: download a cloud copy, check it (md5 from Drive, gunzip, integrity + tables) and save it in the
// backup folder as an ordinary backup file. Step 2 is the existing restore (POST /settings/backup/restore/:filename),
// with its confirmation and its pre-restore backup.
router.post('/backups/:id/prepare-restore', ...admin, needsConnection, async (req, res) => {
  const tmpGz = paths.restoreTmp;
  let target = null;
  try {
    const meta = await drive.getMeta(req.params.id);
    if (!meta.appProperties || meta.appProperties.sop !== '1' || meta.trashed) return res.status(404).json({ message: 'Not a backup made by this app' });
    await drive.download(meta.id, tmpGz);
    const md5 = crypto.createHash('md5').update(fs.readFileSync(tmpGz)).digest('hex');
    if (meta.md5Checksum && md5 !== String(meta.md5Checksum).toLowerCase()) throw new Error('The downloaded copy did not match Google Drive (checksum). Try again.');

    const { getBackupDir } = require('../backupScheduler');
    const base = String(meta.name).replace(/\.db\.gz$/i, '').replace(/[^\w.-]/g, '_');
    const filename = `cloud_${base}.db`;
    target = path.join(getBackupDir(), filename);
    await pipeline(fs.createReadStream(tmpGz), zlib.createGunzip(), fs.createWriteStream(`${target}.partial`));
    const Database = require('better-sqlite3');
    const check = new Database(`${target}.partial`, { readonly: true, fileMustExist: true });
    try {
      require('../settings').assertUsableBackup(check);
    } finally {
      check.close();
    }
    fs.renameSync(`${target}.partial`, target);
    logActivity({ userId: req.user.id, action: 'CLOUD_DOWNLOADED', entityType: 'BACKUP', details: { file: meta.name, saved_as: filename } });
    res.json({ filename });
  } catch (err) {
    if (target) { try { fs.unlinkSync(`${target}.partial`); } catch (_) {} }
    if (err.kind) cloudError(res, err);
    else res.status(400).json({ message: err.message });
  } finally {
    try { fs.unlinkSync(tmpGz); } catch (_) {}
  }
});

module.exports = { cloudRouter: router };
