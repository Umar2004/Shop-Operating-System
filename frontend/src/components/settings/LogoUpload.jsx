import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { MdImage, MdUpload, MdDelete } from 'react-icons/md';
import { api } from '../../api/client';

function LogoUpload({ logoPath, onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (logoPath) {
      setPreview(api.getLogoUrl());
    }
  }, [logoPath]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be less than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // Upload file
    try {
      setUploading(true);
      setError('');
      const result = await api.uploadLogo(file);
      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err.message || 'Failed to upload logo');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await api.updateSetting('shop.logo_path', '');
      setPreview(null);
      if (onUploadSuccess) {
        onUploadSuccess({ logo_path: '' });
      }
    } catch (err) {
      setError(err.message || 'Failed to remove logo');
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>
        Shop Logo
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Preview */}
        {preview && (
          <Box
            sx={{
              width: 150,
              height: 150,
              border: '2px solid #e0e0e0',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              bgcolor: '#f5f5f5',
            }}
          >
            <img
              src={preview}
              alt="Shop Logo"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>
        )}

        {/* Upload Controls */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="logo-upload-input"
          />
          <label htmlFor="logo-upload-input">
            <Button
              variant="outlined"
              component="span"
              startIcon={uploading ? <CircularProgress size={16} /> : <MdUpload />}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : preview ? 'Change Logo' : 'Upload Logo'}
            </Button>
          </label>

          {preview && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<MdDelete />}
              onClick={handleRemove}
              size="small"
            >
              Remove Logo
            </Button>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300 }}>
            Upload your shop logo. Supported formats: JPG, PNG, GIF, WebP. Max size: 2MB.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default LogoUpload;
