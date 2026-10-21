import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Divider,
  Alert,
  Card,
  CardContent,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Save, Refresh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../../api/client';
import { generateInvoiceHTML } from '../../utils/print';

function ReceiptCustomization() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewHtmls, setPreviewHtmls] = useState({ '58': '', '76': '', '80': '' });
  const [activePreview, setActivePreview] = useState('80');
  const [shopName, setShopName] = useState('Shop Operating Platform');
  const [settings, setSettings] = useState({
    headerAlign: 'center',
    itemAlign: 'left',
    totalAlign: 'right',
    footerAlign: 'center',
    fontSize: '12',
    headerFontSize: '14',
    itemFontSize: '11',
    totalFontSize: '13',
    padding: '10',
    paddingLeft: '0',
    paddingRight: '0',
    lineSpacing: '1.3',
  });

  useEffect(() => {
    loadSettings();
    loadShopName();
  }, []);

  useEffect(() => {
    updatePreview();
  }, [settings, shopName]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getReceiptSettings();
      // Ensure all settings have default values if not present, but preserve "0" values
      setSettings({
        headerAlign: data.headerAlign ?? 'center',
        itemAlign: data.itemAlign ?? 'left',
        totalAlign: data.totalAlign ?? 'right',
        footerAlign: data.footerAlign ?? 'center',
        fontSize: data.fontSize ?? '12',
        headerFontSize: data.headerFontSize ?? '14',
        itemFontSize: data.itemFontSize ?? '11',
        totalFontSize: data.totalFontSize ?? '13',
        padding: data.padding ?? '10',
        paddingLeft: data.paddingLeft ?? '0',
        paddingRight: data.paddingRight ?? '0',
        lineSpacing: data.lineSpacing ?? '1.3',
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load receipt settings');
    } finally {
      setLoading(false);
    }
  };

  const loadShopName = async () => {
    try {
      const shopSetting = await api.getSetting('shop.name');
      setShopName(shopSetting?.value || 'Shop Operating Platform');
    } catch (err) {
      // Use default
    }
  };

  const updatePreview = () => {
    try {
      const sampleInvoice = {
        invoice: {
          invoice_number: 'INV-001',
          date_time: new Date().toISOString(),
          customer_name: 'John Doe',
          total_amount: 150.00,
          discount: 10.00,
          additional_amount: 0,
        },
        items: [
          { product_name: 'Product A', quantity: 2, unit_price: 50.00, line_total: 100.00 },
          { product_name: 'Product B', quantity: 1, unit_price: 50.00, line_total: 50.00 },
        ],
        payments: [{ amount: 140.00, payment_type: 'CASH' }],
      };

      const htmls = {};
      for (const size of ['58', '76', '80']) {
        htmls[size] = generateInvoiceHTML(sampleInvoice, {
          shopName,
          paperSize: size,
          printLogo: false,
          logoUrl: null,
          receiptSettings: settings,
        });
      }
      setPreviewHtmls(htmls);
    } catch (err) {
      console.error('Failed to generate preview:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Ensure all values are sent as strings, preserving actual values (including "0")
      const settingsToSave = {
        headerAlign: String(settings.headerAlign ?? 'center'),
        itemAlign: String(settings.itemAlign ?? 'left'),
        totalAlign: String(settings.totalAlign ?? 'right'),
        footerAlign: String(settings.footerAlign ?? 'center'),
        fontSize: String(settings.fontSize ?? '12'),
        headerFontSize: String(settings.headerFontSize ?? '14'),
        itemFontSize: String(settings.itemFontSize ?? '11'),
        totalFontSize: String(settings.totalFontSize ?? '13'),
        padding: String(settings.padding ?? '10'),
        paddingLeft: String(settings.paddingLeft ?? '0'),
        paddingRight: String(settings.paddingRight ?? '0'),
        lineSpacing: String(settings.lineSpacing ?? '1.3'),
      };
      await api.updateReceiptSettings(settingsToSave);
      toast.success('Receipt customization settings saved successfully');
      // Reload settings to ensure we have the saved values
      await loadSettings();
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Receipt Customization
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Customize the appearance and alignment of your receipts and invoices.
        </Typography>

        <Divider sx={{ my: 3 }} />

        {/* Text Alignment Section */}
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
          Text Alignment
        </Typography>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Header Alignment</InputLabel>
              <Select
                value={settings.headerAlign}
                label="Header Alignment"
                onChange={(e) => handleChange('headerAlign', e.target.value)}
              >
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Item Alignment</InputLabel>
              <Select
                value={settings.itemAlign}
                label="Item Alignment"
                onChange={(e) => handleChange('itemAlign', e.target.value)}
              >
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Total Alignment</InputLabel>
              <Select
                value={settings.totalAlign}
                label="Total Alignment"
                onChange={(e) => handleChange('totalAlign', e.target.value)}
              >
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Footer Alignment</InputLabel>
              <Select
                value={settings.footerAlign}
                label="Footer Alignment"
                onChange={(e) => handleChange('footerAlign', e.target.value)}
              >
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Font Size Section */}
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
          Font Sizes (px)
        </Typography>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Default Font Size"
              type="number"
              value={settings.fontSize}
              onChange={(e) => handleChange('fontSize', e.target.value)}
              inputProps={{ min: 8, max: 20, step: 1 }}
              helperText="Base font size for receipt"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Header Font Size"
              type="number"
              value={settings.headerFontSize}
              onChange={(e) => handleChange('headerFontSize', e.target.value)}
              inputProps={{ min: 8, max: 24, step: 1 }}
              helperText="Shop name and title"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Item Font Size"
              type="number"
              value={settings.itemFontSize}
              onChange={(e) => handleChange('itemFontSize', e.target.value)}
              inputProps={{ min: 8, max: 20, step: 1 }}
              helperText="Product items"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Total Font Size"
              type="number"
              value={settings.totalFontSize}
              onChange={(e) => handleChange('totalFontSize', e.target.value)}
              inputProps={{ min: 8, max: 24, step: 1 }}
              helperText="Total amount"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Spacing Section */}
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
          Spacing
        </Typography>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Padding (px)"
              type="number"
              value={settings.padding}
              onChange={(e) => handleChange('padding', e.target.value)}
              inputProps={{ min: 0, max: 50, step: 1 }}
              helperText="Top and bottom padding"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Left Padding (px)"
              type="number"
              value={settings.paddingLeft}
              onChange={(e) => handleChange('paddingLeft', e.target.value)}
              inputProps={{ min: 0, max: 100, step: 1 }}
              helperText="Left side padding (reduces content width)"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Right Padding (px)"
              type="number"
              value={settings.paddingRight}
              onChange={(e) => handleChange('paddingRight', e.target.value)}
              inputProps={{ min: 0, max: 100, step: 1 }}
              helperText="Right side padding (reduces content width)"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Line Spacing"
              type="number"
              value={settings.lineSpacing}
              onChange={(e) => handleChange('lineSpacing', e.target.value)}
              inputProps={{ min: 1, max: 3, step: 0.1 }}
              helperText="Line height multiplier"
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Preview Section */}
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mb: 2 }}>
          Receipt Preview
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Preview updates automatically as you change settings. Select a paper size to compare layouts.
        </Alert>

        {/* Paper size toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">Paper size:</Typography>
          <ToggleButtonGroup
            value={activePreview}
            exclusive
            onChange={(_, v) => { if (v) setActivePreview(v); }}
            size="small"
          >
            <ToggleButton value="58">58 mm</ToggleButton>
            <ToggleButton value="76">76 mm</ToggleButton>
            <ToggleButton value="80">80 mm</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Three previews side by side (all rendered, only one shown at a time on small screens) */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 3 }}>
          {[
            { size: '58', label: '58 mm', width: '200px' },
            { size: '76', label: '76 mm', width: '280px' },
            { size: '80', label: '80 mm', width: '300px' },
          ].map(({ size, label, width }) => (
            <Box
              key={size}
              onClick={() => setActivePreview(size)}
              sx={{
                cursor: 'pointer',
                border: activePreview === size ? '2px solid #1976d2' : '1px solid #ccc',
                borderRadius: 1,
                overflow: 'hidden',
                bgcolor: '#fff',
                width,
                flexShrink: 0,
                boxShadow: activePreview === size ? 3 : 0,
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
            >
              <Box sx={{ textAlign: 'center', bgcolor: activePreview === size ? 'primary.main' : '#f5f5f5', py: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: activePreview === size ? '#fff' : 'text.secondary' }}>
                  {label}
                </Typography>
              </Box>
              <iframe
                title={`Receipt Preview ${label}`}
                srcDoc={previewHtmls[size]}
                style={{ width: '100%', height: '550px', border: 'none', display: 'block' }}
              />
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 3 }} />

        <Alert severity="info" sx={{ mb: 2 }}>
          Changes will apply to all new receipts and invoices. Use the test print feature in Printer Settings to print a test receipt.
        </Alert>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={updatePreview}
          >
            Refresh Preview
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default ReceiptCustomization;

