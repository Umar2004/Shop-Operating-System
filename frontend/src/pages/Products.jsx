import { useEffect, useState, useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  IconButton,
  Grid,
  Checkbox,
  Toolbar,
  LinearProgress,
  Tooltip,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { MdEdit, MdInventory } from 'react-icons/md';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { getInputStep } from '../utils/numberFormat';
import ProductFormDialog from '../components/products/ProductFormDialog';
import { useConfirmDialog } from '../utils/confirmDialog';

function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  // Add/Edit dialog: which product (null = add) and a counter that gives each opening a fresh form
  const [productDialog, setProductDialog] = useState({ open: false, product: null, seq: 0 });
  const [stockAdjustDialog, setStockAdjustDialog] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState(null);
  const [stockAdjustment, setStockAdjustment] = useState({ quantityChange: 0, reason: '', adjustmentType: 'add' }); // 'add' or 'reduce'
  const [categories, setCategories] = useState([]);
  const [alerts, setAlerts] = useState({
    lowStock: [],
    expired: [],
    expiringSoon: [],
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkJobId, setBulkJobId] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
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
    const timeoutId = setTimeout(() => {
      load(search);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [search]);

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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="small"
              />
              <Button
                size="small"
                variant="text"
                onClick={() => setShowCategories(!showCategories)}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {showCategories ? 'Hide Categories' : 'Show Categories'}
              </Button>
            </Box>
            {showCategories && categories.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="caption" sx={{ mr: 1 }}>
                  Categories:
                </Typography>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    size="small"
                    onClick={() => setSearch(c.name)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            )}
          </Box>
          <Button variant="outlined" onClick={load}>
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
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={
                    products.length > 0 && selectedIds.length === products.length
                  }
                  indeterminate={
                    selectedIds.length > 0 &&
                    selectedIds.length < products.length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(products.map((p) => p.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
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
              <TableRow key={p.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.includes(p.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => [...prev, p.id]);
                      } else {
                        setSelectedIds((prev) => prev.filter((id) => id !== p.id));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>{p.product_code || `PORD-${String(p.id).padStart(5, '0')}`}</TableCell>
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
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setProductDialog((d) => ({ open: true, product: p, seq: d.seq + 1 }))}
                      >
                        <MdEdit size={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Adjust Stock">
                      <IconButton
                        size="small"
                        color="secondary"
                        onClick={() => {
                          setStockAdjustProduct(p);
                          setStockAdjustment({ quantityChange: 0, reason: '', adjustmentType: 'add' });
                          setStockAdjustDialog(true);
                        }}
                      >
                        <MdInventory size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <ProductFormDialog
        key={productDialog.seq}
        open={productDialog.open}
        product={productDialog.product}
        categories={categories}
        onClose={() => setProductDialog((d) => ({ ...d, open: false }))}
        onSaved={() => {
          load();
          api
            .getProductAlerts()
            .then((data) => setAlerts(data))
            .catch(() => { });
        }}
      />

      {/* Stock Adjustment Dialog */}
      <Dialog
        open={stockAdjustDialog}
        onClose={() => {
          setStockAdjustDialog(false);
          setStockAdjustProduct(null);
          setStockAdjustment({ quantityChange: 0, reason: '', adjustmentType: 'add' });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Adjust Stock - {stockAdjustProduct?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current Stock: <strong>{stockAdjustProduct?.current_stock || 0}</strong>
            </Typography>
            {stockAdjustment.quantityChange > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {stockAdjustment.adjustmentType === 'add' ? (
                  <>
                    Adding: <strong style={{ color: '#2e7d32' }}>+{stockAdjustment.quantityChange}</strong>
                    <br />
                    New Stock: <strong style={{ color: '#2e7d32' }}>{stockAdjustProduct?.current_stock + stockAdjustment.quantityChange}</strong>
                  </>
                ) : (
                  <>
                    Reducing: <strong style={{ color: '#d32f2f' }}>-{stockAdjustment.quantityChange}</strong>
                    <br />
                    New Stock: <strong style={{ color: stockAdjustProduct?.current_stock - stockAdjustment.quantityChange >= 0 ? '#2e7d32' : '#d32f2f' }}>
                      {stockAdjustProduct?.current_stock - stockAdjustment.quantityChange}
                    </strong>
                    {stockAdjustProduct?.current_stock - stockAdjustment.quantityChange < 0 && (
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
              onClick={() => {
                setStockAdjustment({ ...stockAdjustment, adjustmentType: 'add', quantityChange: 0 });
              }}
            >
              Add Stock
            </Button>
            <Button
              variant={stockAdjustment.adjustmentType === 'reduce' ? 'contained' : 'outlined'}
              color="error"
              fullWidth
              onClick={() => {
                setStockAdjustment({ ...stockAdjustment, adjustmentType: 'reduce', quantityChange: 0 });
              }}
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
              setStockAdjustment({
                ...stockAdjustment,
                quantityChange: value >= 0 ? value : 0,
              });
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
            onChange={(e) =>
              setStockAdjustment({ ...stockAdjustment, reason: e.target.value })
            }
            placeholder={
              stockAdjustment.adjustmentType === 'add'
                ? 'e.g., Stock received, New purchase, Stock correction...'
                : 'e.g., Damaged items, Expired products, Stock correction, Theft...'
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setStockAdjustDialog(false);
              setStockAdjustProduct(null);
              setStockAdjustment({ quantityChange: 0, reason: '', adjustmentType: 'add' });
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={stockAdjustment.adjustmentType === 'add' ? 'success' : 'error'}
            disabled={stockAdjustment.quantityChange === 0 || (stockAdjustment.adjustmentType === 'reduce' && stockAdjustment.quantityChange > (stockAdjustProduct?.current_stock || 0))}
            onClick={async () => {
              try {
                const quantityChange = stockAdjustment.adjustmentType === 'add'
                  ? stockAdjustment.quantityChange
                  : -stockAdjustment.quantityChange;

                await api.adjustProductStock(
                  stockAdjustProduct.id,
                  quantityChange,
                  stockAdjustment.reason
                );
                setStockAdjustDialog(false);
                setStockAdjustProduct(null);
                setStockAdjustment({ quantityChange: 0, reason: '', adjustmentType: 'add' });
                toast.success(`Stock ${stockAdjustment.adjustmentType === 'add' ? 'added' : 'reduced'} successfully`);
                load();
                api
                  .getProductAlerts()
                  .then((data) => setAlerts(data))
                  .catch(() => { });
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            {stockAdjustment.adjustmentType === 'add' ? 'Add Stock' : 'Reduce Stock'}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog />
    </Box>
  );
}

export default Products;


