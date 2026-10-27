import { useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { CalendarToday } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../../api/client';
import { getInputStep } from '../../utils/numberFormat';
import { useConfirmDialog } from '../../utils/confirmDialog';
import UnitSelect from '../UnitSelect';
import { DEFAULT_UNIT } from '../../config/units';

const formFor = (product) =>
  product
    ? {
        name: product.name,
        categoryName: product.category_name || '',
        costPrice: product.cost_price,
        sellingPrice: product.selling_price,
        openingStock: product.opening_stock,
        minimumStock: product.minimum_stock,
        unit: product.unit || DEFAULT_UNIT,
        mfd: product.mfd || '',
        exp: product.exp || '',
        status: product.status || 'ACTIVE',
      }
    : {
        name: '',
        categoryName: '',
        costPrice: 0,
        sellingPrice: 0,
        openingStock: 0,
        minimumStock: 0,
        unit: DEFAULT_UNIT,
        mfd: '',
        exp: '',
        status: 'ACTIVE',
      };

// Add / Edit Product. The form state lives here, so typing in it re-renders only this dialog, not the Products
// page and its table. The parent gives it a new `key` each time it opens, which starts the form fresh.
// product: the product being edited, or null to add one. onSaved: called after a successful save.
function ProductFormDialog({ open, product, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFor(product));
  const mfdRef = useRef(null);
  const expRef = useRef(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const editing = !!product;

  // confirmLowMargin is sent only after the user confirms a price not above cost;
  // the server enforces the same rule and answers 409 PRICE_NOT_ABOVE_COST otherwise
  const saveProduct = async (confirmLowMargin) => {
    try {
      if (editing) {
        // Update existing product
        await api.updateProduct(product.id, {
          name: form.name,
          categoryName: form.categoryName,
          unit: form.unit,
          costPrice: form.costPrice,
          sellingPrice: form.sellingPrice,
          minimumStock: form.minimumStock,
          status: form.status,
          mfd: form.mfd || null,
          exp: form.exp || null,
          confirmLowMargin,
        });
        onClose();
        toast.success('Product updated');
      } else {
        // Create new product
        await api.createProduct({ ...form, confirmLowMargin });
        onClose();
        toast.success('Product created');
      }
      onSaved();
    } catch (err) {
      if (err.data?.code === 'PRICE_NOT_ABOVE_COST' && !confirmLowMargin) {
        confirm(`${err.message} Save anyway?`, () => saveProduct(true));
        return;
      }
      toast.error(err.message);
    }
  };

  const openPicker = (ref) => {
    if (ref.current) {
      if (typeof ref.current.showPicker === 'function') {
        ref.current.showPicker();
      } else {
        ref.current.focus();
      }
    }
  };

  const priceNotAboveCost = Math.round(Number(form.sellingPrice) * 100) <= Math.round(Number(form.costPrice) * 100);

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth>
        <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Name"
            fullWidth
            margin="normal"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Autocomplete
            freeSolo
            options={categoryNames}
            value={form.categoryName}
            onChange={(_, newValue) => setForm({ ...form, categoryName: newValue || '' })}
            renderInput={(params) => <TextField {...params} label="Category" fullWidth margin="normal" />}
          />
          <UnitSelect
            fullWidth
            margin="normal"
            size="small"
            value={form.unit}
            onChange={(unit) => setForm({ ...form, unit })}
          />
          <TextField
            label="Cost Price"
            fullWidth
            margin="normal"
            type="number"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) || 0 })}
            inputProps={{ min: 0, step: getInputStep() }}
          />
          <TextField
            label="Selling Price"
            fullWidth
            margin="normal"
            type="number"
            value={form.sellingPrice}
            onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) || 0 })}
            // Warn early; saving at or below cost also asks for confirmation
            error={priceNotAboveCost}
            helperText={priceNotAboveCost ? 'Selling price is not greater than cost price' : undefined}
            inputProps={{ min: 0, step: getInputStep() }}
          />
          <TextField
            label="Opening Stock"
            fullWidth
            margin="normal"
            type="number"
            value={form.openingStock}
            onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) || 0 })}
            inputProps={{ min: 0, step: getInputStep() }}
            disabled={editing}
            helperText={editing ? 'Opening stock cannot be changed after product creation' : ''}
          />
          <TextField
            label="Minimum Stock Level"
            fullWidth
            margin="normal"
            type="number"
            value={form.minimumStock}
            onChange={(e) => setForm({ ...form, minimumStock: Number(e.target.value) || 0 })}
            inputProps={{ min: 0, step: getInputStep() }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="MFD"
              type="date"
              margin="normal"
              fullWidth
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" tabIndex={-1} aria-label="Open MFD calendar" onClick={() => openPicker(mfdRef)}>
                      <CalendarToday fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputRef={mfdRef}
              value={form.mfd}
              onChange={(e) => setForm({ ...form, mfd: e.target.value })}
            />
            <TextField
              label="EXP"
              type="date"
              margin="normal"
              fullWidth
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" tabIndex={-1} aria-label="Open EXP calendar" onClick={() => openPicker(expRef)}>
                      <CalendarToday fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputRef={expRef}
              value={form.exp}
              onChange={(e) => setForm({ ...form, exp: e.target.value })}
            />
          </Box>
          {editing && (
            <FormControl fullWidth margin="normal" size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                <MenuItem value="INACTIVE">INACTIVE</MenuItem>
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => saveProduct(false)}>
            {editing ? 'Update' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog />
    </>
  );
}

export default ProductFormDialog;
