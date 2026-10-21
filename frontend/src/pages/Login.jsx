import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import RecoveryKeyCard from '../components/RecoveryKeyCard';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Forgot password: the admin's recovery key sets a new password, then a new key is shown once
  const [recover, setRecover] = useState({ open: false, username: '', key: '', next: '', confirm: '', saving: false, error: '' });
  const [newKey, setNewKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [shopName, setShopName] = useState('Shop Operating Platform');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    // Load shop info from public endpoint
    const loadShopInfo = async () => {
      try {
        const shopInfo = await api.getShopInfo();
        if (shopInfo.name) {
          setShopName(shopInfo.name);
        }
        if (shopInfo.logo_path && shopInfo.logo_path.trim()) {
          setLogoUrl(`${api.getLogoUrl()}?t=${Date.now()}`);
        }
      } catch (err) {
        // Ignore errors - use defaults
      }
    };
    loadShopInfo();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
      setError('');
    try {
      const res = await api.login(username, password);
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
      }}
    >
      <Card sx={{ minWidth: 'clamp(18rem, 40vw, 22.5rem)', width: '90%', maxWidth: '400px', p: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            {logoUrl && (
              <Box
                component="img"
                src={logoUrl}
                alt="Shop Logo"
                sx={{
                  height: 80,
                  maxWidth: 200,
                  width: 'auto',
                  objectFit: 'contain',
                  mb: 2,
                }}
                onError={() => setLogoUrl(null)}
              />
            )}
            <Typography variant="h5" gutterBottom align="center" sx={{ fontWeight: 600 }}>
              {shopName}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom align="center">
              Login to continue
            </Typography>
          </Box>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Username"
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              fullWidth
              label="Password"
              margin="normal"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 2 }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
            <Box sx={{ mt: 1, textAlign: 'center' }}>
              <Button size="small" onClick={() => setRecover({ ...recover, open: true, username, error: '' })}>
                Forgot password?
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={recover.open || !!newKey} onClose={() => !newKey && setRecover({ ...recover, open: false })} fullWidth maxWidth="sm">
        <DialogTitle>{newKey ? 'Your new recovery key' : 'Forgot password'}</DialogTitle>
        <DialogContent>
          {newKey ? (
            <RecoveryKeyCard
              recoveryKey={newKey.recoveryKey}
              doneLabel="Continue to the app"
              onDone={() => {
                setAuth(newKey.token, newKey.user);
                setNewKey(null);
                navigate('/');
              }}
            />
          ) : (
            <Box
              component="form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (recover.next !== recover.confirm) {
                  setRecover({ ...recover, error: 'The two new passwords are not the same' });
                  return;
                }
                setRecover({ ...recover, saving: true, error: '' });
                try {
                  const res = await api.recoverPassword(recover.username, recover.key, recover.next);
                  setRecover({ open: false, username: '', key: '', next: '', confirm: '', saving: false, error: '' });
                  // The key just used no longer works: show the new one before going in
                  setNewKey({ token: res.token, user: res.user, recoveryKey: res.newRecoveryKey });
                } catch (err) {
                  setRecover((r) => ({ ...r, saving: false, error: err.message }));
                }
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                For the admin account: enter the recovery key that was written down when the app was set up, and choose a
                new password. Other users: ask the admin to set a new password for you in Users.
              </Typography>
              <TextField fullWidth margin="dense" label="Admin username" value={recover.username}
                onChange={(e) => setRecover({ ...recover, username: e.target.value })} />
              <TextField fullWidth margin="dense" label="Recovery key" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value={recover.key}
                onChange={(e) => setRecover({ ...recover, key: e.target.value })} inputProps={{ style: { fontFamily: 'monospace', textTransform: 'uppercase' } }} />
              <TextField fullWidth margin="dense" type="password" label="New password" helperText="At least 8 characters" value={recover.next}
                onChange={(e) => setRecover({ ...recover, next: e.target.value })} />
              <TextField fullWidth margin="dense" type="password" label="New password again" value={recover.confirm}
                onChange={(e) => setRecover({ ...recover, confirm: e.target.value })} />
              {recover.error && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {recover.error}
                </Alert>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Lost the key too? A technician can reset the admin password at this PC with the reset tool in the app&apos;s
                backend\tools folder (app closed).
              </Typography>
              <DialogActions sx={{ px: 0 }}>
                <Button onClick={() => setRecover({ ...recover, open: false })}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={recover.saving || !recover.username || !recover.key || !recover.next}>
                  {recover.saving ? 'Checking…' : 'Set new password'}
                </Button>
              </DialogActions>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      <Snackbar
        open={!!error}
        autoHideDuration={3000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setError('')}
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Login;


