import { useState } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

// A password TextField with a show/hide (eye) button. Takes every TextField prop.
// The button is left out of the Tab order, so Tab still goes from the field to the next one.
// confirms: on a "confirm password" field, the password it must match; shows an inline error
// once something is typed here and it differs.
function PasswordField({ slotProps, disabled, confirms, error, helperText, ...props }) {
  const [visible, setVisible] = useState(false);
  const mismatch = confirms !== undefined && !!props.value && props.value !== confirms;

  return (
    <TextField
      {...props}
      disabled={disabled}
      error={error || mismatch}
      helperText={mismatch ? "Passwords don't match" : helperText}
      type={visible ? 'text' : 'password'}
      slotProps={{
        ...slotProps,
        input: {
          ...slotProps?.input,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                tabIndex={-1}
                disabled={disabled}
                aria-label={visible ? 'Hide password' : 'Show password'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

export default PasswordField;
