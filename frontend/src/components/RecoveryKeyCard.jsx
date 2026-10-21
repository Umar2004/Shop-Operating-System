import { useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, Typography } from '@mui/material';

// Shows a recovery key ONCE and only lets the user continue after confirming they wrote it down
function RecoveryKeyCard({ recoveryKey, onDone, doneLabel = 'Continue' }) {
  const [written, setWritten] = useState(false);
  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Write this recovery key on paper now and keep it somewhere safe, away from the counter. It is shown only
        once. If the admin password is ever forgotten, this key sets a new one (Login &gt; Forgot password).
      </Alert>
      <Box
        sx={{
          p: 2,
          mb: 2,
          border: '2px dashed',
          borderColor: 'warning.main',
          borderRadius: 1,
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: { xs: '1.25rem', sm: '1.6rem' },
          letterSpacing: '0.12em',
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {recoveryKey}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Capital letters and digits; the dashes are optional when you type it.
      </Typography>
      <FormControlLabel
        control={<Checkbox checked={written} onChange={(e) => setWritten(e.target.checked)} />}
        label="I have written this key down"
      />
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" disabled={!written} onClick={onDone}>
          {doneLabel}
        </Button>
      </Box>
    </Box>
  );
}

export default RecoveryKeyCard;
