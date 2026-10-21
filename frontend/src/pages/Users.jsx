import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdRefresh,
  MdLock,
  MdLockOpen,
  MdPerson,
} from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useConfirmDialog } from '../utils/confirmDialog';
import { useAuthStore } from '../store/authStore';

function Users() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role_id: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Check if user is ADMIN
    if (user?.role !== 'ADMIN') {
      navigate('/');
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [usersData, rolesData, permissionsData] = await Promise.all([
        api.listUsers(),
        api.listRoles(),
        api.getAvailablePermissions(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setAvailablePermissions(permissionsData);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = async (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        password: '',
        role_id: user.role_id,
        is_active: user.is_active === 1 || user.is_active === true,
      });
      setShowPassword(false);
      
      // Load user permissions
      try {
        const permissions = await api.getUserPermissions(user.id);
        // Ensure dashboard is always included
        const permissionsWithDashboard = permissions.includes('dashboard') 
          ? permissions 
          : ['dashboard', ...permissions];
        setUserPermissions(permissionsWithDashboard);
      } catch (err) {
        console.error('Failed to load user permissions:', err);
        setUserPermissions(['dashboard']); // Default to dashboard only
      }
    } else {
      setEditingUser(null);
      setFormData({
        username: '',
        password: '',
        role_id: roles.length > 0 ? roles[0].id : '',
        is_active: true,
      });
      setShowPassword(true);
      setUserPermissions(['dashboard']); // Default to dashboard only
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      role_id: '',
      is_active: true,
    });
    setUserPermissions([]);
    setError('');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Validation
      if (!formData.username.trim()) {
        setError('Username is required');
        setSaving(false);
        return;
      }

      if (!editingUser && !formData.password.trim()) {
        setError('Password is required for new users');
        setSaving(false);
        return;
      }

      if (formData.password && formData.password.length < 6) {
        setError('Password must be at least 6 characters');
        setSaving(false);
        return;
      }

      if (!formData.role_id) {
        setError('Role is required');
        setSaving(false);
        return;
      }

      if (editingUser) {
        await api.updateUser(editingUser.id, {
          username: formData.username.trim(),
          password: formData.password || undefined,
          role_id: Number(formData.role_id),
          is_active: formData.is_active,
        });
        // Update permissions (always include dashboard)
        const permissionsToSet = userPermissions.includes('dashboard') 
          ? userPermissions 
          : ['dashboard', ...userPermissions];
        await api.updateUserPermissions(editingUser.id, permissionsToSet);
        setSuccess('User updated successfully');
        
        // Close dialog and reload after a short delay
        setTimeout(() => {
          handleCloseDialog();
          loadData();
          setSuccess('');
        }, 1500);
        return;
      } else {
        const userPayload = {
          username: formData.username.trim(),
          password: formData.password,
          role_id: Number(formData.role_id),
          is_active: formData.is_active,
        };
        
        const newUser = await api.createUser(userPayload);
        
        if (!newUser || !newUser.id) {
          throw new Error('User creation returned invalid response');
        }
        
        // Set permissions for new user (always include dashboard)
        // Don't fail user creation if permissions update fails
        let permissionsError = false;
        try {
          const permissionsToSet = userPermissions.includes('dashboard') 
            ? userPermissions 
            : ['dashboard', ...userPermissions];
          await api.updateUserPermissions(newUser.id, permissionsToSet);
        } catch (permErr) {
          // User is created, just permissions failed - show warning but don't fail
          setError('User created but failed to set permissions. You can edit the user to set permissions.');
          permissionsError = true;
        }
        
        if (!permissionsError) {
          setSuccess('User created successfully');
          
          // Close dialog and reload after a short delay
          setTimeout(() => {
            handleCloseDialog();
            loadData();
            setSuccess('');
          }, 1500);
        }
        return;
      }
    } catch (err) {
      // Try to extract more detailed error message
      let errorMessage = 'Failed to save user';
      if (err.data?.message) {
        errorMessage = err.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (user) => {
    confirm(
      `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
      async () => {
        try {
          setError('');
          setSuccess('');
          await api.deleteUser(user.id);
          setSuccess('User deleted successfully');
          loadData();
          setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
          setError(err.message || 'Failed to delete user');
        }
      },
      () => {
        // Cancelled
      }
    );
  };

  const handleToggleActive = async (user) => {
    try {
      setError('');
      await api.updateUser(user.id, {
        is_active: !user.is_active,
      });
      setSuccess(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`);
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update user');
    }
  };

  const getRoleColor = (roleName) => {
    switch (roleName) {
      case 'ADMIN':
        return 'error';
      case 'MANAGER':
        return 'warning';
      case 'CASHIER':
        return 'info';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          User Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<MdRefresh />}
            onClick={loadData}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<MdAdd />}
            onClick={() => handleOpenDialog()}
          >
            Add User
          </Button>
        </Box>
      </Box>

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

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No users found. Click "Add User" to create one.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <MdPerson />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {user.username}
                        </Typography>
                        {user.username === 'admin' && (
                          <Chip label="System" size="small" color="error" variant="outlined" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.role_name}
                        size="small"
                        color={getRoleColor(user.role_name)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={user.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title={user.is_active ? 'Deactivate' : 'Activate'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleActive(user)}
                            disabled={user.username === 'admin'}
                            color={user.is_active ? 'default' : 'success'}
                          >
                            {user.is_active ? <MdLockOpen /> : <MdLock />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(user)}
                            color="primary"
                          >
                            <MdEdit />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(user)}
                            disabled={user.username === 'admin'}
                            color="error"
                          >
                            <MdDelete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={editingUser?.username === 'admin' || saving}
              fullWidth
              required
              helperText={editingUser?.username === 'admin' ? 'Admin username cannot be changed' : ''}
            />

            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              disabled={saving}
              fullWidth
              required={!editingUser}
              helperText={
                editingUser
                  ? 'Leave empty to keep current password'
                  : 'Password must be at least 6 characters'
              }
            />

            <FormControl fullWidth required>
              <InputLabel>Role</InputLabel>
              <Select
                value={formData.role_id}
                label="Role"
                onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                disabled={editingUser?.username === 'admin' || saving}
              >
                {roles.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {role.name}
                      </Typography>
                      {role.description && (
                        <Typography variant="caption" color="text.secondary">
                          {role.description}
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              {editingUser?.username === 'admin' && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Admin role cannot be changed
                </Typography>
              )}
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  disabled={editingUser?.username === 'admin' || saving}
                />
              }
              label="Active"
            />
            {editingUser?.username === 'admin' && (
              <Typography variant="caption" color="text.secondary">
                Admin user cannot be deactivated
              </Typography>
            )}

            {/* Page Permissions */}
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                Page Access Permissions
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Select which pages this user can access. These pages will appear in their navigation menu.
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 1.5,
                  maxHeight: 200,
                  overflowY: 'auto',
                  p: 1,
                  bgcolor: 'background.default',
                  borderRadius: 1,
                }}
              >
                {availablePermissions.map((permission) => {
                  const isDashboard = permission.key === 'dashboard';
                  const isChecked = userPermissions.includes(permission.key) || isDashboard;
                  
                  return (
                    <FormControlLabel
                      key={permission.key}
                      control={
                        <Switch
                          size="small"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserPermissions([...userPermissions, permission.key]);
                            } else {
                              setUserPermissions(userPermissions.filter((p) => p !== permission.key));
                            }
                          }}
                          disabled={saving || isDashboard}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {permission.label}
                            {isDashboard && ' (Always enabled)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {permission.description}
                          </Typography>
                        </Box>
                      }
                    />
                  );
                })}
              </Box>
              {userPermissions.filter(p => p !== 'dashboard').length === 0 && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                  ⚠️ No additional pages selected. User will only see Dashboard. Consider selecting at least one page.
                </Typography>
              )}
              {userPermissions.filter(p => p !== 'dashboard').length > 0 && (
                <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 1 }}>
                  ✓ {userPermissions.filter(p => p !== 'dashboard').length} additional page(s) selected. Dashboard is always accessible.
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || !formData.username.trim() || !formData.role_id || (!editingUser && !formData.password.trim())}
            startIcon={saving ? <CircularProgress size={16} /> : null}
          >
            {saving ? 'Saving...' : editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog />
    </Box>
  );
}

export default Users;

