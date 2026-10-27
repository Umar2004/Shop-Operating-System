// Google Drive backup: one wording for Settings and the Dashboard

export const formatCloudTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

// { ok: true | false | null, text } for a connected status; null when there is nothing to show
export function describeCloud(status) {
  if (!status || !status.connected) return null;
  const last = status.lastSuccess ? `last cloud backup ${formatCloudTime(status.lastSuccess.at)}` : 'no cloud backup yet';
  const waiting = status.queued ? ` · ${status.queued} waiting` : '';
  switch (status.state) {
    case 'reconnect':
      return { ok: false, text: `Google Drive needs to be reconnected (Settings → Backup) · ${last}` };
    case 'offline':
      return { ok: false, text: `No internet: copies wait and go up when it is back · ${last}${waiting}` };
    case 'error':
      return { ok: false, text: `Last upload failed${status.lastError ? `: ${status.lastError.message}` : ''} · ${last}${waiting}` };
    case 'waiting':
    case 'connected':
      return { ok: null, text: `${last}${waiting}` };
    default:
      return { ok: true, text: `${last}${waiting}` };
  }
}
