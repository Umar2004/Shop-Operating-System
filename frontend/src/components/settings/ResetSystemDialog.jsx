import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Box,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { MdWarning, MdDangerous } from 'react-icons/md';
import { api } from '../../api/client';

function ResetSystemDialog({ open, onClose, onSuccess }) {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (confirmation !== 'RESET') {
      setError('Please type "RESET" to confirm');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.resetSystem(confirmation);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
      // Show success message and reload
      setTimeout(() => {
        alert('System reset successfully. Please log in again.');
        window.location.href = '/login';
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to reset system');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setConfirmation('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MdDangerous style={{ color: '#d32f2f', fontSize: '1.5rem' }} />
          <Typography variant="h6">Reset System</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="error" icon={<MdWarning />} sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            WARNING: This action cannot be undone!
          </Typography>
          <Typography variant="body2">
            This will permanently delete all data except the admin user account.
          </Typography>
        </Alert>

        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, fontWeight: 600 }}>
          The following data will be DELETED:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="All Products" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Customers" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Invoices & Transactions" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Sessions" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Expenses" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Categories" />
          </ListItem>
          <ListItem>
            <ListItemText primary="All Stock Movements" />
          </ListItem>
        </List>

        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, fontWeight: 600 }}>
          The following will be PRESERVED:
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText primary="Admin User Account" />
          </ListItem>
          <ListItem>
            <ListItemText primary="User Roles & Permissions" />
          </ListItem>
          <ListItem>
            <ListItemText primary="System Settings" />
          </ListItem>
        </List>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label='Type "RESET" to confirm'
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={loading}
          sx={{ mt: 3 }}
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleReset}
          variant="contained"
          color="error"
          disabled={loading || confirmation !== 'RESET'}
        >
          {loading ? 'Resetting...' : 'Reset System'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ResetSystemDialog;
