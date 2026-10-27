import { useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { LockResetOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import PasswordField from '../components/PasswordField';
import VexoraAuthLayout, { FieldLabel, VexoraCardHeader } from '../components/VexoraAuthLayout';

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
      // Dark when it shows over the (dark) recovery key screen, light over the main app
      toast.success('Password changed', { theme: res.user.recoveryKeyMissing ? 'dark' : 'light' });
      navigate(res.user.recoveryKeyMissing ? '/recovery-key' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <VexoraAuthLayout>
      <VexoraCardHeader
        icon={<LockResetOutlined />}
        title={forced ? 'Choose a new password' : 'Change my password'}
        subtitle={
          forced
            ? `${user?.username}, your current password is a temporary or factory password. Choose your own to continue.`
            : `Signed in as ${user?.username}`
        }
      />
      <Box component="form" onSubmit={submit}>
        <FieldLabel htmlFor="cp-current">Current password</FieldLabel>
        <PasswordField
          id="cp-current"
          fullWidth
          autoFocus
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
          sx={{ mb: 1.75 }}
        />
        <FieldLabel htmlFor="cp-new">New password</FieldLabel>
        <PasswordField
          id="cp-new"
          fullWidth
          autoComplete="new-password"
          helperText="At least 8 characters; not your username"
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
          sx={{ mb: 1.75 }}
        />
        <FieldLabel htmlFor="cp-confirm">Confirm new password</FieldLabel>
        <PasswordField
          id="cp-confirm"
          fullWidth
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          confirms={form.next}
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
          disabled={saving || !form.current || !form.next || form.next !== form.confirm}
          sx={{ mt: 2.5, height: 50, fontSize: 16, fontWeight: 700 }}
        >
          {saving ? 'Saving…' : 'Change password'}
        </Button>
        <Box sx={{ mt: 1, textAlign: 'center' }}>
          {forced ? (
            <Button
              onClick={async () => {
                try {
                  await api.logout();
                } catch {
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
        </Box>
      </Box>
    </VexoraAuthLayout>
  );
}

export default ChangePassword;
