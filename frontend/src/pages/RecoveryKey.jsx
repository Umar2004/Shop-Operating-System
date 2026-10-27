import { useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { KeyOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import RecoveryKeyCard from '../components/RecoveryKeyCard';
import PasswordField from '../components/PasswordField';
import VexoraAuthLayout, { FieldLabel, VexoraCardHeader } from '../components/VexoraAuthLayout';

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
    } catch {
      // the next refresh will pick it up
    }
    navigate(firstSetup ? '/' : '/settings', { replace: true });
  };

  const later = () => {
    // Asked again at the next login until a key exists
    try {
      window.sessionStorage.setItem('sop_recovery_key_later', '1');
    } catch {
      // private mode: just go on
    }
    navigate('/', { replace: true });
  };

  return (
    // Wider than the login card: the key is shown here in large type and must fit on one line
    <VexoraAuthLayout width={560}>
      <VexoraCardHeader
        icon={<KeyOutlined />}
        title={firstSetup ? 'Set up password recovery' : 'Create a new recovery key'}
        subtitle={
          recoveryKey
            ? null
            : 'A recovery key lets the admin choose a new password if the current one is forgotten. There is no email reset in this app, so without the key only a technician at this PC can reset it.'
        }
      />
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
          {!firstSetup && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              The key you wrote down before will stop working.
            </Alert>
          )}
          <FieldLabel htmlFor="rk-password">Your password (to confirm it is you)</FieldLabel>
          <PasswordField
            id="rk-password"
            fullWidth
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={saving || !password}
            sx={{ mt: 3, height: 50, fontSize: 16, fontWeight: 700 }}
          >
            {saving ? 'Creating…' : 'Create recovery key'}
          </Button>
          <Box sx={{ mt: 1, textAlign: 'center' }}>
            {firstSetup ? <Button onClick={later}>Later</Button> : <Button onClick={() => navigate(-1)}>Cancel</Button>}
          </Box>
        </Box>
      )}
    </VexoraAuthLayout>
  );
}

export default RecoveryKey;
