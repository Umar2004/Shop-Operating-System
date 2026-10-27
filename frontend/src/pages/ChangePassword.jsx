import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import PasswordField from '../components/PasswordField';

// Change my password. Also the screen a user is held on when they must choose a new password
// (factory password, or a temporary one set by the admin).
function ChangePassword() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < 8) {
      setError('The new password must be at least 8 characters');
      return;
    }
    if (form.next !== form.confirm) {
      setError("Passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await api.changePassword(form.current, form.next);
      setAuth(res.token, res.user);
      toast.success('Password changed');
      navigate(res.user.recoveryKeyMissing ? '/recovery-key' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {forced ? 'Choose a new password' : 'Change my password'}
          </Typography>
          {forced && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {user?.username}, your current password is a temporary or factory password. Choose your own to continue.
            </Alert>
          )}
          <Box component="form" onSubmit={submit}>
            <PasswordField
              fullWidth
              margin="normal"
              label="Current password"
              autoComplete="current-password"
              value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
            />
            <PasswordField
              fullWidth
              margin="normal"
              label="New password"
              autoComplete="new-password"
              helperText="At least 8 characters; not your username"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
            />
            <PasswordField
              fullWidth
              margin="normal"
              label="Confirm new password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              confirms={form.next}
            />
            {error && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {error}
              </Alert>
            )}
            <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              {forced ? (
                <Button
                  onClick={async () => {
                    try {
                      await api.logout();
                    } catch (_) {
                      // already ended
                    }
                    logout();
                  }}
                >
                  Log out
                </Button>
              ) : (
                <Button onClick={() => navigate(-1)}>Cancel</Button>
              )}
              <Button type="submit" variant="contained" disabled={saving || !form.current || !form.next || form.next !== form.confirm}>
                {saving ? 'Saving…' : 'Change password'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default ChangePassword;
