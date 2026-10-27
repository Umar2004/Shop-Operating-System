import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { MdCloudUpload, MdCloudDone, MdCloudOff, MdRestore } from 'react-icons/md';
import { api } from '../../api/client';
import { describeCloud, formatCloudTime } from '../../utils/cloudStatus';
import { PRODUCT_NAME } from '../../config/brand';

const KIND_LABEL = { 'day-end': 'Day end', weekly: 'Weekly', monthly: 'Monthly' };

// Settings → Backup: Google Drive backup (the owner's own Drive). Local backups never depend on it.
// onRestore(filename): hands a downloaded cloud copy to the existing restore confirmation.
function CloudBackup({ onRestore }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [cloudFiles, setCloudFiles] = useState(null);
  const [preparing, setPreparing] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const s = await api.getCloudStatus();
      setStatus(s);
      return s;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
  }, [load]);

  const stopPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const connect = async () => {
    setError('');
    setBusy('connect');
    try {
      const { authUrl: url } = await api.cloudConnect();
      setAuthUrl(url);
      // In the app: the system browser (Google refuses sign-in inside the app window). In a dev browser: a new tab.
      if (window.electronAPI?.openGoogleSignIn) {
        if (!(await window.electronAPI.openGoogleSignIn(url))) setError('The browser did not open. Use the link below to sign in.');
      } else {
        window.open(url, '_blank', 'noopener');
      }
      // Wait for the sign-in to finish in the browser
      stopPolling();
      pollRef.current = setInterval(async () => {
        const s = await load();
        const c = s && s.connect;
        if (s && (!c || c.status !== 'waiting')) {
          stopPolling();
          setBusy('');
          setAuthUrl('');
          if (!s.connected && c && c.error) setError(c.error);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const cancelConnect = async () => {
    stopPolling();
    setBusy('');
    setAuthUrl('');
    await api.cloudCancelConnect().catch(() => {});
    load();
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setError('');
    try {
      await api.cloudDisconnect();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
      setConfirmDisconnect(false);
      load();
    }
  };

  const uploadNow = async () => {
    setError('');
    try {
      setStatus(await api.cloudUploadNow());
      setTimeout(load, 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const openList = async () => {
    setListOpen(true);
    setCloudFiles(null);
    try {
      setCloudFiles(await api.listCloudBackups());
    } catch (err) {
      setListOpen(false);
      setError(err.message);
    }
  };

  const restore = async (file) => {
    setPreparing(file.id);
    setError('');
    try {
      const { filename } = await api.prepareCloudRestore(file.id);
      setListOpen(false);
      onRestore(filename);
    } catch (err) {
      setError(err.message);
      setListOpen(false);
    } finally {
      setPreparing('');
    }
  };

  if (!status) return null;
  const summary = describeCloud(status);
  const connecting = busy === 'connect';

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <MdCloudUpload />
        <Typography variant="h6">Google Drive Backup</Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {!status.configured || !status.supported ? (
        <>
          <Button variant="outlined" disabled startIcon={<MdCloudOff />}>
            Connect Google Drive
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {!status.supported
              ? 'Google Drive backup needs Windows.'
              : 'Not set up on this PC: no Google sign-in client is configured. Local backups work as usual.'}
          </Typography>
        </>
      ) : !status.connected ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Also keep a copy of the day-end, weekly and monthly backups in your own Google Drive. Copies are made
            even without internet and go up when it is back. Local backups always run first and never wait for it.
          </Typography>
          {connecting ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2">Finish signing in to Google in your browser…</Typography>
              </Box>
              {authUrl && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Browser didn&apos;t open?{' '}
                  <Link href={authUrl} target="_blank" rel="noopener">
                    Open the Google sign-in page
                  </Link>
                </Typography>
              )}
              <Button size="small" onClick={cancelConnect}>
                Cancel
              </Button>
            </Box>
          ) : (
            <Button variant="contained" startIcon={<MdCloudUpload />} onClick={connect}>
              Connect Google Drive
            </Button>
          )}
        </>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {summary && summary.ok === false ? <MdCloudOff color="#d32f2f" /> : <MdCloudDone color="#2e7d32" />}
            <Typography variant="body2">
              Connected as <strong>{status.email || 'your Google account'}</strong>
            </Typography>
          </Box>
          {summary && (
            <Alert severity={summary.ok === false ? (status.state === 'offline' ? 'warning' : 'error') : 'success'} sx={{ mb: 2 }}>
              {status.lastSuccess ? '✓ ' : ''}
              {summary.text}
              {status.nextAttemptAt && status.queued > 0 && ` · next try ${formatCloudTime(status.nextAttemptAt)}`}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {status.state === 'reconnect' && (
              <Button variant="contained" onClick={connect} disabled={connecting}>
                Reconnect
              </Button>
            )}
            <Button variant="outlined" onClick={uploadNow} disabled={status.queued === 0 || status.uploading}>
              {status.uploading ? 'Uploading…' : 'Upload now'}
            </Button>
            <Button variant="outlined" startIcon={<MdRestore />} onClick={openList}>
              Restore from Google Drive
            </Button>
            <Button color="error" onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </Button>
          </Box>
          {connecting && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Finish signing in to Google in your browser…{' '}
              <Link component="button" onClick={cancelConnect}>
                Cancel
              </Link>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Kept in the &quot;{PRODUCT_NAME} Backups&quot; folder of your Drive: one copy for each of the last
            14 days, 8 weeks and 12 months.
          </Typography>
        </>
      )}

      <Dialog open={confirmDisconnect} onClose={() => busy !== 'disconnect' && setConfirmDisconnect(false)}>
        <DialogTitle>Disconnect Google Drive?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            New backups will no longer be copied to Google Drive, and copies still waiting to upload are dropped. Copies
            already in your Drive stay there. Local backups are not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisconnect(false)} disabled={busy === 'disconnect'}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={disconnect} disabled={busy === 'disconnect'}>
            {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={listOpen} onClose={() => !preparing && setListOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Restore from Google Drive</DialogTitle>
        <DialogContent>
          {!cloudFiles ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : cloudFiles.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No backups in Google Drive yet.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                The chosen copy is downloaded and checked, then you confirm the restore as usual.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Made</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell align="right">Size</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cloudFiles.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{formatCloudTime(f.created_at)}</TableCell>
                      <TableCell>{KIND_LABEL[f.kind] || f.kind || '—'}</TableCell>
                      <TableCell align="right">{(f.size_bytes / 1024).toFixed(0)} KB</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => restore(f)} disabled={!!preparing}
                          startIcon={preparing === f.id ? <CircularProgress size={14} /> : <MdRestore />}>
                          {preparing === f.id ? 'Downloading…' : 'Restore'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setListOpen(false)} disabled={!!preparing}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default CloudBackup;
