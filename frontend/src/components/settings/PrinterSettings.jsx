import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Grid,
  Radio,
  RadioGroup,
  FormLabel,
} from '@mui/material';
import { Save, Refresh, Print } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../../api/client';
import { generateTestReceiptHTML } from '../../utils/print';
import UsbSetupGuide from './UsbSetupGuide';
import { PRODUCT_NAME } from '../../config/brand';

function PrinterSettings() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [settings, setSettings] = useState({
    name: '',
    paperSize: '80',
    silentPrint: true,
    autoCut: false,
    printLogo: false,
    useDirect: false,
    usbDeviceId: '',
  });
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [availableUsbDevices, setAvailableUsbDevices] = useState([]);
  const [loadingUsb, setLoadingUsb] = useState(false);
  const [showUsbGuide, setShowUsbGuide] = useState(false);

  useEffect(() => {
    initSettings();
  }, []);

  const initSettings = async () => {
    setLoading(true);
    setLoadingPrinters(true);
    try {
      const [data, printers, usbDevices] = await Promise.all([
        api.getPrinterSettings(),
        isElectron ? api.getPrinters() : Promise.resolve([]),
        isElectron ? api.listUsbPrinters() : Promise.resolve([]),
      ]);

      const savedName = data.name || '';
      const printerList = printers || [];
      const nameIsValid = printerList.some(p => p.name === savedName);

      setAvailablePrinters(printerList);
      setAvailableUsbDevices(usbDevices || []);
      setSettings({
        name: nameIsValid ? savedName : '',
        paperSize: data.paperSize || '80',
        silentPrint: data.silentPrint !== false,
        autoCut: data.autoCut === true,
        printLogo: data.printLogo === true,
        useDirect: data.useDirect === true,
        usbDeviceId: data.usbDeviceId || '',
      });

      if (savedName && !nameIsValid && printerList.length > 0) {
        toast.warning(`Saved printer "${savedName}" not found. Please re-select.`);
      }
    } catch (err) {
      console.error('Failed to load printer settings:', err);
      toast.error('Failed to load printer settings');
    } finally {
      setLoading(false);
      setLoadingPrinters(false);
    }
  };

  const refreshUsbDevices = async () => {
    setLoadingUsb(true);
    try {
      const devices = await api.listUsbPrinters();
      setAvailableUsbDevices(devices || []);
      if (!devices || devices.length === 0) {
        toast.warning('No USB printers found via libusb. Make sure WinUSB driver is installed using Zadig.');
      } else {
        toast.success(`Found ${devices.length} USB printer(s)`);
      }
    } catch (err) {
      toast.error('Failed to list USB devices');
    } finally {
      setLoadingUsb(false);
    }
  };

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const printers = await api.getPrinters();
      const printerList = printers || [];
      setAvailablePrinters(printerList);
      if (printerList.length === 0) {
        toast.warning('No printers detected. Connect printer and install driver.');
      }
    } catch (err) {
      console.error('Failed to load printers:', err);
      toast.error('Failed to load printers. Make sure you are running in Electron.');
      setAvailablePrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updatePrinterSettings(settings);
      toast.success('Printer settings saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save printer settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    if (!settings.name) {
      toast.error('Please select a printer first');
      return;
    }

    setTesting(true);
    try {
      // Get shop name and receipt settings
      let shopName = PRODUCT_NAME;
      let receiptSettings = {};
      try {
        const shopSettings = await api.getSetting('shop.name');
        shopName = shopSettings?.value || PRODUCT_NAME;
        
        // Get receipt customization settings
        receiptSettings = await api.getReceiptSettings();
      } catch (err) {
        // use defaults
      }

      // Generate test receipt HTML
      const html = generateTestReceiptHTML({
        shopName,
        paperSize: settings.paperSize,
        receiptSettings,
      });

      // Print via Electron
      if (settings.useDirect) {
        await api.printReceiptDirect({
          type: 'test',
          printerName: settings.name,
          paperSize: settings.paperSize,
          shopName,
          receiptSettings,
          printLogo: settings.printLogo || false,
          usbDeviceId: settings.usbDeviceId || null,
        });
      } else {
        await api.printReceipt({
          html,
          printerName: settings.name,
          silent: settings.silentPrint,
          paperSize: settings.paperSize,
        });
      }

      toast.success('Test receipt sent to printer');
    } catch (err) {
      toast.error(err.message || 'Failed to print test receipt');
    } finally {
      setTesting(false);
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
    <Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Printer Settings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure your thermal printer for invoices and receipts. Supported paper sizes: 58mm, 76mm, 80mm
        </Typography>

        {!isElectron && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Printer detection and test printing require the desktop app (Electron). You are currently viewing this page in a web browser — settings can be saved but printers cannot be listed or tested here.
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Section A: Printer Selection */}
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Printer</InputLabel>
              <Select
                value={settings.name}
                label="Printer"
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                disabled={loadingPrinters || !isElectron}
              >
                {availablePrinters.length === 0 ? (
                  <MenuItem value="" disabled>
                    {loadingPrinters ? 'Loading printers...' : 'No printers found'}
                  </MenuItem>
                ) : (
                  availablePrinters.map((printer) => (
                    <MenuItem key={printer.name} value={printer.name}>
                      {printer.displayName || printer.name} {printer.isDefault ? '✅' : ''}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Refresh />}
                onClick={loadPrinters}
                disabled={loadingPrinters || !isElectron}
              >
                {loadingPrinters ? 'Refreshing...' : 'Refresh Printers'}
              </Button>
            </Box>
            {availablePrinters.length === 0 && !loadingPrinters && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                No printer detected. Connect printer and install driver.
              </Alert>
            )}
          </Grid>

          {/* Section B: Paper Size */}
          <Grid item xs={12} md={6}>
            <FormControl component="fieldset" margin="normal" fullWidth>
              <FormLabel component="legend">Paper Size</FormLabel>
              <RadioGroup
                row
                value={settings.paperSize}
                onChange={(e) => setSettings({ ...settings, paperSize: e.target.value })}
              >
                <FormControlLabel value="58" control={<Radio />} label="58 mm" />
                <FormControlLabel value="76" control={<Radio />} label="76 mm" />
                <FormControlLabel value="80" control={<Radio />} label="80 mm" />
              </RadioGroup>
            </FormControl>
          </Grid>

          {/* Section C: Print Options */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Print Options
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.silentPrint}
                    onChange={(e) => setSettings({ ...settings, silentPrint: e.target.checked })}
                  />
                }
                label="Silent print (recommended)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.autoCut}
                    onChange={(e) => setSettings({ ...settings, autoCut: e.target.checked })}
                  />
                }
                label="Auto-cut after print (if supported)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.useDirect}
                    onChange={(e) => setSettings({ ...settings, useDirect: e.target.checked })}
                  />
                }
                label="Use Direct ESC/POS print (for RAW-only drivers like XPrinter)"
              />
              {settings.useDirect && (
                <Box sx={{ mt: 1, ml: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Alert severity="info" sx={{ flex: 1 }}>
                      Direct ESC/POS mode — printer needs a <strong>WinUSB driver</strong> (one-time setup).
                    </Alert>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setShowUsbGuide(true)}
                      sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      Setup Guide
                    </Button>
                  </Box>
                  {/* USB Device selector */}
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                    <FormControl sx={{ minWidth: 260 }}>
                      <InputLabel>USB Device (VID:PID)</InputLabel>
                      <Select
                        value={settings.usbDeviceId}
                        label="USB Device (VID:PID)"
                        onChange={(e) => setSettings({ ...settings, usbDeviceId: e.target.value })}
                        disabled={loadingUsb || !isElectron}
                        size="small"
                      >
                        <MenuItem value=""><em>Auto (first found)</em></MenuItem>
                        {availableUsbDevices.map((d) => (
                          <MenuItem key={d.id} value={d.id}>{d.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={loadingUsb ? <CircularProgress size={16} /> : <Refresh />}
                      onClick={refreshUsbDevices}
                      disabled={loadingUsb || !isElectron}
                    >
                      Scan USB
                    </Button>
                  </Box>

                  {availableUsbDevices.length === 0 && !loadingUsb && isElectron && (
                    <Alert severity="warning">
                      No USB printers detected via libusb. Install the <strong>WinUSB</strong> driver
                      for your printer using <strong>Zadig</strong> (zadig.akeo.ie):
                      <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        <li>Open Zadig → Options → List All Devices</li>
                        <li>Select your Xprinter from the list</li>
                        <li>Choose <strong>WinUSB</strong> → click Install Driver</li>
                        <li>Come back here and click "Scan USB"</li>
                      </ol>
                    </Alert>
                  )}
                </Box>
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.printLogo}
                    onChange={(e) => setSettings({ ...settings, printLogo: e.target.checked })}
                  />
                }
                label="Print logo on receipt"
              />
            </Box>
          </Grid>

          {/* Section D: Test Print */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={testing ? <CircularProgress size={20} /> : <Print />}
                onClick={handleTestPrint}
                disabled={testing || !settings.name || !isElectron}
                sx={{ minWidth: 200 }}
              >
                {testing ? 'Printing...' : '🧾 Print Test Receipt'}
              </Button>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={20} /> : <Save />}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </Box>
          </Grid>

        </Grid>
      </Paper>

      <UsbSetupGuide open={showUsbGuide} onClose={() => setShowUsbGuide(false)} />
    </Box>
  );
}

export default PrinterSettings;

