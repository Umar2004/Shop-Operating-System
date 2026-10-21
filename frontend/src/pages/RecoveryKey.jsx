import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import RecoveryKeyCard from '../components/RecoveryKeyCard';

// Admin: create the recovery key (first setup, or a new one from Settings > Security).
// The key is shown once; creating a new one makes the old one useless.
function RecoveryKey() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const firstSetup = !!user?.recoveryKeyMissing;
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    try {
      const res = await api.me();
      setAuth(res.token, res.user);
    } catch (_) {
      // the next refresh will pick it up
    }
    navigate(firstSetup ? '/' : '/settings', { replace: true });
  };

  const later = () => {
    // Asked again at the next login until a key exists
    try {
      window.sessionStorage.setItem('sop_recovery_key_later', '1');
    } catch (_) {
      // private mode: just go on
    }
    navigate('/', { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 520 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {firstSetup ? 'Set up password recovery' : 'Create a new recovery key'}
          </Typography>
          {recoveryKey ? (
            <RecoveryKeyCard recoveryKey={recoveryKey} onDone={finish} doneLabel="Done" />
          ) : (
            <Box
              component="form"
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                setSaving(true);
                try {
                  const res = await api.createRecoveryKey(password);
                  setRecoveryKey(res.recoveryKey);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                A recovery key lets the admin choose a new password if the current one is forgotten. There is no email
                reset in this app, so without the key only a technician at this PC can reset it.
              </Typography>
              {!firstSetup && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  The key you wrote down before will stop working.
                </Alert>
              )}
              <TextField
                fullWidth
                margin="normal"
                type="password"
                label="Your password (to confirm it is you)"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {error}
                </Alert>
              )}
              <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                {firstSetup ? <Button onClick={later}>Later</Button> : <Button onClick={() => navigate(-1)}>Cancel</Button>}
                <Button type="submit" variant="contained" disabled={saving || !password}>
                  {saving ? 'Creating…' : 'Create recovery key'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default RecoveryKey;
