import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Switch,
  FormControlLabel,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { 
  MdBackup, 
  MdRefresh, 
  MdDelete, 
  MdSave, 
  MdFolder, 
  MdFolderOpen,
  MdSchedule,
  MdInfoOutline,
  MdWarning,
} from 'react-icons/md';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import BackupList from './BackupList';
import CloudBackup from './CloudBackup';
import BackupUpload from './BackupUpload';
import ResetSystemDialog from './ResetSystemDialog';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function DatabaseBackup() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreFilename, setRestoreFilename] = useState('');
  const [restoring, setRestoring] = useState(false);
  
  // Schedule state
  const [schedule, setSchedule] = useState({
    daily: 'disabled',
    daily_skip_option: 'false',
    weekly: 'disabled',
    weekly_day: '0',
    weekly_time: '02:00',
    monthly: 'disabled',
    monthly_day: '1',
    monthly_time: '02:00',
  });
  
  // Backup path state
  const [backupPath, setBackupPath] = useState('');
  const [savingPath, setSavingPath] = useState(false);
  const [pathValidating, setPathValidating] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load backup schedule
      const scheduleData = await api.getBackupSchedule();
      setSchedule(scheduleData);
      
      // Load backup path - preserve exactly as saved
      const settings = await api.getSettings();
      const savedPath = settings['backup.path'] || '';
      setBackupPath(savedPath);
      
      if (savedPath) {
      }
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleChange = async (field, value) => {
    const newSchedule = { ...schedule, [field]: value };
    setSchedule(newSchedule);
    
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await api.updateBackupSchedule(newSchedule);
      setSuccess('Backup schedule updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update schedule');
      // Revert on error
      setSchedule(schedule);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setError('');
      setSuccess('');
      const result = await api.createBackup();
      const pathInfo = result.path || result.directory ? `\nSaved to: ${result.path || result.directory}` : '';
      setSuccess(`Backup created successfully: ${result.filename}${pathInfo}`);
      setTimeout(() => {
        setSuccess('');
        window.location.reload();
      }, 5000);
    } catch (err) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleBackupPathChange = (e) => {
    setBackupPath(e.target.value);
  };

  const handleBrowseFolder = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      let extractedPath = '';
      
      // Try to extract path from file object
      if (firstFile.path) {
        const filePath = firstFile.path;
        const lastBackslash = filePath.lastIndexOf('\\');
        const lastSlash = filePath.lastIndexOf('/');
        const lastSeparator = Math.max(lastBackslash, lastSlash);
        if (lastSeparator > 0) {
          extractedPath = filePath.substring(0, lastSeparator);
        } else {
          extractedPath = filePath;
        }
      } else if (firstFile.webkitRelativePath) {
        // Browser security - can't get full path, show helper message
        setError('Due to browser security, please enter the full path manually. Example: C:\\Backups\\SOP');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      if (extractedPath) {
        // Only update if user explicitly selected a folder via browse
        // Don't overwrite manually entered paths
        setBackupPath(extractedPath);
        await handleBackupPathSave(extractedPath);
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBackupPathSave = async (pathToSave = null) => {
    // Get the path - preserve exactly what user entered (trim only whitespace)
    const pathToUse = pathToSave || backupPath;
    const trimmedPath = pathToUse.trim();
    
    if (!trimmedPath) {
      setError('Please enter a backup path');
      return;
    }
    
    try {
      setSavingPath(true);
      setPathValidating(true);
      setError('');
      setSuccess('');
      
      // Validate path - use the exact trimmed path
      const validation = await api.testBackupPath(trimmedPath);
      if (!validation.success) {
        setError(validation.message || 'Path validation failed');
        setPathValidating(false);
        return;
      }
      
      // Use the path from validation if provided, otherwise use the trimmed path
      // The backend should return the exact path it will use
      const pathToSaveFinal = validation.path || trimmedPath;
      
      
      // Save path - preserve exactly as user entered
      const result = await api.updateSetting('backup.path', pathToSaveFinal);
      
      // Verify what was actually saved
      
      // Update local state with the saved path
      setBackupPath(pathToSaveFinal);
      setSuccess(`Backup path saved successfully: ${pathToSaveFinal}`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to save backup path');
      // Don't update state on error - keep what user typed
    } finally {
      setSavingPath(false);
      setPathValidating(false);
    }
  };

  const calculateNextBackup = () => {
    const now = new Date();
    const nextBackups = [];
    
    if (schedule.daily === 'enabled') {
      nextBackups.push({
        type: 'Daily',
        time: 'When ending the day',
        description: 'Automatic backup when closing the session',
      });
    }
    
    if (schedule.weekly === 'enabled') {
      const day = parseInt(schedule.weekly_day, 10);
      const [hours, minutes] = schedule.weekly_time.split(':').map(Number);
      const dayName = DAYS_OF_WEEK.find(d => d.value === day)?.label || 'Sunday';
      nextBackups.push({
        type: 'Weekly',
        time: `${dayName} at ${schedule.weekly_time}`,
        description: `Every ${dayName} at ${schedule.weekly_time}`,
      });
    }
    
    if (schedule.monthly === 'enabled') {
      const day = parseInt(schedule.monthly_day, 10);
      const [hours, minutes] = schedule.monthly_time.split(':').map(Number);
      nextBackups.push({
        type: 'Monthly',
        time: `Day ${day} at ${schedule.monthly_time}`,
        description: `Every month on day ${day} at ${schedule.monthly_time}`,
      });
    }
    
    return nextBackups;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const nextBackups = calculateNextBackup();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Error/Success Messages */}
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Automatic Backup Settings */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <MdSchedule />
          <Typography variant="h6">Automatic Backup Schedule</Typography>
        </Box>

        {/* Daily Backup */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Daily Backup
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Automatically create backup when ending the day
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={schedule.daily === 'enabled'}
                  onChange={(e) => handleScheduleChange('daily', e.target.checked ? 'enabled' : 'disabled')}
                  disabled={saving}
                />
              }
              label=""
            />
          </Box>
          {schedule.daily === 'enabled' && (
            <FormControlLabel
              control={
                <Switch
                  checked={schedule.daily_skip_option === 'true'}
                  onChange={(e) => handleScheduleChange('daily_skip_option', e.target.checked ? 'true' : 'false')}
                  disabled={saving}
                />
              }
              label="Show skip option when ending day"
            />
          )}
        </Box>

        {/* Weekly Backup */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Weekly Backup
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Automatically create backup on a specific day and time
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={schedule.weekly === 'enabled'}
                  onChange={(e) => handleScheduleChange('weekly', e.target.checked ? 'enabled' : 'disabled')}
                  disabled={saving}
                />
              }
              label=""
            />
          </Box>
          {schedule.weekly === 'enabled' && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Day of Week</InputLabel>
                  <Select
                    value={schedule.weekly_day}
                    label="Day of Week"
                    onChange={(e) => handleScheduleChange('weekly_day', e.target.value)}
                    disabled={saving}
                  >
                    {DAYS_OF_WEEK.map((day) => (
                      <MenuItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="time"
                  label="Time"
                  value={schedule.weekly_time}
                  onChange={(e) => handleScheduleChange('weekly_time', e.target.value)}
                  disabled={saving}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          )}
        </Box>

        {/* Monthly Backup */}
        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Monthly Backup
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Automatically create backup on a specific day of the month
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={schedule.monthly === 'enabled'}
                  onChange={(e) => handleScheduleChange('monthly', e.target.checked ? 'enabled' : 'disabled')}
                  disabled={saving}
                />
              }
              label=""
            />
          </Box>
          {schedule.monthly === 'enabled' && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Day of Month"
                  value={schedule.monthly_day}
                  onChange={(e) => {
                    const day = Math.max(1, Math.min(31, parseInt(e.target.value) || 1));
                    handleScheduleChange('monthly_day', String(day));
                  }}
                  disabled={saving}
                  inputProps={{ min: 1, max: 31 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  type="time"
                  label="Time"
                  value={schedule.monthly_time}
                  onChange={(e) => handleScheduleChange('monthly_time', e.target.value)}
                  disabled={saving}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          )}
        </Box>

        {/* Schedule Summary */}
        {nextBackups.length > 0 && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <MdInfoOutline />
              Next Scheduled Backups
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {nextBackups.map((backup, idx) => (
                <Chip
                  key={idx}
                  label={`${backup.type}: ${backup.time}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Backup Path */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <MdFolder />
          <Typography variant="h6">Backup Storage Path</Typography>
        </Box>
        {backupPath && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Current Backup Location:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
              {backupPath}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              All backups will be saved to this location. Make sure this path is accessible and has enough storage space.
            </Typography>
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            size="small"
            label="Backup Directory Path"
            value={backupPath}
            onChange={handleBackupPathChange}
            onPaste={(e) => {
              const pastedText = e.clipboardData.getData('text');
              if (pastedText && (pastedText.includes('\\') || pastedText.includes('/'))) {
                // Remove quotes if present, but preserve the exact path otherwise
                const cleanPath = pastedText.trim().replace(/^["']|["']$/g, '');
                setBackupPath(cleanPath);
                // Don't auto-save - let user click Save button
              }
            }}
            placeholder="Leave empty to use default: data/backups"
            disabled={savingPath || pathValidating}
            helperText="Click folder icon to browse, or paste the path here. Leave empty to use the default location."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MdFolder style={{ color: '#666' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Browse for folder">
                    <IconButton
                      edge="end"
                      onClick={handleBrowseFolder}
                      disabled={savingPath || pathValidating}
                      size="small"
                    >
                      <MdFolderOpen />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            startIcon={savingPath ? <CircularProgress size={16} /> : <MdSave />}
            onClick={() => handleBackupPathSave()}
            disabled={savingPath || pathValidating || !backupPath.trim()}
            sx={{ minWidth: 120, mt: 0.5 }}
          >
            {savingPath ? 'Saving...' : 'Save Path'}
          </Button>
        </Box>
        <input
          ref={fileInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Example: C:\Backups\SOP or /home/user/backups/sop
        </Typography>
      </Paper>

      {/* Manual Backup */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <MdBackup />
          <Typography variant="h6">Manual Backup</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={creatingBackup ? <CircularProgress size={16} /> : <MdBackup />}
          onClick={handleCreateBackup}
          disabled={creatingBackup}
          sx={{ mb: 1 }}
        >
          {creatingBackup ? 'Creating Backup...' : 'Create Backup Now'}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Create a backup of the current database immediately.
        </Typography>
      </Paper>

      {/* Google Drive backup (admin) */}
      {isAdmin && (
        <CloudBackup onRestore={(filename) => {
          setRestoreFilename(filename);
          setRestoreDialogOpen(true);
        }} />
      )}

      {/* Upload Backup */}
      <BackupUpload onUploadSuccess={(result) => {
        // File uploaded successfully - restore dialog will be shown by BackupUpload component
        // Don't reload here - let the user decide whether to restore
        console.log('Backup uploaded:', result);
      }} />

      {/* Backup List */}
      <BackupList onRestore={(filename) => {
        setRestoreFilename(filename);
        setRestoreDialogOpen(true);
      }} />

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={restoreDialogOpen}
        onClose={() => {
          if (!restoring) {
            setRestoreDialogOpen(false);
            setRestoreFilename('');
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MdWarning color="#ed6c02" size={24} />
          Restore from Backup?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to restore from <strong>{restoreFilename}</strong>?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            <strong>Warning:</strong> This will replace your current database with the backup data. 
            This action cannot be undone. A backup of your current database will be created automatically before restoring.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setRestoreDialogOpen(false);
              setRestoreFilename('');
            }} 
            disabled={restoring}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                setRestoring(true);
                setError('');
                await api.restoreBackup(restoreFilename);
                setSuccess('Backup restored successfully. Please log in again with a user from the restored data.');
                setRestoreDialogOpen(false);
                setRestoreFilename('');
                // Every login has ended on the server; back to the login screen
                setTimeout(() => useAuthStore.getState().logout(), 2000);
              } catch (err) {
                setError(err.message || 'Failed to restore backup');
                setRestoreDialogOpen(false);
                setRestoreFilename('');
              } finally {
                setRestoring(false);
              }
            }}
            variant="contained"
            color="warning"
            disabled={restoring}
            startIcon={restoring ? <CircularProgress size={16} /> : null}
          >
            {restoring ? 'Restoring...' : 'Yes, Restore Now'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset System */}
      <Paper sx={{ p: 3, border: '2px solid #d32f2f' }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, color: 'error.main', mb: 2 }}>
          <MdDelete style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Reset System
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This will permanently delete all data except the admin user account. This action cannot be undone.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={() => setResetDialogOpen(true)}
          startIcon={<MdDelete />}
        >
          Reset System
        </Button>
      </Paper>

      {/* Reset System Dialog */}
      <ResetSystemDialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        onSuccess={() => setResetDialogOpen(false)}
      />
    </Box>
  );
}

export default DatabaseBackup;
