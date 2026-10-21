import { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import { MdCloudUpload, MdFileUpload, MdWarning } from 'react-icons/md';
import { api } from '../../api/client';

function BackupUpload({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.db')) {
      setError('Please select a valid .db backup file');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setSuccess('');
      setShowRestoreDialog(false);
      setUploadedFilename('');
      
      const result = await api.uploadBackup(file);
      
      // Only proceed if upload was successful
      if (result && result.filename) {
        setSuccess(`Backup uploaded successfully: ${result.filename}`);
        setUploadedFilename(result.filename);
        // Show restore confirmation dialog
        setShowRestoreDialog(true);
        
        // Call success callback (but don't reload - let user decide)
        if (onUploadSuccess) {
          onUploadSuccess(result);
        }
      } else {
        throw new Error('Upload completed but no filename returned');
      }
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Backup upload error:', err);
      setError(err.message || 'Failed to upload backup. Please check the file and try again.');
      setShowRestoreDialog(false);
      setUploadedFilename('');
      
      // Reset file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRestore = async () => {
    if (!uploadedFilename) return;
    
    try {
      setRestoring(true);
      setError('');
      await api.restoreBackup(uploadedFilename);
      setSuccess('Backup restored successfully! The page will reload in 2 seconds...');
      setShowRestoreDialog(false);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to restore backup');
      setShowRestoreDialog(false);
    } finally {
      setRestoring(false);
    }
  };

  const handleCloseRestoreDialog = () => {
    setShowRestoreDialog(false);
    setUploadedFilename('');
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
        Upload Backup
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".db"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="backup-upload-input"
        />
        <label htmlFor="backup-upload-input">
          <Button
            variant="outlined"
            component="span"
            startIcon={<MdFileUpload />}
            disabled={uploading}
            fullWidth
            sx={{ py: 1.5 }}
          >
            {uploading ? 'Uploading...' : 'Select Backup File (.db)'}
          </Button>
        </label>

        {uploading && <LinearProgress />}

        <Typography variant="caption" color="text.secondary">
          Select a .db backup file to upload. The file will be validated before being made available for restore.
        </Typography>
      </Box>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={showRestoreDialog}
        onClose={handleCloseRestoreDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MdWarning color="#ed6c02" size={24} />
          Restore from Backup?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            The backup file <strong>{uploadedFilename}</strong> has been uploaded successfully.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            <strong>Warning:</strong> Restoring this backup will replace your current database with the backup data. 
            This action cannot be undone. A backup of your current database will be created automatically before restoring.
          </DialogContentText>
          <DialogContentText sx={{ mt: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
            Do you want to restore from this backup now?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRestoreDialog} disabled={restoring}>
            Cancel
          </Button>
          <Button
            onClick={handleRestore}
            variant="contained"
            color="warning"
            disabled={restoring}
            startIcon={restoring ? <CircularProgress size={16} /> : null}
          >
            {restoring ? 'Restoring...' : 'Yes, Restore Now'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default BackupUpload;
