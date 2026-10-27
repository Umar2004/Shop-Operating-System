const fs = require('fs');
const path = require('path');
const { loadClient, timing, paths } = require('./config');
const dpapi = require('./dpapi');
const store = require('./store');
const outbox = require('./outbox');
const drive = require('./drive');
const oauth = require('./oauth');
const { selectKeep } = require('./rotation');
const { CloudError } = require('./http');

// The background uploader. Nothing in a request handler awaits it: backups only drop a file in the outbox and
// call kick(). It uploads oldest first, one at a time, verifies Drive's md5 against the local copy, then rotates.
const BACKOFF_STEPS = [1, 2, 5, 15, 30, 60]; // in timing().backoffUnitMs (1 minute in the app)
const OFFLINE_CAP = 15; // no internet is not a fault: check again at least every 15 minutes

let running = null;
let again = false;
let tickTimer = null;

const logActivity = (entry) => {
  try {
    require('../activityLog').logActivity(entry);
  } catch (_) {
    // logging must never break an upload
  }
};

const isConfigured = () => !!loadClient();
const isConnected = () => isConfigured() && store.hasToken();

// Delay before the next try after `attempts` failures, ±20% so many retries don't line up
function backoffMs(attempts, kind, rand = Math.random) {
  let steps = BACKOFF_STEPS[Math.min(Math.max(attempts, 1), BACKOFF_STEPS.length) - 1];
  if (kind === 'offline') steps = Math.min(steps, OFFLINE_CAP);
  return Math.round(steps * timing().backoffUnitMs * (0.8 + 0.4 * rand()));
}

// The outcome is recorded in cloud-state.json; a failure is logged once when it starts (not every retry)
function recordFailure(err, entry) {
  const prev = store.readState();
  const lastError = { at: new Date().toISOString(), kind: err.kind || 'error', message: err.message, file: entry && entry.name };
  // by kind, not message: "no connection" comes with varying low-level codes on each retry
  const isNew = !prev.lastError || prev.lastError.kind !== lastError.kind || (prev.lastSuccess && prev.lastSuccess.at > prev.lastError.at);
  store.writeState({ lastError, ...(err.kind === 'auth' ? { authProblem: err.message } : {}) });
  if (isNew) logActivity({ action: 'CLOUD_UPLOAD_FAILED', entityType: 'BACKUP', details: { file: lastError.file, reason: lastError.kind, error: err.message } });
}

async function uploadEntry(entry) {
  const remote = await drive.upload(entry.file, `${entry.name}.db.gz`, { kind: entry.kind, createdAt: entry.createdAt, sha256: entry.sha256 });
  if (String(remote.md5Checksum).toLowerCase() !== entry.md5 || Number(remote.size) !== entry.size) {
    await drive.remove(remote.id).catch(() => {});
    throw new CloudError('verify', 'The copy on Google Drive did not match the local one (checksum); it will be sent again');
  }
  outbox.remove(entry.name);
  const st = store.readState();
  const lastSuccess = { at: new Date().toISOString(), file: entry.name, kind: entry.kind, size: entry.size, driveId: remote.id };
  store.writeState({ lastSuccess, authProblem: null, recent: [lastSuccess, ...(st.recent || [])].slice(0, 10) });
  logActivity({ action: 'CLOUD_UPLOADED', entityType: 'BACKUP', details: { file: entry.name, kind: entry.kind, size_bytes: entry.size } });
}

// Deletes cloud copies outside the 14 daily / 8 weekly / 12 monthly set. Only after a verified upload.
async function rotate() {
  const files = await drive.listBackups();
  const items = files.map((f) => ({ id: f.id, time: new Date((f.appProperties && f.appProperties.createdAt) || f.createdTime) }))
    .filter((f) => !Number.isNaN(f.time.getTime()));
  const { remove } = selectKeep(items);
  let deleted = 0;
  for (const id of remove) {
    await drive.remove(id);
    deleted++;
  }
  if (deleted) logActivity({ action: 'CLOUD_ROTATED', entityType: 'BACKUP', details: { deleted, kept: items.length - deleted } });
  return deleted;
}

async function runOnce({ force = false } = {}) {
  if (!isConnected()) return;
  if (!force && store.readState().authProblem) return; // waits for a reconnect (or "Upload now")
  let uploaded = 0;
  for (const entry of outbox.list()) {
    if (!force && entry.nextAttemptAt > Date.now()) continue;
    try {
      await uploadEntry(entry);
      uploaded++;
    } catch (err) {
      if (!(err instanceof CloudError)) err = new CloudError('error', err.message);
      recordFailure(err, entry);
      if (err.kind === 'auth' || err.kind === 'config') break; // nothing else will work either
      const attempts = (entry.attempts || 0) + 1;
      outbox.update(entry.name, { attempts, nextAttemptAt: Date.now() + backoffMs(attempts, err.kind), lastError: err.message });
      if (err.kind === 'offline') break; // the rest would fail the same way
    }
  }
  if (uploaded) {
    try {
      await rotate();
    } catch (err) {
      console.error(`[CLOUD] Rotation skipped: ${err.message}`);
    }
  }
}

// Runs the uploader now, unless it is already running (then once more right after). Never throws.
function kick(opts) {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce(opts);
      } while (again);
    } catch (err) {
      console.error(`[CLOUD] Uploader error: ${err.message}`);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Puts a copy of a just-made backup in the queue. kind: 'day-end' | 'weekly' | 'monthly'.
// localPath may be null (the local backup failed, e.g. the backup drive is unplugged): then a fresh verified
// snapshot is taken into DATA_DIR, so the cloud still gets a copy. Called without await; never throws.
async function enqueue(kind, localPath) {
  if (!isConnected()) return null;
  try {
    let entry;
    if (localPath && fs.existsSync(localPath)) {
      entry = await outbox.add(localPath, kind);
    } else {
      fs.mkdirSync(paths.outbox, { recursive: true });
      const tmp = path.join(paths.outbox, `snapshot_${Date.now()}.tmp.db`);
      try {
        await require('../backupScheduler').writeVerifiedBackup(tmp);
        entry = await outbox.add(tmp, kind);
      } finally {
        try { fs.unlinkSync(tmp); } catch (_) {}
      }
    }
    if (!isConnected()) {
      // disconnected while the copy was being made
      outbox.remove(entry.name);
      return null;
    }
    kick();
    return entry;
  } catch (err) {
    console.error(`[CLOUD] Could not queue the ${kind} backup: ${err.message}`);
    recordFailure(new CloudError('queue', `Could not queue the backup for Google Drive: ${err.message}`));
    return null;
  }
}

function status() {
  const configured = isConfigured();
  const connected = configured && store.hasToken();
  const st = store.readState();
  const queue = connected ? outbox.list() : [];
  const failing = st.lastError && (!st.lastSuccess || st.lastError.at > st.lastSuccess.at);
  let state = 'ok';
  if (!configured) state = 'not-configured';
  else if (!dpapi.supported) state = 'unsupported';
  else if (!connected) state = 'disconnected';
  else if (st.authProblem) state = 'reconnect';
  else if (failing && st.lastError.kind === 'offline') state = 'offline';
  else if (failing) state = 'error';
  else if (!st.lastSuccess) state = queue.length ? 'waiting' : 'connected';
  const next = queue.reduce((m, e) => (e.nextAttemptAt && (!m || e.nextAttemptAt < m) ? e.nextAttemptAt : m), 0);
  return {
    configured,
    supported: dpapi.supported,
    connected,
    state,
    email: connected ? st.email || null : null,
    connectedAt: connected ? st.connectedAt || null : null,
    lastSuccess: connected ? st.lastSuccess || null : null,
    lastError: connected && failing ? { at: st.lastError.at, kind: st.lastError.kind, message: st.lastError.message } : null,
    queued: queue.length,
    nextAttemptAt: next ? new Date(next).toISOString() : null,
    uploading: !!running,
    connect: oauth.connectStatus(),
  };
}

// Starts the clock: a first look a minute after start-up (launch stays fast), then a check every minute.
function start() {
  if (tickTimer) return;
  const t = timing();
  setTimeout(() => kick(), t.startDelayMs).unref();
  tickTimer = setInterval(() => {
    if (isConnected()) kick();
  }, t.tickMs);
  tickTimer.unref();
}

module.exports = { start, kick, enqueue, status, isConfigured, isConnected, backoffMs, rotate, BACKOFF_STEPS };
