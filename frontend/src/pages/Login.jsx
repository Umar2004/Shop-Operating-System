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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
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
              Login to continue (default: admin / admin)
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
          </Box>
        </CardContent>
      </Card>
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


