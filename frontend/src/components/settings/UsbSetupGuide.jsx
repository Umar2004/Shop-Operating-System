import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Step, StepContent, StepLabel, Stepper,
  Typography,
} from '@mui/material';
import { MdPrint, MdOpenInNew } from 'react-icons/md';

const steps = [
  {
    label: 'Download Zadig (free tool)',
    content: (
      <Box>
        <Typography variant="body2" gutterBottom>
          Zadig installs the WinUSB driver that allows this app to communicate directly
          with your thermal printer — bypassing Windows print spooler.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<MdOpenInNew />}
          href="https://zadig.akeo.ie"
          target="_blank"
          sx={{ mt: 1 }}
        >
          Open zadig.akeo.ie
        </Button>
      </Box>
    ),
  },
  {
    label: 'List all devices in Zadig',
    content: (
      <Typography variant="body2">
        Open Zadig → click <strong>Options</strong> in the menu bar → enable{' '}
        <strong>"List All Devices"</strong>. This shows every connected USB device.
      </Typography>
    ),
  },
  {
    label: 'Find your Xprinter',
    content: (
      <Typography variant="body2">
        In the dropdown list, select your printer. It may appear as{' '}
        <strong>"Printer POS-58"</strong>, <strong>"Printer POS-80"</strong>,{' '}
        or <strong>"USB Printing Support"</strong>.
        Plug in the printer first if it's not listed.
      </Typography>
    ),
  },
  {
    label: 'Install WinUSB driver',
    content: (
      <Typography variant="body2">
        On the right side of Zadig, make sure <strong>WinUSB</strong> is selected as
        the driver. Click <strong>"Install Driver"</strong> (or "Replace Driver").
        Wait ~30 seconds for it to finish.
      </Typography>
    ),
  },
  {
    label: 'Back in this app',
    content: (
      <Typography variant="body2">
        Go to <strong>Settings → Printer</strong>, enable{' '}
        <strong>"Use Direct ESC/POS print"</strong>, click{' '}
        <strong>"Scan USB"</strong>, select your printer from the list, choose the
        correct paper size, then click <strong>Save</strong> and{' '}
        <strong>Test Print</strong>.
      </Typography>
    ),
  },
];

export default function UsbSetupGuide({ open, onClose }) {
  const [activeStep, setActiveStep] = useState(0);

  const handleClose = () => {
    setActiveStep(0);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MdPrint size={22} />
        Thermal Printer Setup — USB Direct Mode
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          To print directly to your USB thermal printer (Xprinter, etc.) you need to
          install a <strong>WinUSB driver</strong> once using the free Zadig tool.
          This is a one-time setup per printer.
        </Alert>

        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                {step.content}
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  {index < steps.length - 1 ? (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setActiveStep(index + 1)}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      onClick={handleClose}
                    >
                      Done — Go to Printer Settings
                    </Button>
                  )}
                  {index > 0 && (
                    <Button size="small" onClick={() => setActiveStep(index - 1)}>
                      Back
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Note: After installing WinUSB via Zadig, the printer will no longer appear in
          Windows "Printers &amp; Scanners" — it will only work through this app's
          direct print mode. This is normal.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
