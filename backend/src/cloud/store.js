const fs = require('fs');
const { paths } = require('./config');
const dpapi = require('./dpapi');

// The refresh token: DPAPI-encrypted in DATA_DIR/.gdrive-token, readable only by this Windows user on this PC.
// Decrypted once and kept in memory. It is never written to the database, a log or a backup.
let cachedRefreshToken = null;

const hasToken = () => fs.existsSync(paths.token);

async function saveRefreshToken(refreshToken) {
  const blob = await dpapi.protect(Buffer.from(refreshToken, 'utf8'));
  const tmp = `${paths.token}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, dpapi: blob.toString('base64') }), { mode: 0o600 });
  fs.renameSync(tmp, paths.token);
  cachedRefreshToken = refreshToken;
}

async function loadRefreshToken() {
  if (cachedRefreshToken) return cachedRefreshToken;
  if (!hasToken()) return null;
  const { dpapi: blob } = JSON.parse(fs.readFileSync(paths.token, 'utf8'));
  cachedRefreshToken = (await dpapi.unprotect(Buffer.from(blob, 'base64'))).toString('utf8');
  return cachedRefreshToken;
}

function deleteRefreshToken() {
  cachedRefreshToken = null;
  try { fs.unlinkSync(paths.token); } catch (_) {}
}

// Non-secret state: connected account, Drive folder id, last success/error, recent uploads
function readState() {
  try {
    return JSON.parse(fs.readFileSync(paths.state, 'utf8'));
  } catch (_) {
    return {};
  }
}

// Only while connected: an upload still running when the owner disconnects must not bring the state back
function writeState(patch) {
  if (!hasToken()) return readState();
  const next = { ...readState(), ...patch };
  const tmp = `${paths.state}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, paths.state);
  return next;
}

function clearState() {
  try { fs.unlinkSync(paths.state); } catch (_) {}
}

module.exports = { hasToken, saveRefreshToken, loadRefreshToken, deleteRefreshToken, readState, writeState, clearState };
