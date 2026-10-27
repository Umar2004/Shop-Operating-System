import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Grid,
  Checkbox,
  Toolbar,
  LinearProgress,
  Tooltip,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import ProductFormDialog from '../components/products/ProductFormDialog';
import ProductTable from '../components/products/ProductTable';
import CategoryFilter from '../components/products/CategoryFilter';
import StockAdjustDialog from '../components/products/StockAdjustDialog';
import { useConfirmDialog } from '../utils/confirmDialog';

function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  // Add/Edit dialog: which product (null = add) and a counter that gives each opening a fresh form
  const [productDialog, setProductDialog] = useState({ open: false, product: null, seq: 0 });
  // Adjust Stock dialog: which product and a counter that gives each opening a fresh form
  const [stockDialog, setStockDialog] = useState({ open: false, product: null, seq: 0 });
  const [categories, setCategories] = useState([]);
  const [alerts, setAlerts] = useState({
    lowStock: [],
    expired: [],
    expiringSoon: [],
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(0);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkJobId, setBulkJobId] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const progressIntervalRef = useRef(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = (searchTerm = search) => {
    api
      .listProducts(searchTerm)
      .then((data) => setProducts(data))
      .catch((err) => toast.error(err.message));
  };

  useEffect(() => {
    // Initial load
    load();
    api
      .listProductCategories()
      .then((data) => setCategories(data))
      .catch(() => { });
    api
      .getProductAlerts()
      .then((data) => setAlerts(data))
      .catch(() => { });

    // Cleanup progress polling on unmount
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Real-time search with debouncing
  useEffect(() => {
    setPage(0); // new search: back to the first page of results
    const timeoutId = setTimeout(() => {
      load(search);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [search]);

  // Stable callbacks and a Set of selected ids, so the memoized table rows re-render only when their own
  // product or selection changes
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleOne = useCallback((id, checked) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }, []);
  // Header checkbox: select or clear this page's products, keeping any selection elsewhere
  const togglePage = useCallback((ids, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return [...next];
    });
  }, []);
  const selectAll = useCallback((ids) => setSelectedIds(ids), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const openEdit = useCallback((p) => {
    setProductDialog((d) => ({ open: true, product: p, seq: d.seq + 1 }));
  }, []);
  const openAdjust = useCallback((p) => {
    setStockDialog((d) => ({ open: true, product: p, seq: d.seq + 1 }));
  }, []);
  // After a save in either dialog: reload the list (same search) and the stock alerts
  const reloadAfterChange = () => {
    load();
    api
      .getProductAlerts()
      .then((data) => setAlerts(data))
      .catch(() => { });
  };

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const getRemainingDays = (exp) => {
    if (!exp) return '-';
    const d = new Date(exp);
    if (Number.isNaN(d.getTime())) return '-';
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = dStart - todayStart;
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return `${days} day${Math.abs(days) === 1 ? '' : 's'}`;
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Products
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Toolbar sx={{ p: 0, mb: 1, gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="small"
              />
              <CategoryFilter categories={categories} search={search} onSelect={setSearch} />
            </Box>
          </Box>
          <Button variant="outlined" onClick={() => load()}>
            Search
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={async () => {
              try {
                const blob = await api.downloadProductTemplate();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'products_template.xlsx';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success('Template downloaded successfully');
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            Download Template
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={async () => {
              try {
                setBulkUploading(true);
                const blob = await api.downloadAllProducts('ACTIVE');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
                a.download = `products_export_${timestamp}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success('All products downloaded successfully');
              } catch (err) {
                toast.error(err.message);
              } finally {
                setBulkUploading(false);
              }
            }}
            disabled={bulkUploading}
          >
            Download All Products
          </Button>
          <Button variant="contained" color="success" component="label" disabled={bulkUploading}>
            Bulk Upload
            <input
              type="file"
              hidden
              accept=".xlsx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('autoCreateCategories', String(autoCreateCategories));
                try {
                  setBulkUploading(true);
                  const res = await api.bulkUploadValidate(formData);
                  setBulkFile(file);
                  setBulkPreview(res);
                  if (res.summary.errors > 0) {
                    toast.warning(`Validation complete: ${res.summary.valid} valid, ${res.summary.errors} errors out of ${res.summary.totalRows} rows`);
                  } else {
                    toast.success(`Validation complete: ${res.summary.valid} valid rows`);
                  }
                } catch (err) {
                  toast.error(err.message);
                } finally {
                  e.target.value = '';
                  setBulkUploading(false);
                }
              }}
            />
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setProductDialog((d) => ({ open: true, product: null, seq: d.seq + 1 }))}
          >
            Add Product
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={selectedIds.length === 0}
            onClick={async () => {
              confirm(
                `Delete ${selectedIds.length} selected product(s)?`,
                async () => {
                  try {
                    await api.bulkDeleteProducts(selectedIds);
                    setSelectedIds([]);
                    load();
                    api
                      .getProductAlerts()
                      .then((data) => setAlerts(data))
                      .catch(() => { });
                    toast.success('Selected products deleted');
                  } catch (err) {
                    toast.error(err.message);
                  }
                }
              );
            }}
          >
            Delete Selected
          </Button>
        </Toolbar>
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#FFEBEE',
              borderLeft: '6px solid #D32F2F',
              cursor: 'pointer',
              outline: selectedAlert === 'lowStock' ? '2px solid #D32F2F' : 'none',
            }}
            onClick={() =>
              setSelectedAlert((prev) => (prev === 'lowStock' ? null : 'lowStock'))
            }
          >
            <Typography variant="subtitle2" color="text.secondary">
              Low Stock Products
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {alerts.lowStock.length} item(s)
            </Typography>
            {alerts.lowStock.slice(0, 5).map((p) => (
              <Typography key={p.id} variant="caption" display="block">
                {p.name} ({p.current_stock}/{p.minimum_stock})
              </Typography>
            ))}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#FFF3E0',
              borderLeft: '6px solid #ED6C02',
              cursor: 'pointer',
              outline: selectedAlert === 'expired' ? '2px solid #ED6C02' : 'none',
            }}
            onClick={() =>
              setSelectedAlert((prev) => (prev === 'expired' ? null : 'expired'))
            }
          >
            <Typography variant="subtitle2" color="text.secondary">
              Expired Products
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {alerts.expired.length} item(s)
            </Typography>
            {alerts.expired.slice(0, 5).map((p) => (
              <Typography key={p.id} variant="caption" display="block">
                {p.name} (EXP {p.exp})
              </Typography>
            ))}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#E3F2FD',
              borderLeft: '6px solid #1565C0',
              cursor: 'pointer',
              outline: selectedAlert === 'expiringSoon' ? '2px solid #1565C0' : 'none',
            }}
            onClick={() =>
              setSelectedAlert((prev) =>
                prev === 'expiringSoon' ? null : 'expiringSoon'
              )
            }
          >
            <Typography variant="subtitle2" color="text.secondary">
              Expiring Soon (30 days)
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {alerts.expiringSoon.length} item(s)
            </Typography>
            {alerts.expiringSoon.slice(0, 5).map((p) => (
              <Typography key={p.id} variant="caption" display="block">
                {p.name} (EXP {p.exp})
              </Typography>
            ))}
          </Paper>
        </Grid>
      </Grid>
      {bulkPreview && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Bulk Upload Validation</Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoCreateCategories}
                  onChange={(e) => setAutoCreateCategories(e.target.checked)}
                  disabled={bulkUploading || bulkJobId !== null}
                />
              }
              label="Auto-create missing categories"
            />
          </Box>

          {/* Progress Bar */}
          {bulkJobId && bulkProgress && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">
                  Processing: {bulkProgress.processed}/{bulkProgress.total} rows
                </Typography>
                <Typography variant="body2">
                  {bulkProgress.status === 'processing' && (
                    <CircularProgress size={16} sx={{ ml: 1 }} />
                  )}
                  {bulkProgress.status === 'completed' && '✓ Complete'}
                  {bulkProgress.status === 'failed' && '✗ Failed'}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={
                  bulkProgress.total > 0
                    ? (bulkProgress.processed / bulkProgress.total) * 100
                    : 0
                }
                sx={{ height: 8, borderRadius: 1 }}
              />
              {bulkProgress.status === 'completed' && (
                <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
                  Imported: {bulkProgress.inserted} | Failed: {bulkProgress.failed}
                </Typography>
              )}
            </Box>
          )}

          {/* Summary */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Total: {bulkPreview.summary.totalRows} rows |{' '}
                <span style={{ color: '#4caf50' }}>Valid: {bulkPreview.summary.valid}</span> |{' '}
                <span style={{ color: '#f44336' }}>Errors: {bulkPreview.summary.errors}</span>
                {bulkPreview.summary.needsConfirmation > 0 && (
                  <>
                    {' '}|{' '}
                    <span style={{ color: '#ed6c02' }}>
                      Price not above cost (needs confirmation): {bulkPreview.summary.needsConfirmation}
                    </span>
                  </>
                )}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setBulkPreview(null);
                  setBulkFile(null);
                  setBulkJobId(null);
                  setBulkProgress(null);
                  if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                    progressIntervalRef.current = null;
                  }
                }}
                disabled={bulkJobId !== null && bulkProgress?.status === 'processing'}
              >
                Discard
              </Button>
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={
                  !bulkFile ||
                  !bulkPreview ||
                  bulkPreview.summary.valid === 0 ||
                  bulkUploading ||
                  (bulkJobId !== null && bulkProgress?.status === 'processing')
                }
                onClick={() => {
                  if (!bulkFile) {
                    toast.error('No file to import. Please upload again.');
                    return;
                  }
                  const runImport = async (confirmLowMargin) => {
                    const formData = new FormData();
                    formData.append('file', bulkFile);
                    formData.append('autoCreateCategories', String(autoCreateCategories));
                    formData.append('confirmLowMargin', String(confirmLowMargin));
                    try {
                      setBulkUploading(true);
                      const res = await api.bulkUploadImport(formData);
                      setBulkJobId(res.jobId);

                      // Start polling for progress
                      const pollProgress = async () => {
                        try {
                          const progress = await api.getBulkUploadProgress(res.jobId);
                          setBulkProgress(progress);
                          if (progress.status === 'completed' || progress.status === 'failed') {
                            if (progressIntervalRef.current) {
                              clearInterval(progressIntervalRef.current);
                              progressIntervalRef.current = null;
                            }
                            setBulkUploading(false);
                            if (progress.status === 'completed') {
                              if (progress.failed > 0) {
                                toast.warning(`Import complete: ${progress.inserted} imported, ${progress.failed} failed`);
                              } else {
                                toast.success(`Import complete: ${progress.inserted} products imported successfully`);
                              }
                              // Keep preview if there are errors to show
                              if (progress.failed === 0) {
                                setBulkPreview(null);
                                setBulkFile(null);
                              }
                              setBulkJobId(null);
                              setTimeout(() => {
                                setBulkProgress(null);
                              }, 10000); // Keep longer if there are errors
                              load();
                              api
                                .getProductAlerts()
                                .then((data) => setAlerts(data))
                                .catch(() => { });
                            } else {
                              toast.error(`Import failed: ${progress.error || 'Unknown error'}`);
                            }
                          }
                        } catch (err) {
                        }
                      };

                      // Poll every 500ms
                      progressIntervalRef.current = setInterval(pollProgress, 500);
                      pollProgress(); // Initial poll
                    } catch (err) {
                      toast.error(err.message);
                      setBulkUploading(false);
                    }
                  };

                  // Rows priced at or below cost are imported only after an explicit confirmation
                  const lowMarginRows = bulkPreview.rows.filter((r) => r.needsConfirmation).map((r) => r.index);
                  if (lowMarginRows.length > 0) {
                    confirm(
                      `${lowMarginRows.length} row(s) have a selling price that is not greater than the cost price ` +
                        `(rows ${lowMarginRows.join(', ')}). They would sell at no profit or at a loss. Import them anyway?`,
                      () => runImport(true)
                    );
                    return;
                  }
                  runImport(false);
                }}
              >
                {bulkJobId && bulkProgress?.status === 'processing' ? 'Importing...' : 'Confirm Import'}
              </Button>
            </Box>
          </Box>

          {/* Validation Grid */}
          <Box sx={{ maxHeight: 'clamp(20rem, 50vh, 31.25rem)', overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Cost Price</TableCell>
                  <TableCell>Selling Price</TableCell>
                  <TableCell>Opening Stock</TableCell>
                  <TableCell>Min Stock</TableCell>
                  <TableCell>MFD</TableCell>
                  <TableCell>EXP</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bulkPreview.rows.map((row) => {
                  const isValid = row.status === 'valid';
                  // Amber: importable, but only after confirming a price not above cost
                  const bg = !isValid ? '#FFEBEE' : row.needsConfirmation ? '#FFF3E0' : '#E8F5E9';
                  const hover = !isValid ? '#FFCDD2' : row.needsConfirmation ? '#FFE0B2' : '#C8E6C9';
                  return (
                    <TableRow
                      key={row.index}
                      sx={{
                        bgcolor: bg,
                        '&:hover': { bgcolor: hover },
                      }}
                    >
                      <TableCell>{row.index}</TableCell>
                      {['Product Name', 'Category', 'Unit', 'Cost Price', 'Selling Price', 'Opening Stock', 'Minimum Stock', 'MFD', 'EXP', 'Status'].map((field) => {
                        const fieldKey = field === 'Minimum Stock' ? 'Minimum Stock' : field;
                        const value = row.data[fieldKey] || '';
                        const error = row.errors?.[fieldKey];
                        if (error) {
                          return (
                            <Tooltip key={field} title={error} arrow placement="top">
                              <TableCell
                                sx={{
                                  color: '#d32f2f',
                                  fontWeight: 600,
                                  cursor: 'help',
                                }}
                              >
                                {value}
                              </TableCell>
                            </Tooltip>
                          );
                        }
                        return (
                          <TableCell key={field}>{value}</TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          {/* Warnings Summary */}
          {bulkPreview.rows.some((r) => r.warnings && r.warnings.length > 0) && (
            <Box sx={{ mt: 2, p: 1, bgcolor: '#FFF8E1', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Warnings:
              </Typography>
              {bulkPreview.rows
                .filter((r) => r.warnings && r.warnings.length > 0)
                .map((r, idx) => (
                  <Typography key={idx} variant="caption" display="block">
                    Row {r.index}: {r.warnings.join('; ')}
                  </Typography>
                ))}
            </Box>
          )}

          {/* Import Errors Summary (after import completes) */}
          {bulkProgress && bulkProgress.status === 'completed' && bulkProgress.errors && bulkProgress.errors.length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#FFEBEE', borderRadius: 1, border: '1px solid #f44336' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#d32f2f' }}>
                Import Errors ({bulkProgress.errors.length} product(s) failed):
              </Typography>
              <Box sx={{ maxHeight: 'clamp(12rem, 30vh, 18.75rem)', overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Row</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Errors</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkProgress.errors.map((error, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{error.row}</TableCell>
                        <TableCell>{error.productName}</TableCell>
                        <TableCell>
                          <Box>
                            {error.errors.map((err, errIdx) => (
                              <Typography
                                key={errIdx}
                                variant="caption"
                                display="block"
                                sx={{ color: '#d32f2f', mb: 0.5 }}
                              >
                                • {err}
                              </Typography>
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          )}
        </Paper>
      )}
      {selectedAlert && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            {selectedAlert === 'lowStock' && 'Low Stock Products'}
            {selectedAlert === 'expired' && 'Expired Products'}
            {selectedAlert === 'expiringSoon' && 'Expiring Soon Products'}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">Stock</TableCell>
                <TableCell align="right">Min Stock</TableCell>
                <TableCell>EXP</TableCell>
                <TableCell align="right">Remaining Days to EXP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(alerts[selectedAlert] || []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.product_code || `PORD-${String(p.id).padStart(5, '0')}`}
                  </TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.category_name || '-'}</TableCell>
                  <TableCell>{p.unit}</TableCell>
                  <TableCell align="right">{p.current_stock}</TableCell>
                  <TableCell align="right">{p.minimum_stock}</TableCell>
                  <TableCell>{p.exp || '-'}</TableCell>
                  <TableCell align="right">{getRemainingDays(p.exp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <ProductTable
        products={products}
        selected={selected}
        page={page}
        onPageChange={setPage}
        onToggle={toggleOne}
        onTogglePage={togglePage}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onEdit={openEdit}
        onAdjust={openAdjust}
      />

      <ProductFormDialog
        key={productDialog.seq}
        open={productDialog.open}
        product={productDialog.product}
        categories={categories}
        onClose={() => setProductDialog((d) => ({ ...d, open: false }))}
        onSaved={reloadAfterChange}
      />

      <StockAdjustDialog
        key={`stock-${stockDialog.seq}`}
        open={stockDialog.open}
        product={stockDialog.product}
        onClose={() => setStockDialog((d) => ({ ...d, open: false }))}
        onSaved={reloadAfterChange}
      />
      <ConfirmDialog />
    </Box>
  );
}

export default Products;


