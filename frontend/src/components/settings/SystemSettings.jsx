import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { MdSave, MdSettings } from 'react-icons/md';
import { api } from '../../api/client';
import ThemeColorPicker from './ThemeColorPicker';
import { setDecimalPlaces } from '../../utils/numberFormat';

function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState({
    'theme.primary': '#1976D2',
    'system.decimal_places': '2',
    'sidebar.background': '#0D47A1',
    'sidebar.text': '#E3F2FD',
    'sidebar.accent': '#1976D2',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings({
        'theme.primary': data['theme.primary'] || '#1976D2',
        'system.decimal_places': data['system.decimal_places'] || '2',
        'sidebar.background': data['sidebar.background'] || '#0D47A1',
        'sidebar.text': data['sidebar.text'] || '#E3F2FD',
        'sidebar.accent': data['sidebar.accent'] || '#1976D2',
      });
      // Update decimal places utility
      setDecimalPlaces(data['system.decimal_places'] || '2');
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      // Ensure all settings have valid values
      const settingsToSave = {
        'theme.primary': settings['theme.primary'] || '#1976D2',
        'system.decimal_places': settings['system.decimal_places'] || '2',
        'sidebar.background': settings['sidebar.background'] || '#0D47A1',
        'sidebar.text': settings['sidebar.text'] || '#E3F2FD',
        'sidebar.accent': settings['sidebar.accent'] || '#1976D2',
      };
      
      await api.updateSettings(settingsToSave);
      
      // Cache sidebar colors in localStorage before reload
      if (settingsToSave['sidebar.background'] || settingsToSave['sidebar.text'] || settingsToSave['sidebar.accent']) {
        localStorage.setItem('sidebarColors', JSON.stringify({
          background: settingsToSave['sidebar.background'] || '#0D47A1',
          text: settingsToSave['sidebar.text'] || '#E3F2FD',
          accent: settingsToSave['sidebar.accent'] || '#1976D2',
        }));
      }
      
      setSuccess('Settings saved successfully');
      // Update decimal places utility
      setDecimalPlaces(settingsToSave['system.decimal_places']);
      // Reload page to apply theme changes
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('Save error:', err);
      const errorMessage = err.data?.message || err.message || 'Failed to save settings';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (color) => {
    setSettings({ ...settings, 'theme.primary': color });
  };

  const handleDecimalChange = (e) => {
    const value = e.target.value;
    if (value >= 1) {
      setSettings({ ...settings, 'system.decimal_places': value });
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
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <MdSettings />
        <Typography variant="h6">System Settings</Typography>
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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Theme Color Picker */}
        <ThemeColorPicker
          value={settings['theme.primary']}
          onChange={handleThemeChange}
          loading={saving}
        />

        {/* Sidebar Colors */}
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2, fontWeight: 500 }}>
            Sidebar Colors
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <ThemeColorPicker
              value={settings['sidebar.background']}
              onChange={(color) => setSettings({ ...settings, 'sidebar.background': color })}
              loading={saving}
              label="Background Color"
            />
            <ThemeColorPicker
              value={settings['sidebar.text']}
              onChange={(color) => setSettings({ ...settings, 'sidebar.text': color })}
              loading={saving}
              label="Text Color"
            />
            <ThemeColorPicker
              value={settings['sidebar.accent']}
              onChange={(color) => setSettings({ ...settings, 'sidebar.accent': color })}
              loading={saving}
              label="Accent Color"
            />
          </Box>
        </Box>

        {/* Decimal Places */}
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>
            Decimal Places
          </Typography>
          <TextField
            type="number"
            label="Decimal Places"
            value={settings['system.decimal_places']}
            onChange={handleDecimalChange}
            disabled={saving}
            inputProps={{ min: 1, step: 1 }}
            size="small"
            sx={{ width: 200 }}
            helperText="Number of decimal places for currency and numbers (1 or more)"
          />
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Example: 1 = 0.1, 2 = 0.12, 3 = 0.123, 4 = 0.1234
            </Typography>
          </Box>
        </Box>

        {/* Save Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <MdSave />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

export default SystemSettings;
