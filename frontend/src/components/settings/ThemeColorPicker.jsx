import { useState, useEffect } from 'react';
import { Box, TextField, Typography, Paper, Button } from '@mui/material';
import { MdColorLens } from 'react-icons/md';

function ThemeColorPicker({ value, onChange, loading, label }) {
  const [color, setColor] = useState(value || '#1976D2');

  useEffect(() => {
    if (value) {
      setColor(value);
    }
  }, [value]);

  const handleColorChange = (e) => {
    const newColor = e.target.value;
    setColor(newColor);
    if (onChange) {
      onChange(newColor);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom sx={{ mb: 1, fontWeight: 500 }}>
        {label || 'Primary Theme Color'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: 1,
            bgcolor: color,
            border: '2px solid #e0e0e0',
            boxShadow: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MdColorLens style={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <TextField
          type="color"
          value={color}
          onChange={handleColorChange}
          disabled={loading}
          sx={{
            width: 100,
            '& input[type="color"]': {
              width: '100%',
              height: 40,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 1,
            },
          }}
        />
        <TextField
          label="Hex Color"
          value={color}
          onChange={(e) => {
            const newColor = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
              setColor(newColor);
              if (onChange) {
                onChange(newColor);
              }
            } else {
              setColor(newColor);
            }
          }}
          disabled={loading}
          size="small"
          sx={{ minWidth: 120 }}
          placeholder="#1976D2"
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        This color will be used throughout the system for primary actions and highlights.
      </Typography>
    </Box>
  );
}

export default ThemeColorPicker;
