import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { toast } from 'react-toastify';
import { api } from '../../api/client';
import { getInputStep } from '../../utils/numberFormat';

const EMPTY = { quantityChange: 0, reason: '', adjustmentType: 'add' }; // adjustmentType: 'add' or 'reduce'

// Adjust Stock for one product. The form state lives here, so typing a quantity or reason doesn't re-render the
// Products page. The parent gives it a new `key` each time it opens, which starts the form fresh.
function StockAdjustDialog({ open, product, onClose, onSaved }) {
  const [stockAdjustment, setStockAdjustment] = useState(EMPTY);
  const currentStock = product?.current_stock || 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Adjust Stock - {product?.name}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Current Stock: <strong>{currentStock}</strong>
          </Typography>
          {stockAdjustment.quantityChange > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {stockAdjustment.adjustmentType === 'add' ? (
                <>
                  Adding: <strong style={{ color: '#2e7d32' }}>+{stockAdjustment.quantityChange}</strong>
                  <br />
                  New Stock: <strong style={{ color: '#2e7d32' }}>{product?.current_stock + stockAdjustment.quantityChange}</strong>
                </>
              ) : (
                <>
                  Reducing: <strong style={{ color: '#d32f2f' }}>-{stockAdjustment.quantityChange}</strong>
                  <br />
                  New Stock: <strong style={{ color: product?.current_stock - stockAdjustment.quantityChange >= 0 ? '#2e7d32' : '#d32f2f' }}>
                    {product?.current_stock - stockAdjustment.quantityChange}
                  </strong>
                  {product?.current_stock - stockAdjustment.quantityChange < 0 && (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                      Warning: Stock will go negative!
                    </Typography>
                  )}
                </>
              )}
            </Typography>
          )}
        </Box>

        {/* Adjustment Type Selection */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <Button
            variant={stockAdjustment.adjustmentType === 'add' ? 'contained' : 'outlined'}
            color="success"
            fullWidth
            onClick={() => setStockAdjustment({ ...stockAdjustment, adjustmentType: 'add', quantityChange: 0 })}
          >
            Add Stock
          </Button>
          <Button
            variant={stockAdjustment.adjustmentType === 'reduce' ? 'contained' : 'outlined'}
            color="error"
            fullWidth
            onClick={() => setStockAdjustment({ ...stockAdjustment, adjustmentType: 'reduce', quantityChange: 0 })}
          >
            Reduce Stock
          </Button>
        </Box>

        <TextField
          label={stockAdjustment.adjustmentType === 'add' ? 'Quantity to Add' : 'Quantity to Reduce'}
          fullWidth
          margin="normal"
          type="number"
          value={stockAdjustment.quantityChange}
          onChange={(e) => {
            const value = Number(e.target.value) || 0;
            setStockAdjustment({ ...stockAdjustment, quantityChange: value >= 0 ? value : 0 });
          }}
          helperText={stockAdjustment.adjustmentType === 'add'
            ? 'Enter the quantity to add to current stock'
            : 'Enter the quantity to reduce from current stock'}
          inputProps={{ min: 0, step: getInputStep() }}
        />
        <TextField
          label="Reason (Optional)"
          fullWidth
          margin="normal"
          multiline
          rows={3}
          value={stockAdjustment.reason}
          onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
          placeholder={
            stockAdjustment.adjustmentType === 'add'
              ? 'e.g., Stock received, New purchase, Stock correction...'
              : 'e.g., Damaged items, Expired products, Stock correction, Theft...'
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color={stockAdjustment.adjustmentType === 'add' ? 'success' : 'error'}
          disabled={stockAdjustment.quantityChange === 0 || (stockAdjustment.adjustmentType === 'reduce' && stockAdjustment.quantityChange > currentStock)}
          onClick={async () => {
            try {
              const quantityChange = stockAdjustment.adjustmentType === 'add'
                ? stockAdjustment.quantityChange
                : -stockAdjustment.quantityChange;

              await api.adjustProductStock(product.id, quantityChange, stockAdjustment.reason);
              onClose();
              toast.success(`Stock ${stockAdjustment.adjustmentType === 'add' ? 'added' : 'reduced'} successfully`);
              onSaved();
            } catch (err) {
              toast.error(err.message);
            }
          }}
        >
          {stockAdjustment.adjustmentType === 'add' ? 'Add Stock' : 'Reduce Stock'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default StockAdjustDialog;
