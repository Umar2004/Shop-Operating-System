import { memo, useMemo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { MdEdit, MdInventory } from 'react-icons/md';

// Rows per page; the list is fetched whole and paged here (no API change)
export const PRODUCTS_PAGE_SIZE = 50;

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
          {/* A plain title, not a MUI Tooltip: two Tooltip instances per row were ~1,900 on the full list */}
          <IconButton size="small" color="primary" title="Edit Product" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}>
            <MdEdit size={18} />
          </IconButton>
          <IconButton size="small" color="secondary" title="Adjust Stock" aria-label={`Adjust stock of ${p.name}`} onClick={() => onAdjust(p)}>
            <MdInventory size={18} />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  );
});

// The product list, one page at a time. products: every product the current search returned; selected: a Set of
// selected ids. The header checkbox selects this page only; "Select all N matching" (shown once the page is fully
// selected) extends it to every product the search returned.
function ProductTable({ products, selected, page, onPageChange, onToggle, onTogglePage, onSelectAll, onClearSelection, onEdit, onAdjust }) {
  const pageCount = Math.max(1, Math.ceil(products.length / PRODUCTS_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1); // a reload with fewer products may leave the page past the end
  const rows = useMemo(
    () => products.slice(current * PRODUCTS_PAGE_SIZE, (current + 1) * PRODUCTS_PAGE_SIZE),
    [products, current]
  );
  const selectedHere = rows.reduce((n, p) => n + (selected.has(p.id) ? 1 : 0), 0);
  const pageSelected = rows.length > 0 && selectedHere === rows.length;
  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  return (
    <Paper sx={{ p: 2 }}>
      {pageSelected && products.length > rows.length && (
        <Box
          role="status"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}
        >
          {allSelected ? (
            <>
              <Typography variant="body2">All {products.length} matching products are selected.</Typography>
              <Button size="small" onClick={onClearSelection}>Clear selection</Button>
            </>
          ) : (
            <>
              <Typography variant="body2">All {rows.length} products on this page are selected.</Typography>
              <Button size="small" onClick={() => onSelectAll(products.map((p) => p.id))}>
                Select all {products.length} matching products
              </Button>
            </>
          )}
        </Box>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                checked={pageSelected}
                indeterminate={selectedHere > 0 && selectedHere < rows.length}
                onChange={(e) => onTogglePage(rows.map((p) => p.id), e.target.checked)}
                inputProps={{ 'aria-label': 'Select all products on this page' }}
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
          {rows.map((p) => (
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
      <TablePagination
        component="div"
        count={products.length}
        page={current}
        onPageChange={(_, next) => onPageChange(next)}
        rowsPerPage={PRODUCTS_PAGE_SIZE}
        rowsPerPageOptions={[]}
        showFirstButton
        showLastButton
      />
    </Paper>
  );
}

export default memo(ProductTable);
