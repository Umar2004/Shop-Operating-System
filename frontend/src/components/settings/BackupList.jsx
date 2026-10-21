import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
} from '@mui/material';
import { MdDownload, MdDelete, MdRefresh } from 'react-icons/md';
import { toast } from 'react-toastify';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/numberFormat';
import { useConfirmDialog } from '../../utils/confirmDialog';

function BackupList({ onRestore }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      const data = await api.listBackups();
      // Filter out missing backup files
      const availableBackups = (data || []).filter(backup => backup.file_exists);
      setBackups(availableBackups);
    } catch (err) {
      setError(err.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${kb.toFixed(2)} KB`;
  };

  const handleDelete = async (backup) => {
    const confirmed = await confirm(
      'Delete Backup',
      `Are you sure you want to delete backup "${backup.file_name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await api.deleteBackup(backup.file_name);
      toast.success('Backup deleted successfully');
      loadBackups();
    } catch (err) {
      const errorMessage = err.data?.message || err.message || 'Failed to delete backup';
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Backup Files
        </Typography>
        <IconButton onClick={loadBackups} size="small">
          <MdRefresh />
        </IconButton>
      </Box>

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {backups.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No backups found
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Filename</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {backup.file_name}
                  </TableCell>
                  <TableCell>{formatFileSize(backup.size_bytes)}</TableCell>
                  <TableCell>
                    {new Date(backup.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{backup.created_by_name || 'System'}</TableCell>
                  <TableCell>
                    <Chip
                      label={backup.file_exists ? 'Available' : 'Missing'}
                      size="small"
                      color={backup.file_exists ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {backup.file_exists && onRestore && (
                        <Tooltip title="Restore from this backup">
                          <IconButton
                            size="small"
                            onClick={() => onRestore(backup.file_name)}
                            color="primary"
                          >
                            <MdDownload />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete backup">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(backup)}
                          color="error"
                        >
                          <MdDelete />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <ConfirmDialog />
    </Paper>
  );
}

export default BackupList;
