import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

// Admin: the password recovery key (and where to go when it is lost too)
function SecuritySettings() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getRecoveryKeyInfo()
      .then(setInfo)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Password recovery key
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {info && (
        <>
          {info.exists ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              A recovery key was created on {new Date(`${info.created_at.replace(' ', 'T')}Z`).toLocaleString()}. Keep the
              paper it is written on safe and away from the counter.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              There is no recovery key. If the admin password is forgotten, only a technician at this PC can reset it.
            </Alert>
          )}
          <Typography variant="body2" sx={{ mb: 2 }}>
            With the key, the admin can choose a new password from the login screen (Forgot password?). Creating a new
            key makes the old one stop working: do it if the paper is lost or someone else may have seen it.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/recovery-key')}>
            {info.exists ? 'Create a new recovery key' : 'Create a recovery key'}
          </Button>
        </>
      )}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2">Other users</Typography>
        <Typography variant="body2" color="text.secondary">
          A cashier or manager who forgets their password: set a temporary password for them in Users. They will be
          asked to choose their own when they log in.
        </Typography>
      </Box>
    </Paper>
  );
}

export default SecuritySettings;
