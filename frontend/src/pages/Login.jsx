import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Link,
  TextField,
  Typography,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { LockOutlined, PersonOutline } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import RecoveryKeyCard from '../components/RecoveryKeyCard';
import PasswordField from '../components/PasswordField';
import VexoraAuthLayout, { FieldLabel } from '../components/VexoraAuthLayout';
import { PRODUCT_NAME } from '../config/brand';
import { VEXORA } from '../theme/vexora';

// "Remember me" keeps only the username on this PC, to fill it in next time. A login itself always lasts until
// logout (the token handling is unchanged).
const REMEMBER_KEY = 'sop_remember_username';
const rememberedUsername = () => {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) || '';
  } catch {
    return '';
  }
};

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function Login() {
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!rememberedUsername());
  // Forgot password: the admin's recovery key sets a new password, then a new key is shown once
  const [recover, setRecover] = useState({ open: false, username: '', key: '', next: '', confirm: '', saving: false, error: '' });
  const [newKey, setNewKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  // null until shop-info answers, so the product name doesn't flash before the shop's own
  const [shopName, setShopName] = useState(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    // Load shop info from public endpoint
    const loadShopInfo = async () => {
      try {
        const shopInfo = await api.getShopInfo();
        setShopName(shopInfo.name || PRODUCT_NAME);
        if (shopInfo.logo_path && shopInfo.logo_path.trim()) {
          setLogoUrl(`${api.getLogoUrl()}?t=${Date.now()}`);
        }
      } catch {
        // Ignore errors - use defaults
        setShopName(PRODUCT_NAME);
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
      try {
        if (remember) window.localStorage.setItem(REMEMBER_KEY, username.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // storage unavailable: nothing to remember
      }
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <VexoraAuthLayout>
      {/* The shop is the hero: its logo (or initials) and name */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 3.5 }}>
        <Box
          sx={{
            width: 76,
            height: 76,
            mb: 2,
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            bgcolor: logoUrl ? '#FFFFFF' : 'transparent',
            backgroundImage: logoUrl ? 'none' : `linear-gradient(145deg, ${VEXORA.redBright}, ${VEXORA.redDeep})`,
            border: `1px solid ${VEXORA.borderStrong}`,
            boxShadow: '0 12px 30px rgba(0,0,0,.45), 0 0 26px rgba(229,32,43,.18)',
          }}
        >
          {logoUrl ? (
            <Box
              component="img"
              src={logoUrl}
              alt={shopName ? `${shopName} logo` : 'Shop logo'}
              sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 1 }}
              onError={() => setLogoUrl(null)}
            />
          ) : (
            shopName && (
              <Typography aria-hidden="true" sx={{ fontSize: 28, fontWeight: 800, letterSpacing: 1, color: '#FFFFFF' }}>
                {initials(shopName)}
              </Typography>
            )
          )}
        </Box>
        <Typography component="h1" sx={{ fontSize: 23, fontWeight: 700, lineHeight: 1.3, minHeight: '1.3em', color: VEXORA.text }}>
          {shopName}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: VEXORA.muted }}>Sign in to continue</Typography>
      </Box>

      <Box component="form" onSubmit={handleSubmit}>
        <FieldLabel htmlFor="login-username">Username</FieldLabel>
        <TextField
          id="login-username"
          fullWidth
          autoFocus={!username}
          autoComplete="username"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PersonOutline fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2.25 }}
        />

        <FieldLabel htmlFor="login-password">Password</FieldLabel>
        <PasswordField
          id="login-password"
          fullWidth
          autoFocus={!!username}
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.25, mb: 2.5, gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                sx={{ color: VEXORA.dim, '&.Mui-checked': { color: VEXORA.red } }}
              />
            }
            label="Remember me"
            slotProps={{ typography: { sx: { fontSize: 14, color: VEXORA.muted } } }}
            sx={{ ml: -0.75 }}
          />
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => setRecover({ ...recover, open: true, username, error: '' })}
            sx={{ fontSize: 14, fontWeight: 600, color: VEXORA.redLight }}
          >
            Forgot password?
          </Link>
        </Box>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={loading}
          sx={{
            height: 52,
            borderRadius: '12px',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.3,
            // while signing in: the same red, dimmed, rather than the grey disabled look
            '&.Mui-disabled': {
              color: 'rgba(255,255,255,.75)',
              backgroundImage: `linear-gradient(180deg, ${VEXORA.red}, ${VEXORA.redDeep})`,
              opacity: 0.7,
            },
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </Button>
      </Box>

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
                  setRecover({ ...recover, error: "Passwords don't match" });
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
              <Typography variant="body2" sx={{ mb: 1, color: VEXORA.muted }}>
                For the admin account: enter the recovery key that was written down when the app was set up, and choose a
                new password. Other users: ask the admin to set a new password for you in Users.
              </Typography>
              <TextField fullWidth margin="dense" label="Admin username" value={recover.username}
                onChange={(e) => setRecover({ ...recover, username: e.target.value })} />
              <TextField fullWidth margin="dense" label="Recovery key" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value={recover.key}
                onChange={(e) => setRecover({ ...recover, key: e.target.value })} inputProps={{ style: { fontFamily: 'monospace', textTransform: 'uppercase' } }} />
              <PasswordField fullWidth margin="dense" label="New password" helperText="At least 8 characters" value={recover.next}
                autoComplete="new-password" onChange={(e) => setRecover({ ...recover, next: e.target.value })} />
              <PasswordField fullWidth margin="dense" label="Confirm new password" value={recover.confirm}
                autoComplete="new-password" onChange={(e) => setRecover({ ...recover, confirm: e.target.value })}
                confirms={recover.next} />
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
                <Button type="submit" variant="contained" disabled={recover.saving || !recover.username || !recover.key || !recover.next || recover.next !== recover.confirm}>
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
          sx={{ width: '100%', bgcolor: VEXORA.redDeep, color: '#FFFFFF' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </VexoraAuthLayout>
  );
}

export default Login;
