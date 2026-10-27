const fs = require('fs');
const path = require('path');
const db = require('../db');

// Google Drive backup: where its files live and which Google OAuth client it uses.
// Everything sits next to the database (DATA_DIR), never inside it, so no backup ever carries it.
const dataDir = path.dirname(db.name);
const paths = {
  token: path.join(dataDir, '.gdrive-token'), // DPAPI-encrypted refresh token
  state: path.join(dataDir, 'cloud-state.json'), // connected account, folder id, last result (no secrets)
  outbox: path.join(dataDir, 'cloud-outbox'), // the offline queue: <name>.db.gz + <name>.json
  restoreTmp: path.join(dataDir, 'cloud-restore.tmp'),
};

// The OAuth client ("Desktop app" client from Google Cloud). Not hardcoded: the first of these that has a client id
//   1. env SOP_GOOGLE_CLIENT_ID + SOP_GOOGLE_CLIENT_SECRET
//   2. DATA_DIR/google-oauth.json            (per PC)
//   3. backend/config/google-oauth.json      (shipped with the installer)
// A JSON file may be the one Google's console downloads ({"installed": {...}}) or {"client_id", "client_secret"}.
const configFiles = [path.join(dataDir, 'google-oauth.json'), path.join(__dirname, '..', '..', 'config', 'google-oauth.json')];

function loadClient() {
  if (process.env.SOP_GOOGLE_CLIENT_ID) {
    return { clientId: process.env.SOP_GOOGLE_CLIENT_ID, clientSecret: process.env.SOP_GOOGLE_CLIENT_SECRET || '', source: 'env' };
  }
  for (const file of configFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const c = raw.installed || raw.web || raw;
      if (c && c.client_id) return { clientId: c.client_id, clientSecret: c.client_secret || '', source: file };
    } catch (_) {
      // missing or unreadable: try the next one
    }
  }
  return null;
}

// Google endpoints; the env overrides exist only so the tests can point them at a local mock
const endpoints = () => ({
  auth: process.env.SOP_GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: process.env.SOP_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  revoke: process.env.SOP_GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
  api: process.env.SOP_GOOGLE_DRIVE_API || 'https://www.googleapis.com/drive/v3',
  upload: process.env.SOP_GOOGLE_DRIVE_UPLOAD || 'https://www.googleapis.com/upload/drive/v3',
});

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Shop Operating Platform Backups';

// Timing; the env overrides are for the tests (they run the same code with a shorter clock)
const timing = () => ({
  startDelayMs: Number(process.env.SOP_CLOUD_START_DELAY_MS || 60_000), // first look after the backend starts
  tickMs: Number(process.env.SOP_CLOUD_TICK_MS || 60_000), // how often the uploader checks the queue
  backoffUnitMs: Number(process.env.SOP_CLOUD_BACKOFF_UNIT_MS || 60_000), // the back-off steps are in these units
  requestTimeoutMs: Number(process.env.SOP_CLOUD_REQUEST_TIMEOUT_MS || 30_000),
  uploadTimeoutMs: Number(process.env.SOP_CLOUD_UPLOAD_TIMEOUT_MS || 10 * 60_000),
});

module.exports = { paths, loadClient, endpoints, timing, DRIVE_SCOPE, FOLDER_NAME };
