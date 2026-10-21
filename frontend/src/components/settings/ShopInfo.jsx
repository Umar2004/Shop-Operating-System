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
import { MdStore, MdSave } from 'react-icons/md';
import { api } from '../../api/client';
import LogoUpload from './LogoUpload';

function ShopInfo() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shopInfo, setShopInfo] = useState({
    name: '',
    phone: '',
    address: '',
    logo_path: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await api.getSettings();
      setShopInfo({
        name: settings['shop.name'] || '',
        phone: settings['shop.phone'] || '',
        address: settings['shop.address'] || '',
        logo_path: settings['shop.logo_path'] || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load shop information');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await api.updateSettings({
        'shop.name': shopInfo.name,
        'shop.phone': shopInfo.phone,
        'shop.address': shopInfo.address,
      });
      setSuccess('Shop information saved successfully');
    } catch (err) {
      setError(err.message || 'Failed to save shop information');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (result) => {
    if (result.logo_path) {
      setShopInfo({ ...shopInfo, logo_path: result.logo_path });
      setSuccess('Logo uploaded successfully');
    } else {
      setShopInfo({ ...shopInfo, logo_path: '' });
      setSuccess('Logo removed successfully');
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
        <MdStore />
        <Typography variant="h6">Shop Information</Typography>
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
        {/* Logo Upload */}
        <LogoUpload logoPath={shopInfo.logo_path} onUploadSuccess={handleLogoUpload} />

        {/* Shop Details Form */}
        <TextField
          label="Shop Name"
          value={shopInfo.name}
          onChange={(e) => setShopInfo({ ...shopInfo, name: e.target.value })}
          disabled={saving}
          fullWidth
          required
        />

        <TextField
          label="Phone Number"
          value={shopInfo.phone}
          onChange={(e) => setShopInfo({ ...shopInfo, phone: e.target.value })}
          disabled={saving}
          fullWidth
          placeholder="+1234567890"
        />

        <TextField
          label="Address"
          value={shopInfo.address}
          onChange={(e) => setShopInfo({ ...shopInfo, address: e.target.value })}
          disabled={saving}
          fullWidth
          multiline
          rows={3}
          placeholder="Enter shop address..."
        />

        {/* Save Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <MdSave />}
            onClick={handleSave}
            disabled={saving || !shopInfo.name}
          >
            {saving ? 'Saving...' : 'Save Shop Information'}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

export default ShopInfo;
