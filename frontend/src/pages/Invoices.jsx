import { useEffect, useState } from 'react';
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
  IconButton,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Autocomplete,
  InputAdornment,
  Grid,
  Pagination,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Visibility,
  Edit,
  Delete,
  Search,
  Download,
  FilterList,
  Clear,
  CalendarToday,
  Print,
  Add,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useConfirmDialog } from '../utils/confirmDialog';
import { formatCurrency, formatDate } from '../utils/numberFormat';
import { useAuthStore } from '../store/authStore';
import { generateInvoiceHTML } from '../utils/print';

function Invoices() {
  const user = useAuthStore((s) => s.user);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    paymentStatus: 'ALL',
    customerId: '',
    search: '',
  });
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [products, setProducts] = useState([]);
  const [editItems, setEditItems] = useState([]);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editAdditionalAmount, setEditAdditionalAmount] = useState(0);
  const [editCustomer, setEditCustomer] = useState(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    loadCustomers();
    loadInvoices();
  }, [page, filters]);

  const loadCustomers = async () => {
    try {
      const data = await api.listCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params = {
        limit,
        offset: (page - 1) * limit,
      };

      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
        params.paymentStatus = filters.paymentStatus;
      }
      if (filters.customerId) params.customerId = filters.customerId;
      if (filters.search) params.search = filters.search;

      const data = await api.listInvoices(params);
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleViewInvoice = async (invoice) => {
    try {
      const data = await api.getInvoice(invoice.id);
      setInvoiceDetails(data);
      setSelectedInvoice(invoice);
      setViewDialogOpen(true);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoice details');
    }
  };

  const handleDeleteInvoice = (invoice) => {
    confirm(
      `Delete invoice ${invoice.invoice_number}? This action cannot be undone and will restore product stock.`,
      async () => {
        try {
          await api.deleteInvoice(invoice.id);
          toast.success('Invoice deleted successfully');
          loadInvoices();
        } catch (err) {
          toast.error(err.message || 'Failed to delete invoice');
        }
      }
    );
  };

  const handleEditInvoice = async (invoice) => {
    try {
      const data = await api.getInvoice(invoice.id);
      setInvoiceDetails(data);
      setEditDiscount(data.invoice.discount || 0);
      setEditAdditionalAmount(data.invoice.additional_amount || 0);
      setEditItems(
        data.items.map((item) => ({
          productId: item.product_id,
          product: { id: item.product_id, name: item.product_name },
          quantity: item.quantity,
          unitPrice: item.unit_price,
          discount: item.discount || 0,
          discountType: item.discount_type || 'amount',
          lineTotal: item.line_total,
        }))
      );

      const productsData = await api.listProducts();
      setProducts(productsData);

      if (data.invoice.customer_id) {
        setEditCustomer({ id: data.invoice.customer_id, name: data.invoice.customer_name });
      } else {
        setEditCustomer(null);
      }

      setEditDialogOpen(true);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoice for editing');
    }
  };


  const handlePrintInvoice = async (invoice) => {
    try {
      // Get printer settings
      const printerSettings = await api.getPrinterSettings();
      if (!printerSettings.name) {
        toast.error('Please configure a printer in Settings → Printer');
        return;
      }

      // Get full invoice details
      const fullInvoice = await api.getInvoice(invoice.id);

      // Get shop name and logo
      let shopName = 'Shop Operating Platform';
      let logoUrl = null;
      let receiptSettings = {};
      try {
        const shopSetting = await api.getSetting('shop.name');
        shopName = shopSetting?.value || 'Shop Operating Platform';

        // Get logo URL if printLogo is enabled
        if (printerSettings.printLogo) {
          const logoSetting = await api.getSetting('shop.logo_path');
          if (logoSetting?.value) {
            // Logo is served at /api/settings/logo endpoint
            // Use API base URL to ensure it's accessible from print window
            const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
            logoUrl = API_BASE_URL.replace('/api', '') + '/api/settings/logo';
          }
        }

        // Get receipt customization settings
        receiptSettings = await api.getReceiptSettings();
      } catch (err) {
        // Use default
      }

      // Generate invoice HTML
      const html = generateInvoiceHTML(fullInvoice, {
        shopName,
        paperSize: printerSettings.paperSize || '80',
        printLogo: printerSettings.printLogo || false,
        logoUrl,
        receiptSettings,
      });

      // Print via Electron
      if (printerSettings.useDirect) {
        await api.printReceiptDirect({
          type: 'invoice',
          printerName: printerSettings.name,
          paperSize: printerSettings.paperSize || '80',
          shopName,
          invoice: fullInvoice,
          receiptSettings,
          printLogo: printerSettings.printLogo || false,
          usbDeviceId: printerSettings.usbDeviceId || null,
        });
      } else {
        await api.printReceipt({
          html,
          printerName: printerSettings.name,
          silent: printerSettings.silentPrint !== false,
          paperSize: printerSettings.paperSize || '80',
        });
      }

      toast.success('Invoice sent to printer');
    } catch (err) {
      console.error('Print failed:', err);
      toast.error(err.message || 'Failed to print invoice');
    }
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      paymentStatus: 'ALL',
      customerId: '',
      search: '',
    });
    setSelectedCustomer(null);
    setPage(1);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'PARTIAL':
        return 'warning';
      case 'CREDIT':
        return 'error';
      default:
        return 'default';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Invoice Management
        </Typography>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        const input = document.getElementById('start-date-input');
                        if (input) {
                          input.focus();
                          input.showPicker?.();
                        }
                      }}
                      sx={{ color: 'text.secondary' }}
                    >
                      <CalendarToday fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputProps={{
                id: 'start-date-input',
              }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        const input = document.getElementById('end-date-input');
                        if (input) {
                          input.focus();
                          input.showPicker?.();
                        }
                      }}
                      sx={{ color: 'text.secondary' }}
                    >
                      <CalendarToday fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              inputProps={{
                id: 'end-date-input',
              }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Payment Status</InputLabel>
              <Select
                value={filters.paymentStatus}
                label="Payment Status"
                onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
              >
                <MenuItem value="ALL">All</MenuItem>
                <MenuItem value="PAID">Paid</MenuItem>
                <MenuItem value="PARTIAL">Partial</MenuItem>
                <MenuItem value="CREDIT">Credit</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Autocomplete
              options={customers}
              getOptionLabel={(option) => option.name || ''}
              value={selectedCustomer}
              onChange={(e, newValue) => {
                setSelectedCustomer(newValue);
                setFilters({ ...filters, customerId: newValue?.id || '' });
              }}
              renderInput={(params) => (
                <TextField {...params} label="Customer" size="small" />
              )}
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Search"
              placeholder="Invoice number or customer name"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Clear />}
              onClick={handleClearFilters}
              size="small"
            >
              Clear
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Invoices Table */}
      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Invoice #</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Profit</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography>Loading...</Typography>
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary">No invoices found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {invoice.invoice_number}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(invoice.date_time)}</TableCell>
                  <TableCell>{invoice.customer_name || 'Walk-in'}</TableCell>
                  <TableCell align="right">{formatCurrency(invoice.total_amount)}</TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        color: (invoice.profit || 0) >= 0 ? 'success.main' : 'error.main',
                      }}
                    >
                      {formatCurrency(invoice.profit || 0)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={invoice.payment_status}
                      color={getStatusColor(invoice.payment_status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View">
                      <IconButton
                        size="small"
                        onClick={() => handleViewInvoice(invoice)}
                        color="primary"
                      >
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleEditInvoice(invoice)}
                        color="primary"
                      >
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CASHIER') && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteInvoice(invoice)}
                          color="error"
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(e, value) => setPage(value)}
              color="primary"
            />
          </Box>
        )}

        {/* Summary */}
        {invoices.length > 0 && (
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Showing {invoices.length} of {total} invoices
            </Typography>
          </Box>
        )}
      </Paper>

      {/* View Invoice Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Invoice Details - {selectedInvoice?.invoice_number}
        </DialogTitle>
        <DialogContent>
          {invoiceDetails && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Date
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(invoiceDetails.invoice.date_time)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Customer
                  </Typography>
                  <Typography variant="body1">
                    {invoiceDetails.invoice.customer_name || 'Walk-in'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Payment Status
                  </Typography>
                  <Chip
                    label={invoiceDetails.invoice.payment_status}
                    color={getStatusColor(invoiceDetails.invoice.payment_status)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Total Amount
                  </Typography>
                  <Typography variant="h6">
                    {formatCurrency(invoiceDetails.invoice.total_amount)}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Items
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Discount</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoiceDetails.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unit_price)}</TableCell>
                      <TableCell align="right">
                        {item.discount > 0 ? (
                          <Typography variant="body2" color="error">
                            -{item.discount_type === 'percentage' ? `${item.discount}%` : formatCurrency(item.discount)}
                          </Typography>
                        ) : '-'}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(item.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {(invoiceDetails.invoice.discount > 0 || (invoiceDetails.invoice.additional_amount && invoiceDetails.invoice.additional_amount > 0)) && (
                <Box sx={{ mt: 2, textAlign: 'right' }}>
                  {invoiceDetails.invoice.discount > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Discount: {formatCurrency(invoiceDetails.invoice.discount)}
                    </Typography>
                  )}
                  {invoiceDetails.invoice.additional_amount && invoiceDetails.invoice.additional_amount > 0 && (
                    <Typography variant="body2" color="success.main">
                      Additional Amount: {formatCurrency(invoiceDetails.invoice.additional_amount)}
                    </Typography>
                  )}
                </Box>
              )}

              {invoiceDetails.payments && invoiceDetails.payments.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Payments
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoiceDetails.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{payment.payment_type}</TableCell>
                          <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{formatDate(payment.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CASHIER') && selectedInvoice && (
              <Button
                color="error"
                startIcon={<Delete />}
                onClick={() => {
                  handleDeleteInvoice(selectedInvoice);
                  setViewDialogOpen(false);
                }}
              >
                Delete
              </Button>
            )}
          </Box>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          {selectedInvoice && (
            <Button
              variant="contained"
              startIcon={<Print />}
              onClick={() => handlePrintInvoice(selectedInvoice)}
            >
              Print
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit Invoice - {invoiceDetails?.invoice?.invoice_number}
        </DialogTitle>
        <DialogContent>
          {invoiceDetails && (
            <Box sx={{ mt: 1 }}>
              <Autocomplete
                options={customers}
                getOptionLabel={(option) => option?.name || ''}
                value={editCustomer}
                onChange={(_, newValue) => setEditCustomer(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Customer" size="small" fullWidth />
                )}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Invoice Items
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right" sx={{ width: 100 }}>Quantity</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Unit Price</TableCell>
                    <TableCell align="right" sx={{ width: 150 }}>Discount</TableCell>
                    <TableCell align="right" sx={{ width: 100 }}>Total</TableCell>
                    <TableCell align="center" sx={{ width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {editItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Autocomplete
                          options={products}
                          getOptionLabel={(option) => option?.name || ''}
                          value={item.product}
                          onChange={(_, newValue) => {
                            const newItems = [...editItems];
                            newItems[index] = {
                              ...newItems[index],
                              productId: newValue?.id || '',
                              product: newValue,
                              unitPrice: newValue?.selling_price || 0,
                              lineTotal: (newValue?.selling_price || 0) * (newItems[index].quantity || 1)
                            };
                            setEditItems(newItems);
                          }}
                          renderInput={(params) => <TextField {...params} size="small" />}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newItems = [...editItems];
                            newItems[index].quantity = val;

                            // Recalculate line total
                            const subtotal = (newItems[index].unitPrice || 0) * val;
                            let discountAmt = 0;
                            if (newItems[index].discountType === 'percentage') {
                              discountAmt = (subtotal * (newItems[index].discount || 0)) / 100;
                            } else {
                              discountAmt = newItems[index].discount || 0;
                            }
                            newItems[index].lineTotal = subtotal - discountAmt;

                            setEditItems(newItems);
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const newItems = [...editItems];
                            newItems[index].unitPrice = val;

                            // Recalculate line total
                            const subtotal = val * (newItems[index].quantity || 0);
                            let discountAmt = 0;
                            if (newItems[index].discountType === 'percentage') {
                              discountAmt = (subtotal * (newItems[index].discount || 0)) / 100;
                            } else {
                              discountAmt = newItems[index].discount || 0;
                            }
                            newItems[index].lineTotal = subtotal - discountAmt;

                            setEditItems(newItems);
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <TextField
                            type="number"
                            size="small"
                            value={item.discount}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const newItems = [...editItems];
                              newItems[index].discount = val;

                              // Recalculate line total
                              const subtotal = (newItems[index].unitPrice || 0) * (newItems[index].quantity || 0);
                              let discountAmt = 0;
                              if (newItems[index].discountType === 'percentage') {
                                discountAmt = (subtotal * val) / 100;
                              } else {
                                discountAmt = val;
                              }
                              newItems[index].lineTotal = subtotal - discountAmt;

                              setEditItems(newItems);
                            }}
                          />
                          <Select
                            size="small"
                            value={item.discountType || 'amount'}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newItems = [...editItems];
                              newItems[index].discountType = val;

                              // Recalculate line total
                              const subtotal = (newItems[index].unitPrice || 0) * (newItems[index].quantity || 0);
                              let discountAmt = 0;
                              if (val === 'percentage') {
                                discountAmt = (subtotal * (newItems[index].discount || 0)) / 100;
                              } else {
                                discountAmt = newItems[index].discount || 0;
                              }
                              newItems[index].lineTotal = subtotal - discountAmt;

                              setEditItems(newItems);
                            }}
                          >
                            <MenuItem value="amount">$</MenuItem>
                            <MenuItem value="percentage">%</MenuItem>
                          </Select>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(item.lineTotal || 0)}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                startIcon={<Add />}
                size="small"
                onClick={() => setEditItems([...editItems, { productId: '', product: null, quantity: 1, unitPrice: 0, lineTotal: 0 }])}
                sx={{ mt: 1 }}
              >
                Add Item
              </Button>

              <Divider sx={{ my: 3 }} />

              <Grid container spacing={2} justifyContent="flex-end">
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Discount"
                    type="number"
                    size="small"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Number(e.target.value))}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Additional Amount"
                    type="number"
                    size="small"
                    value={editAdditionalAmount}
                    onChange={(e) => setEditAdditionalAmount(Number(e.target.value))}
                  />

                  <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Subtotal:</Typography>
                      <Typography variant="body2">
                        {formatCurrency(editItems.reduce((acc, item) => acc + (item.lineTotal || 0), 0))}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Discount:</Typography>
                      <Typography variant="body2" color="error.main">-{formatCurrency(editDiscount)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Additional Amount:</Typography>
                      <Typography variant="body2" color="success.main">+{formatCurrency(editAdditionalAmount)}</Typography>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Total:</Typography>
                      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }}>
                        {formatCurrency(
                          editItems.reduce((acc, item) => acc + (item.lineTotal || 0), 0) - editDiscount + editAdditionalAmount
                        )}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CASHIER') && invoiceDetails && (
              <Button
                color="error"
                startIcon={<Delete />}
                onClick={() => {
                  handleDeleteInvoice(invoiceDetails.invoice);
                  setEditDialogOpen(false);
                }}
              >
                Delete Invoice
              </Button>
            )}
          </Box>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={async () => {
              if (editItems.length === 0) {
                toast.error('At least one item is required');
                return;
              }
              if (editItems.some(i => !i.productId)) {
                toast.error('All items must have a product selected');
                return;
              }
              try {
                await api.updateInvoice(invoiceDetails.invoice.id, {
                  items: editItems.map(i => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    discount: i.discount || 0,
                    discountType: i.discountType || 'amount'
                  })),
                  discount: editDiscount,
                  additionalAmount: editAdditionalAmount,
                  customerId: editCustomer?.id || null
                });
                toast.success('Invoice updated successfully');
                setEditDialogOpen(false);
                loadInvoices();
              } catch (err) {
                toast.error(err.message || 'Failed to update invoice');
              }
            }}
          >
            Update Invoice
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog />
    </Box>
  );
}

export default Invoices;

