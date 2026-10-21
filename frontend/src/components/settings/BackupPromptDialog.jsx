import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import { MdBackup, MdSkipNext } from 'react-icons/md';
import { api } from '../../api/client';

function BackupPromptDialog({ open, onClose, onBackupCreated, onSkip }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      setError('');
      setProgress(0);
      
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const result = await api.createBackup();
      
      clearInterval(progressInterval);
      setProgress(100);
      
      
      setTimeout(() => {
        if (onBackupCreated) {
          onBackupCreated(result);
        }
        onClose();
        setProgress(0);
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to create backup');
      setProgress(0);
    } finally {
      setCreating(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MdBackup />
          <Typography variant="h6">Create Backup Before Ending Day?</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            It's recommended to create a backup before ending the day. This will help protect your data.
          </Typography>
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {creating && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Creating backup... {progress}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={progress} />
          </Box>
        )}

        <Typography variant="body2" color="text.secondary">
          Would you like to create a backup now?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button 
          onClick={handleSkip} 
          disabled={creating}
          startIcon={<MdSkipNext />}
        >
          Skip
        </Button>
        <Button
          onClick={handleCreateBackup}
          variant="contained"
          startIcon={creating ? <CircularProgress size={16} /> : <MdBackup />}
          disabled={creating}
        >
          {creating ? 'Creating...' : 'Create Backup'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default BackupPromptDialog;
