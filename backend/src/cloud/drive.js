const fs = require('fs');
const { endpoints, timing, FOLDER_NAME } = require('./config');
const { getAccessToken, dropAccessToken } = require('./oauth');
const { CloudError, request, json } = require('./http');
const store = require('./store');

// The few Drive v3 calls the backup needs. With the drive.file scope the app only ever sees what it created.
// Every file it uploads carries appProperties.sop = '1' (plus kind and time), and only those are ever deleted.

async function call(url, opts = {}, retried = false) {
  const token = await getAccessToken();
  const res = await request(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    dropAccessToken(); // expired early: get a new one once
    return call(url, opts, true);
  }
  return res;
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// The app's backup folder (created on first use; its id is remembered in cloud-state.json)
async function ensureFolder() {
  const known = store.readState().folderId;
  if (known) {
    const res = await call(`${endpoints().api}/files/${encodeURIComponent(known)}?fields=id,trashed`);
    if (res.ok) {
      const f = await res.json();
      if (!f.trashed) return known;
    } else if (res.status !== 404) {
      await json(res); // throws Google's error
    }
  }
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${q(FOLDER_NAME)}' and trashed = false and appProperties has { key='sop' and value='folder' }`;
  const found = await json(await call(`${endpoints().api}/files?${new URLSearchParams({ q: query, fields: 'files(id)', spaces: 'drive' })}`));
  let id = found.files && found.files[0] && found.files[0].id;
  if (!id) {
    const created = await json(await call(`${endpoints().api}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { sop: 'folder' } }),
    }));
    id = created.id;
  }
  store.writeState({ folderId: id });
  return id;
}

// Resumable upload (works for any size): start a session, then send the bytes. Returns { id, md5Checksum, size }.
async function upload(filePath, name, appProperties) {
  const folderId = await ensureFolder();
  const size = fs.statSync(filePath).size;
  const start = await call(`${endpoints().upload}/files?uploadType=resumable&fields=id,name,md5Checksum,size`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/gzip', 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/gzip', appProperties: { sop: '1', ...appProperties } }),
  });
  if (!start.ok) await json(start);
  const session = start.headers.get('location');
  if (!session) throw new CloudError('http', 'Google did not start the upload');
  const res = await call(session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/gzip' },
    body: fs.readFileSync(filePath),
    timeoutMs: timing().uploadTimeoutMs,
  });
  return json(res);
}

// Every backup file the app put in its folder: [{ id, name, size, md5Checksum, createdTime, appProperties }]
async function listBackups() {
  const folderId = await ensureFolder();
  const files = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${q(folderId)}' in parents and trashed = false and appProperties has { key='sop' and value='1' }`,
      fields: 'nextPageToken, files(id, name, size, md5Checksum, createdTime, appProperties)',
      pageSize: '1000',
      orderBy: 'createdTime desc',
      spaces: 'drive',
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await json(await call(`${endpoints().api}/files?${params}`));
    files.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

async function remove(id) {
  const res = await call(`${endpoints().api}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) await json(res);
}

async function getMeta(id) {
  return json(await call(`${endpoints().api}/files/${encodeURIComponent(id)}?fields=id,name,size,md5Checksum,appProperties,trashed`));
}

// Downloads a file to destPath; returns its byte length
async function download(id, destPath) {
  const res = await call(`${endpoints().api}/files/${encodeURIComponent(id)}?alt=media`, { timeoutMs: timing().uploadTimeoutMs });
  if (!res.ok) await json(res);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

module.exports = { ensureFolder, upload, listBackups, remove, getMeta, download };
