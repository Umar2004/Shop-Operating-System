import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
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
  ThemeProvider,
} from '@mui/material';
import { LockOutlined, PersonOutline } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import RecoveryKeyCard from '../components/RecoveryKeyCard';
import PasswordField from '../components/PasswordField';
import { PRODUCT_NAME, VENDOR_NAME } from '../config/brand';
import { VEXORA, vexoraTheme } from '../theme/vexora';
import swirl from '../assets/vexora-swirl.png';

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

const fieldLabelSx = { display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: VEXORA.label };

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
    <ThemeProvider theme={vexoraTheme}>
      <Box
        // Its own scroll area (dark scrollbar) for short windows; the card centres with auto margins, which, unlike
        // align-items, never clips its top when the window is shorter than the card
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          overflowX: 'hidden',
          overflowY: 'auto',
          colorScheme: 'dark',
          px: 2,
          py: 4,
          '@media (max-height: 720px)': { py: 2 },
          bgcolor: VEXORA.loginBg,
          backgroundImage:
            'radial-gradient(760px 560px at 0% 0%, rgba(229,32,43,.16), transparent 70%),' +
            'radial-gradient(760px 560px at 100% 100%, rgba(229,32,43,.12), transparent 70%)',
          color: VEXORA.text,
        }}
      >
        <Box
          component="img"
          src={swirl}
          alt=""
          aria-hidden="true"
          sx={{
            position: 'fixed',
            right: { xs: -120, md: -90 },
            bottom: { xs: -120, md: -110 },
            width: { xs: 360, md: 520 },
            opacity: 0.05,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        <Box
          component="main"
          sx={{
            position: 'relative',
            m: 'auto',
            width: 430,
            maxWidth: '92vw',
            px: { xs: 3, sm: 4.5 },
            pt: { xs: 4.5, sm: 5 },
            pb: 3,
            '@media (max-height: 720px)': { pt: 3.5, pb: 2.5 },
            borderRadius: '22px',
            backgroundImage: VEXORA.card,
            border: `1px solid ${VEXORA.border}`,
            boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 70px rgba(229,32,43,.08)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: -1,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 72,
              height: 3,
              borderRadius: '0 0 3px 3px',
              background: `linear-gradient(90deg, ${VEXORA.redDeep}, ${VEXORA.redBright}, ${VEXORA.redDeep})`,
              boxShadow: '0 0 14px rgba(229,32,43,.7)',
            }}
          />

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
            <Typography component="label" htmlFor="login-username" sx={fieldLabelSx}>
              Username
            </Typography>
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

            <Typography component="label" htmlFor="login-password" sx={fieldLabelSx}>
              Password
            </Typography>
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
              fullWidth
              disabled={loading}
              sx={{
                height: 52,
                borderRadius: '12px',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: '#FFFFFF',
                // #E5202B at the top (not the design's #F23541) keeps white text at 4.5:1
                backgroundImage: `linear-gradient(180deg, ${VEXORA.red}, ${VEXORA.redDeep})`,
                boxShadow: '0 10px 26px rgba(229,32,43,.30), inset 0 1px 0 rgba(255,255,255,.14)',
                transition: 'box-shadow .15s ease, transform .08s ease',
                '&:hover': { boxShadow: '0 14px 34px rgba(229,32,43,.42), inset 0 1px 0 rgba(255,255,255,.18)' },
                '&:active': { transform: 'translateY(1px)', boxShadow: '0 6px 16px rgba(229,32,43,.30)' },
                '&.Mui-focusVisible': { boxShadow: `0 0 0 3px rgba(255,90,98,.45), 0 10px 26px rgba(229,32,43,.30)` },
                '&.Mui-disabled': { color: 'rgba(255,255,255,.75)', opacity: 0.7 },
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </Box>

          <Divider sx={{ mt: 3.5, mb: 2, borderColor: VEXORA.border }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <Box component="img" src={swirl} alt="" aria-hidden="true" sx={{ width: 16, height: 16 }} />
            <Typography sx={{ fontSize: 12, color: VEXORA.dim }}>
              Powered by{' '}
              <Box component="span" sx={{ color: '#B4B4BC', fontWeight: 600 }}>
                {VENDOR_NAME}
              </Box>
            </Typography>
          </Box>
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
                  <Button onClick={() => setRecover({ ...recover, open: false })} sx={{ color: VEXORA.muted }}>Cancel</Button>
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
      </Box>
    </ThemeProvider>
  );
}

export default Login;
