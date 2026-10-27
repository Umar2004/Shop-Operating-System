const crypto = require('crypto');
const http = require('http');
const { loadClient, endpoints, DRIVE_SCOPE } = require('./config');
const store = require('./store');
const { PRODUCT_NAME } = require('../brand');
const { CloudError, request, json } = require('./http');

// Google sign-in for a desktop app: PKCE + a one-time listener on 127.0.0.1 (Google's "loopback" redirect).
// The browser is opened by the app window (Electron), the code comes back here, and only the refresh token is kept.
const FLOW_TIMEOUT_MS = 10 * 60_000;
let flow = null; // { state, verifier, redirectUri, server, timer, status: 'waiting'|'done'|'error', error }

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function closeFlow() {
  if (!flow) return;
  clearTimeout(flow.timer);
  try { flow.server.close(); } catch (_) {}
}

const page = (title, text) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:Segoe UI,Arial,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
  `<h2>${title}</h2><p>${text}</p></body>`;

// Starts a sign-in; returns the Google URL to open. onConnected(email) runs once the token is saved.
async function startConnect(onConnected) {
  const client = loadClient();
  if (!client) throw new CloudError('config', 'No Google sign-in client is configured on this PC');
  cancelConnect();

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}/`;
  const current = { state, verifier, redirectUri, server, status: 'waiting', error: null };
  current.timer = setTimeout(() => {
    if (current.status === 'waiting') Object.assign(current, { status: 'error', error: 'Sign-in timed out. Try again.' });
    try { server.close(); } catch (_) {}
  }, FLOW_TIMEOUT_MS);
  current.timer.unref();
  flow = current;

  server.on('request', async (req, res) => {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/' || current.status !== 'waiting') {
      res.writeHead(404).end();
      return;
    }
    const finish = (title, text) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, text));
      setTimeout(() => { try { server.close(); } catch (_) {} }, 1000).unref();
    };
    if (url.searchParams.get('state') !== state) {
      res.writeHead(400).end();
      return;
    }
    if (url.searchParams.get('error')) {
      Object.assign(current, { status: 'error', error: url.searchParams.get('error') === 'access_denied' ? 'Access was not allowed.' : `Google said: ${url.searchParams.get('error')}` });
      finish('Not connected', `Google Drive was not connected. You can close this tab and return to ${PRODUCT_NAME}.`);
      return;
    }
    try {
      const email = await exchangeCode(client, url.searchParams.get('code'), verifier, redirectUri);
      current.status = 'done';
      clearTimeout(current.timer);
      finish('Google Drive connected', `Connected as ${email || 'your Google account'}. You can close this tab and return to ${PRODUCT_NAME}.`);
      if (onConnected) onConnected(email);
    } catch (err) {
      Object.assign(current, { status: 'error', error: err.message });
      finish('Not connected', `Google Drive could not be connected (${err.message}). You can close this tab and try again from the app.`);
    }
  });

  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `openid email ${DRIVE_SCOPE}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline', // a refresh token, so uploads keep working
    prompt: 'consent', // a refresh token every time, also on a reconnect
  });
  return `${endpoints().auth}?${params}`;
}

async function exchangeCode(client, code, verifier, redirectUri) {
  const res = await request(endpoints().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = await json(res);
  // Google's consent screen lets the owner untick Drive: without it there is nothing to do
  if (!String(body.scope || '').split(' ').includes(DRIVE_SCOPE)) throw new Error('Drive access was not ticked on the Google screen');
  if (!body.refresh_token) throw new Error('Google did not return a refresh token');
  let email = null;
  try {
    email = JSON.parse(Buffer.from(String(body.id_token).split('.')[1], 'base64url').toString()).email || null;
  } catch (_) {
    // no id_token: the account name just isn't shown
  }
  await store.saveRefreshToken(body.refresh_token);
  setAccessToken(body.access_token, body.expires_in);
  store.writeState({ email, connectedAt: new Date().toISOString(), folderId: null, authProblem: null });
  return email;
}

function cancelConnect() {
  if (flow && flow.status === 'waiting') flow.status = 'cancelled';
  closeFlow();
  flow = null;
}

const connectStatus = () => (flow ? { status: flow.status, error: flow.error } : null);

// Access token: kept in memory only, refreshed shortly before it expires
let access = null;
function setAccessToken(token, expiresIn) {
  access = token ? { token, expiresAt: Date.now() + (Number(expiresIn || 3600) - 120) * 1000 } : null;
}
const dropAccessToken = () => { access = null; };

async function getAccessToken() {
  if (access && access.expiresAt > Date.now()) return access.token;
  const client = loadClient();
  if (!client) throw new CloudError('config', 'No Google sign-in client is configured on this PC');
  const refreshToken = await store.loadRefreshToken();
  if (!refreshToken) throw new CloudError('auth', 'Google Drive is not connected');
  const res = await request(endpoints().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  try {
    const body = await json(res);
    setAccessToken(body.access_token, body.expires_in);
    return access.token;
  } catch (err) {
    if (err.reason === 'invalid_client' || err.reason === 'unauthorized_client') {
      throw new CloudError('config', 'Google rejected the sign-in client configured on this PC');
    }
    // invalid_grant: revoked by the owner, unused for months, or the password/security settings changed
    if (err.reason === 'invalid_grant' || err.status === 400 || err.status === 401) {
      throw new CloudError('auth', 'Google Drive access has ended: reconnect it in Settings → Backup');
    }
    throw err;
  }
}

// Best effort: tell Google to forget the token (the local copy is deleted either way)
async function revoke() {
  const refreshToken = await store.loadRefreshToken().catch(() => null);
  dropAccessToken();
  if (!refreshToken) return false;
  try {
    const res = await request(endpoints().revoke, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
      timeoutMs: 10_000,
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = { startConnect, cancelConnect, connectStatus, getAccessToken, dropAccessToken, revoke };
