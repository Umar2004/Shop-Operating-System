const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { paths } = require('./config');

// The offline queue: a folder in DATA_DIR (on the app's own drive, so it works when the backup drive is unplugged).
// Each entry is <name>.db.gz (a gzip of a verified backup) + <name>.json (what the uploader needs). It survives
// restarts and restores (it is not in the database). An entry is removed only after Drive confirms the same bytes.
const MAX_FILES = Number(process.env.SOP_CLOUD_OUTBOX_MAX_FILES || 20);
const MAX_BYTES = Number(process.env.SOP_CLOUD_OUTBOX_MAX_BYTES || 50 * 1024 * 1024);
const STALE_MS = 10 * 60_000;

const ensureDir = () => fs.mkdirSync(paths.outbox, { recursive: true });
const sidecar = (name) => path.join(paths.outbox, `${name}.json`);
const gzFile = (name) => path.join(paths.outbox, `${name}.db.gz`);

function hashes(file) {
  const buf = fs.readFileSync(file);
  return {
    size: buf.length,
    md5: crypto.createHash('md5').update(buf).digest('hex'),
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

// Adds a verified backup file to the queue (gzip in a stream; nothing waits on this)
async function add(sourceDbPath, kind, createdAt = new Date()) {
  ensureDir();
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const name = `sop_backup_${stamp}_${kind}`;
  const partial = `${gzFile(name)}.partial`;
  await pipeline(fs.createReadStream(sourceDbPath), zlib.createGzip({ level: 9 }), fs.createWriteStream(partial));
  fs.renameSync(partial, gzFile(name));
  const entry = { name, kind, createdAt: createdAt.toISOString(), ...hashes(gzFile(name)), attempts: 0, nextAttemptAt: 0, lastError: null };
  fs.writeFileSync(sidecar(name), JSON.stringify(entry, null, 2));
  trim();
  return { ...entry, file: gzFile(name) };
}

// Oldest first. Entries without both files (an interrupted write) are cleaned up.
function list() {
  if (!fs.existsSync(paths.outbox)) return [];
  const entries = [];
  for (const f of fs.readdirSync(paths.outbox)) {
    if (f.endsWith('.partial') || f.endsWith('.tmp.db')) {
      // left by a crash mid-write; a recent one may still be being written, so only old ones go
      try {
        const p = path.join(paths.outbox, f);
        if (Date.now() - fs.statSync(p).mtimeMs > STALE_MS) fs.unlinkSync(p);
      } catch (_) {}
      continue;
    }
    if (!f.endsWith('.json')) continue;
    const name = f.slice(0, -5);
    try {
      const entry = JSON.parse(fs.readFileSync(sidecar(name), 'utf8'));
      if (!fs.existsSync(gzFile(name))) throw new Error('data missing');
      entries.push({ ...entry, file: gzFile(name) });
    } catch (_) {
      remove(name);
    }
  }
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function update(name, patch) {
  if (!fs.existsSync(sidecar(name))) return null; // removed meanwhile (uploaded, trimmed, or disconnected)
  const entry = { ...JSON.parse(fs.readFileSync(sidecar(name), 'utf8')), ...patch };
  fs.writeFileSync(sidecar(name), JSON.stringify(entry, null, 2));
  return entry;
}

function remove(name) {
  for (const f of [gzFile(name), sidecar(name)]) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

// Caps the queue (a PC offline for weeks must not fill its disk): drop the oldest day-end copies first,
// so weekly and monthly ones are the last to go. The newest entry is never dropped.
function trim() {
  let entries = list();
  const bytes = () => entries.reduce((s, e) => s + e.size, 0);
  const dropped = [];
  while (entries.length > 1 && (entries.length > MAX_FILES || bytes() > MAX_BYTES)) {
    const candidates = entries.slice(0, -1);
    const victim = candidates.find((e) => e.kind === 'day-end') || candidates[0];
    remove(victim.name);
    dropped.push(victim.name);
    entries = entries.filter((e) => e !== victim);
  }
  return dropped;
}

function clear() {
  for (const e of list()) remove(e.name);
}

module.exports = { add, list, update, remove, trim, clear, hashes };
