import { useState, useCallback, useRef, memo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

// Create a stable dialog component
const ConfirmDialogComponent = memo(({ open, message, onConfirm, onCancel, onClose }) => (
  <Dialog 
    open={open} 
    onClose={onClose}
    disableEscapeKeyDown={false}
  >
    <DialogTitle>Confirm</DialogTitle>
    <DialogContent>
      <DialogContentText>{message}</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} color="inherit">
        Cancel
      </Button>
      <Button onClick={onConfirm} color="primary" variant="contained" autoFocus>
        OK
      </Button>
    </DialogActions>
  </Dialog>
));

ConfirmDialogComponent.displayName = 'ConfirmDialog';

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const callbacksRef = useRef({ onConfirm: null, onCancel: null });

  const confirm = useCallback((msg, onConfirm, onCancel) => {
    callbacksRef.current = { onConfirm, onCancel };
    setMessage(msg);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    const { onConfirm } = callbacksRef.current;
    if (onConfirm) {
      onConfirm();
    }
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    const { onCancel } = callbacksRef.current;
    if (onCancel) {
      onCancel();
    }
  }, []);

  const handleClose = useCallback((event, reason) => {
    if (reason !== 'backdropClick') {
      handleCancel();
    }
  }, [handleCancel]);

  const ConfirmDialog = useCallback(() => (
    <ConfirmDialogComponent
      open={open}
      message={message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onClose={handleClose}
    />
  ), [open, message, handleConfirm, handleCancel, handleClose]);

  return { confirm, ConfirmDialog };
}

