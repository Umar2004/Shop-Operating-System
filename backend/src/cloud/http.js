const { timing } = require('./config');

// fetch with a timeout, and errors sorted into what the uploader needs to know:
//   offline  - no connection (DNS, refused, reset, timeout): just wait for the internet
//   auth     - the refresh token no longer works (revoked, expired): the owner must reconnect
//   http     - Google answered with an error (status kept)
class CloudError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const OFFLINE_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN',
  'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

async function request(url, { timeoutMs, ...opts } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || timing().requestTimeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const code = (err.cause && err.cause.code) || err.code;
    if (err.name === 'AbortError' || OFFLINE_CODES.has(code) || /fetch failed/i.test(err.message)) {
      throw new CloudError('offline', `No connection to Google (${code || err.name})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// The response as JSON, or a CloudError carrying Google's own reason (never the request's tokens)
async function json(res) {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    const e = body && body.error;
    const reason = typeof e === 'string' ? e : e && ((e.errors && e.errors[0] && e.errors[0].reason) || e.status);
    const message = typeof e === 'object' && e && e.message ? e.message : (body && body.error_description) || `HTTP ${res.status}`;
    throw new CloudError('http', message, { status: res.status, reason });
  }
  return body;
}

module.exports = { CloudError, request, json };
