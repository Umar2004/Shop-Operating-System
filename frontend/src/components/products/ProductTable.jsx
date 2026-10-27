import { memo } from 'react';
import { Box, Checkbox, IconButton, Paper, Table, TableBody, TableCell, TableHead, TableRow, Tooltip } from '@mui/material';
import { MdEdit, MdInventory } from 'react-icons/md';

const productCode = (p) => p.product_code || `PORD-${String(p.id).padStart(5, '0')}`;

// One product row. Memoized: it re-renders only when its product or its selected state changes, so typing on
// the page, opening dialogs or selecting another row doesn't touch it. The callbacks must be stable (useCallback).
const ProductRow = memo(function ProductRow({ product: p, selected, onToggle, onEdit, onAdjust }) {
  return (
    <TableRow>
      <TableCell padding="checkbox">
        <Checkbox
          checked={selected}
          onChange={(e) => onToggle(p.id, e.target.checked)}
          inputProps={{ 'aria-label': `Select ${p.name}` }}
        />
      </TableCell>
      <TableCell>{productCode(p)}</TableCell>
      <TableCell>{p.name}</TableCell>
      <TableCell>{p.category_name || '-'}</TableCell>
      <TableCell>{p.unit}</TableCell>
      <TableCell>{p.cost_price.toFixed(2)}</TableCell>
      <TableCell>{p.selling_price.toFixed(2)}</TableCell>
      <TableCell>{p.current_stock}</TableCell>
      <TableCell>{p.minimum_stock}</TableCell>
      <TableCell>{p.mfd || '-'}</TableCell>
      <TableCell>{p.exp || '-'}</TableCell>
      <TableCell>{p.status}</TableCell>
      <TableCell align="center">
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
          <Tooltip title="Edit Product">
            <IconButton size="small" color="primary" onClick={() => onEdit(p)}>
              <MdEdit size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Adjust Stock">
            <IconButton size="small" color="secondary" onClick={() => onAdjust(p)}>
              <MdInventory size={18} />
            </IconButton>
          </Tooltip>
        </Box>
      </TableCell>
    </TableRow>
  );
});

// The product list. products: the rows to show; selected: a Set of selected ids.
function ProductTable({ products, selected, onToggle, onToggleAll, onEdit, onAdjust }) {
  const selectedHere = products.reduce((n, p) => n + (selected.has(p.id) ? 1 : 0), 0);
  return (
    <Paper sx={{ p: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                checked={products.length > 0 && selectedHere === products.length}
                indeterminate={selectedHere > 0 && selectedHere < products.length}
                onChange={(e) => onToggleAll(e.target.checked)}
                inputProps={{ 'aria-label': 'Select all products' }}
              />
            </TableCell>
            <TableCell>Product ID</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Unit</TableCell>
            <TableCell>Cost</TableCell>
            <TableCell>Price</TableCell>
            <TableCell>Stock</TableCell>
            <TableCell>Min Stock</TableCell>
            <TableCell>MFD</TableCell>
            <TableCell>EXP</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              selected={selected.has(p.id)}
              onToggle={onToggle}
              onEdit={onEdit}
              onAdjust={onAdjust}
            />
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

export default memo(ProductTable);
