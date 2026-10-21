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
  Tabs,
  Tab,
  Chip,
  Autocomplete,
  InputAdornment,
} from '@mui/material';
import { Edit, Delete, Payment, Visibility, Add, Remove } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useConfirmDialog } from '../utils/confirmDialog';
import { getInputStep, getInputMin, formatNumber } from '../utils/numberFormat';
import { generateReceiptHTML } from '../utils/print';

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [openPayCreditDialog, setOpenPayCreditDialog] = useState(false);
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false);
  const [openViewInvoiceDialog, setOpenViewInvoiceDialog] = useState(false);
  const [openEditInvoiceDialog, setOpenEditInvoiceDialog] = useState(false);
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [openStatusDialog, setOpenStatusDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [selectedStatusInvoice, setSelectedStatusInvoice] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [editDiscount, setEditDiscount] = useState(0);
  const [editAdditionalAmount, setEditAdditionalAmount] = useState(0);
  const [editItems, setEditItems] = useState([]);
  const [editCustomer, setEditCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [customersForEdit, setCustomersForEdit] = useState([]);
  const [tabValue, setTabValue] = useState(0);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    creditLimit: 0,
    openingBalance: 0,
  });
  const [payCreditForm, setPayCreditForm] = useState({
    amount: 0,
    paymentType: 'CASH',
    invoiceId: '',
  });
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = (searchTerm = search) => {
    api
      .listCustomers(searchTerm)
      .then((data) => setCustomers(data))
      .catch((err) => toast.error(err.message));
  };

  const loadCustomerData = async (customerId) => {
    try {
      const [invoices, payments, allCustomers] = await Promise.all([
        api.getCustomerInvoices(customerId),
        api.getCustomerPayments(customerId),
        api.listCustomers(''), // Refresh customer list to get updated balance
      ]);
      setCustomerInvoices(invoices);
      setCustomerPayments(payments);
      // Update selected customer with fresh data only if it's the currently selected one
      const updatedCustomer = allCustomers.find((c) => c.id === customerId);
      if (updatedCustomer && selectedCustomer?.id === customerId) {
        setSelectedCustomer(updatedCustomer);
      }
      // Also update the customers list
      setCustomers(allCustomers);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Real-time search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      load(search);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerData(selectedCustomer.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Customers
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2 }}>
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ flexGrow: 1 }}
        />
        <Button variant="outlined" onClick={load}>
          Search
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setForm({
              id: null,
              name: '',
              phone: '',
              address: '',
              creditLimit: 0,
              openingBalance: 0,
            });
            setOpenDialog(true);
          }}
        >
          Add Customer
        </Button>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Credit Limit</TableCell>
              <TableCell>Past Credits (Opening)</TableCell>
              <TableCell>Balance</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {customers.map((c) => (
              <TableRow
                key={c.id}
                sx={{
                  cursor: 'pointer',
                  bgcolor: selectedCustomer?.id === c.id ? '#E3F2FD' : 'inherit',
                  '&:hover': { bgcolor: selectedCustomer?.id === c.id ? '#BBDEFB' : '#F5F5F5' },
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectedCustomer?.id !== c.id) {
                    setSelectedCustomer(c);
                  }
                }}
              >
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.phone || '-'}</TableCell>
                <TableCell>{c.credit_limit.toFixed(2)}</TableCell>
                <TableCell>{(c.opening_balance || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Chip
                    label={Math.max(0, c.current_balance || 0).toFixed(2)}
                    color={(c.current_balance || 0) > 0 ? 'error' : 'default'}
                    size="small"
                    sx={{
                      fontWeight: (c.current_balance || 0) !== 0 ? 600 : 400,
                    }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({
                        id: c.id,
                        name: c.name,
                        phone: c.phone || '',
                        address: c.address || '',
                        creditLimit: c.credit_limit,
                        openingBalance: c.opening_balance || 0,
                      });
                      setOpenDialog(true);
                    }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                   <IconButton
                    size="small"
                    color="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCustomer(c);
                      setOpenPayCreditDialog(true);
                      setPayCreditForm({
                        amount: 0,
                        paymentType: 'CASH',
                        invoiceId: '',
                      });
                    }}
                    disabled={(c.current_balance || 0) <= 0}
                  >
                    <Payment fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {selectedCustomer && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              {selectedCustomer.name} - Details
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerInvoices([]);
                setCustomerPayments([]);
              }}
            >
              Close
            </Button>
          </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  Credit Limit:
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {(selectedCustomer.credit_limit || 0).toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  Remaining Past Credit:
                </Typography>
                {(() => {
                  const totalUnpaidInvoices = customerInvoices.reduce((acc, inv) => 
                    acc + (inv.payment_status !== 'PAID' ? (inv.balance_amount || 0) : 0), 0);
                  const pastCredit = Math.max(0, (selectedCustomer.current_balance || 0) - totalUnpaidInvoices);
                  return (
                    <Typography variant="body2" fontWeight="bold" color={pastCredit > 0 ? 'warning.main' : 'inherit'}>
                      {pastCredit.toFixed(2)}
                    </Typography>
                  );
                })()}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  Total Balance Owed:
                </Typography>
                <Chip
                  label={Math.max(0, selectedCustomer.current_balance || 0).toFixed(2)}
                  color={(selectedCustomer.current_balance || 0) > 0 ? 'error' : 'default'}
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            </Box>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
            <Tab label="Invoices" />
            <Tab label="Payment History" />
          </Tabs>

          {tabValue === 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Invoices ({customerInvoices.length})
              </Typography>
              {customerInvoices.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No invoices found for this customer.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice #</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Total Amount</TableCell>
                      <TableCell>Discount</TableCell>
                      <TableCell>Paid</TableCell>
                      <TableCell>Balance</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customerInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.invoice_number}</TableCell>
                        <TableCell>
                          {new Date(inv.date_time).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{inv.total_amount.toFixed(2)}</TableCell>
                        <TableCell>{inv.discount.toFixed(2)}</TableCell>
                        <TableCell>{(inv.paid_amount || 0).toFixed(2)}</TableCell>
                        <TableCell sx={{ color: (inv.balance_amount || 0) > 0 ? 'error.main' : 'inherit', fontWeight: (inv.balance_amount || 0) > 0 ? 600 : 400 }}>
                          {(inv.balance_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={inv.payment_status}
                            color={
                              inv.payment_status === 'PAID'
                                ? 'success'
                                : inv.payment_status === 'PARTIAL'
                                  ? 'warning'
                                  : 'error'
                            }
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStatusInvoice(inv);
                              setNewStatus(inv.payment_status);
                              setOpenStatusDialog(true);
                            }}
                            sx={{ cursor: 'pointer' }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const details = await api.getInvoice(inv.id);
                                setInvoiceDetails(details);
                                setOpenViewInvoiceDialog(true);
                              } catch (err) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const details = await api.getInvoice(inv.id);
                                setInvoiceDetails(details);
                                setEditDiscount(details.invoice.discount || 0);
                                setEditAdditionalAmount(details.invoice.additional_amount || 0);
                                // Initialize edit items from invoice details
                                setEditItems(
                                  details.items.map((item) => ({
                                    productId: item.product_id,
                                    product: { id: item.product_id, name: item.product_name },
                                    quantity: item.quantity,
                                    unitPrice: item.unit_price,
                                    lineTotal: item.line_total,
                                  }))
                                );
                                // Load products and customers for autocomplete
                                const [productsData, customersData] = await Promise.all([
                                  api.listProducts(),
                                  api.listCustomers(),
                                ]);
                                setProducts(productsData);
                                setCustomersForEdit(customersData);
                                // Set customer if exists
                                if (details.invoice.customer_id) {
                                  const customer = customersData.find(
                                    (c) => c.id === details.invoice.customer_id
                                  );
                                  setEditCustomer(customer || null);
                                } else {
                                  setEditCustomer(null);
                                }
                                setOpenEditInvoiceDialog(true);
                              } catch (err) {
                                toast.error(err.message);
                              }
                            }}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirm(
                                `Delete invoice ${inv.invoice_number}? This will restore product stock.`,
                                async () => {
                                  try {
                                    await api.deleteInvoice(inv.id);
                                    toast.success('Invoice deleted');
                                    loadCustomerData(selectedCustomer.id);
                                    load();
                                  } catch (err) {
                                    toast.error(err.message);
                                  }
                                }
                              );
                            }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}

          {tabValue === 1 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Payment History ({customerPayments.length})
              </Typography>
              {customerPayments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No payments found for this customer.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Invoice #</TableCell>
                      <TableCell>Payment Type</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customerPayments.map((pay) => (
                      <TableRow key={pay.id}>
                        <TableCell>
                          {new Date(pay.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{pay.invoice_number || 'Past Credit'}</TableCell>
                        <TableCell>
                          <Chip label={pay.payment_type} size="small" />
                        </TableCell>
                        <TableCell>{pay.amount.toFixed(2)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              if (window.confirm(`Delete payment of ${pay.amount.toFixed(2)}? This will update customer balance.`)) {
                                (async () => {
                                  try {
                                    await api.deletePayment(pay.id);
                                    toast.success('Payment deleted');
                                    loadCustomerData(selectedCustomer.id);
                                    load();
                                  } catch (err) {
                                    toast.error(err.message);
                                  }
                                })();
                              }
                            }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}
        </Paper>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth>
        <DialogTitle>{form.id ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Name"
            fullWidth
            margin="normal"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Phone"
            fullWidth
            margin="normal"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <TextField
            label="Address"
            fullWidth
            margin="normal"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <TextField
            label="Credit Limit"
            fullWidth
            margin="normal"
            type="number"
            value={form.creditLimit}
            onChange={(e) =>
              setForm({ ...form, creditLimit: Number(e.target.value) || 0 })
            }
          />
          <TextField
            label="Past Credits (Opening Balance)"
            fullWidth
            margin="normal"
            type="number"
            value={form.openingBalance}
            onChange={(e) =>
              setForm({ ...form, openingBalance: Number(e.target.value) || 0 })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                if (form.id) {
                  await api.updateCustomer(form.id, form);
                  toast.success('Customer updated');
                } else {
                  await api.createCustomer(form);
                  toast.success('Customer created');
                }
                setOpenDialog(false);
                load();
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pay Credit Dialog */}
      <Dialog open={openPayCreditDialog} onClose={() => setOpenPayCreditDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Pay Credit - {selectedCustomer?.name}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <FormControl fullWidth margin="normal">
            <InputLabel>Apply to Invoice</InputLabel>
            <Select
              label="Apply to Invoice"
              value={payCreditForm.invoiceId}
              onChange={(e) =>
                setPayCreditForm({ ...payCreditForm, invoiceId: e.target.value })
              }
            >
              <MenuItem value="">None (Apply to all debts - FIFO)</MenuItem>
              {(() => {
                const totalUnpaidInvoices = customerInvoices.reduce((acc, inv) => 
                  acc + (inv.payment_status !== 'PAID' ? (inv.balance_amount || 0) : 0), 0);
                const pastCredit = Math.max(0, (selectedCustomer?.current_balance || 0) - totalUnpaidInvoices);
                if (pastCredit > 0.01) {
                  return (
                    <MenuItem value="PAST_CREDIT">
                      Remaining Opening Balance (Past Credit) (Bal: {pastCredit.toFixed(2)})
                    </MenuItem>
                  );
                }
                return null;
              })()}
              {customerInvoices
                .filter((inv) => inv.payment_status !== 'PAID')
                .map((inv) => (
                  <MenuItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} - {inv.total_amount.toFixed(2)} (Bal: {(inv.balance_amount || 0).toFixed(2)})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <TextField
            label="Amount (to Pay)"
            fullWidth
            margin="normal"
            type="number"
            placeholder="Enter payment amount"
            value={payCreditForm.amount || ''}
            onChange={(e) =>
              setPayCreditForm({
                ...payCreditForm,
                amount: Number(e.target.value) || 0,
              })
            }
            inputProps={{ min: 0.01, max: (selectedCustomer?.current_balance || 0), step: getInputStep() }}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Payment Type</InputLabel>
            <Select
              label="Payment Type"
              value={payCreditForm.paymentType}
              onChange={(e) =>
                setPayCreditForm({ ...payCreditForm, paymentType: e.target.value })
              }
            >
              <MenuItem value="CASH">Cash</MenuItem>
              <MenuItem value="CARD">Card</MenuItem>
            </Select>
          </FormControl>

          {payCreditForm.invoiceId === 'PAST_CREDIT' && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#E3F2FD', borderRadius: 1, border: '1px solid #90CAF9' }}>
               {(() => {
                const totalUnpaidInvoices = customerInvoices.reduce((acc, inv) => 
                  acc + (inv.payment_status !== 'PAID' ? (inv.balance_amount || 0) : 0), 0);
                const currentPastCredit = Math.max(0, (selectedCustomer?.current_balance || 0) - totalUnpaidInvoices);
                const afterPastCredit = Math.max(0, currentPastCredit - payCreditForm.amount);
                return (
                  <>
                    <Typography variant="subtitle2" color="primary.dark">Past Credit Details:</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="body2">Current Past Credit Balance:</Typography>
                      <Typography variant="body2" fontWeight="bold">{currentPastCredit.toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px dashed #90CAF9' }}>
                      <Typography variant="body2">Past Credit After Pay:</Typography>
                      <Typography variant="body2" fontWeight="bold" color={afterPastCredit > 0 ? 'error.main' : 'success.main'}>
                        {afterPastCredit.toFixed(2)}
                      </Typography>
                    </Box>
                  </>
                );
              })()}
            </Box>
          )}

          {payCreditForm.invoiceId && payCreditForm.invoiceId !== 'PAST_CREDIT' && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#FFFDE7', borderRadius: 1, border: '1px solid #FFF176' }}>
              {(() => {
                const inv = customerInvoices.find(i => String(i.id) === String(payCreditForm.invoiceId));
                if (!inv) return null;
                const currentInvBalance = inv.balance_amount || 0;
                const paidAlready = inv.paid_amount || 0;
                const afterInvBalance = Math.max(0, currentInvBalance - payCreditForm.amount);
                const overpayment = Math.max(0, payCreditForm.amount - currentInvBalance);

                return (
                  <>
                    <Typography variant="subtitle2" color="warning.dark" sx={{ fontWeight: 700 }}>
                      Selected Invoice: {inv.invoice_number}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Invoice Total:</Typography>
                        <Typography variant="body2">{inv.total_amount.toFixed(2)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Already Paid:</Typography>
                        <Typography variant="body2" color="success.main">{paidAlready.toFixed(2)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <Typography variant="body2">Current Balance:</Typography>
                        <Typography variant="body2">{currentInvBalance.toFixed(2)}</Typography>
                      </Box>
                    </Box>

                    {overpayment > 0 ? (
                      <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #FFE082' }}>
                        <Typography variant="body2" color="error.main" fontWeight="bold">
                          Overpayment: {overpayment.toFixed(2)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          The excess will be automatically applied to other debts (FIFO).
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed #ccc' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">Invoice Balance After Pay:</Typography>
                          <Typography variant="body2" fontWeight="bold" color={afterInvBalance > 0 ? 'error.main' : 'success.main'}>
                            {afterInvBalance.toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </>
                );
              })()}
            </Box>
          )}

          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid #ddd' }}>
            <Typography variant="subtitle2">Customer Credit Overview:</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="body2" color="text.secondary">Total Outstanding Credit:</Typography>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                {Math.max(0, selectedCustomer?.current_balance || 0).toFixed(2)}
              </Typography>
            </Box>
            {payCreditForm.amount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px solid #ddd' }}>
                <Typography variant="body2" color="text.secondary">Total Balance After Payment:</Typography>
                <Typography variant="body2" color="success.main" fontWeight="bold">
                  {Math.max(0, (selectedCustomer?.current_balance || 0) - payCreditForm.amount).toFixed(2)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPayCreditDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!payCreditForm.amount || payCreditForm.amount <= 0}
            onClick={async () => {
              if (!payCreditForm.amount || payCreditForm.amount <= 0) {
                toast.error('Amount must be greater than zero');
                return;
              }
              if (payCreditForm.amount > ((selectedCustomer?.current_balance || 0))) {
                toast.error('Amount cannot exceed current balance');
                return;
              }
              try {
                // Get customer balance before payment
                const balanceBefore = selectedCustomer.current_balance || 0;

                const result = await api.payCustomerCredit(
                  selectedCustomer.id,
                  payCreditForm.amount,
                  payCreditForm.paymentType,
                  payCreditForm.invoiceId || null
                );

                // Get updated customer to get new balance
                const updatedCustomers = await api.listCustomers();
                const updatedCustomer = updatedCustomers.find(c => c.id === selectedCustomer.id);
                const balanceAfter = updatedCustomer?.current_balance || 0;

                toast.success('Payment recorded successfully');

                // Print receipt if printer is configured
                try {
                  const printerSettings = await api.getPrinterSettings();
                  if (printerSettings.name) {
                    // Get shop name and logo
                    let shopName = 'Shop Operating Platform';
                    let logoUrl = null;
                    let invoiceTotal = null;
                    let invoiceDiscount = null;
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

                      // If payment is for a specific invoice, get invoice details
                      if (payCreditForm.invoiceId) {
                        try {
                          const invoice = await api.getInvoice(payCreditForm.invoiceId);
                          invoiceTotal = invoice.invoice?.total_amount || null;
                          invoiceDiscount = invoice.invoice?.discount || null;
                        } catch (err) {
                          // Ignore if invoice not found
                        }
                      }

                      // Get receipt customization settings
                      receiptSettings = await api.getReceiptSettings();
                    } catch (err) {
                      // Use default
                    }

                    // Generate receipt HTML
                    const html = generateReceiptHTML(
                      {
                        customerName: selectedCustomer.name,
                        amount: payCreditForm.amount,
                        invoiceNumber: payCreditForm.invoiceId || null,
                        paymentType: payCreditForm.paymentType,
                        date: new Date().toISOString(),
                        balanceBefore: balanceBefore,
                        balanceAfter: balanceAfter,
                        invoiceTotal: invoiceTotal,
                        invoiceDiscount: invoiceDiscount,
                      },
                      {
                        shopName,
                        paperSize: printerSettings.paperSize || '80',
                        printLogo: printerSettings.printLogo || false,
                        logoUrl,
                        receiptSettings,
                      }
                    );

                    // Print via Electron
                    if (printerSettings.useDirect) {
                      await api.printReceiptDirect({
                        type: 'receipt',
                        printerName: printerSettings.name,
                        paperSize: printerSettings.paperSize || '80',
                        shopName,
                        receiptSettings,
                        printLogo: printerSettings.printLogo || false,
                        usbDeviceId: printerSettings.usbDeviceId || null,
                        receipt: {
                          customerName: selectedCustomer.name,
                          amount: payCreditForm.amount,
                          invoiceNumber: payCreditForm.invoiceId || null,
                          paymentType: payCreditForm.paymentType,
                          date: new Date().toISOString(),
                          balanceBefore,
                          balanceAfter,
                        },
                      });
                    } else {
                      await api.printReceipt({
                        html,
                        printerName: printerSettings.name,
                        silent: printerSettings.silentPrint !== false,
                        paperSize: printerSettings.paperSize || '80',
                      });
                    }
                    // Don't show toast for print success to avoid clutter
                  }
                } catch (printErr) {
                  // Log error but don't show toast - payment was recorded successfully
                  console.error('Print receipt failed:', printErr);
                }

                setOpenPayCreditDialog(false);
                load();
                if (selectedCustomer) {
                  const updated = await api.listCustomers();
                  const customer = updated.find((c) => c.id === selectedCustomer.id);
                  if (customer) {
                    setSelectedCustomer(customer);
                    loadCustomerData(customer.id);
                  }
                }
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            Pay
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog
        open={openViewInvoiceDialog}
        onClose={() => setOpenViewInvoiceDialog(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Invoice {invoiceDetails?.invoice?.invoice_number}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {invoiceDetails && (
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Customer: {invoiceDetails.invoice.customer_name || 'Walking Customer'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Date: {new Date(invoiceDetails.invoice.date_time).toLocaleString()}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary" component="span">
                    Status:
                  </Typography>
                  <Chip
                    label={invoiceDetails.invoice.payment_status}
                    color={
                      invoiceDetails.invoice.payment_status === 'PAID'
                        ? 'success'
                        : invoiceDetails.invoice.payment_status === 'PARTIAL'
                          ? 'warning'
                          : 'error'
                    }
                    size="small"
                  />
                </Box>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoiceDetails.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">{item.unit_price.toFixed(2)}</TableCell>
                      <TableCell align="right">{item.line_total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Box sx={{ minWidth: 200 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography>Subtotal:</Typography>
                    <Typography>
                      {(invoiceDetails.invoice.total_amount + invoiceDetails.invoice.discount - (invoiceDetails.invoice.additional_amount || 0)).toFixed(2)}
                    </Typography>
                  </Box>
                  {invoiceDetails.invoice.discount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography>Discount:</Typography>
                      <Typography>{invoiceDetails.invoice.discount.toFixed(2)}</Typography>
                    </Box>
                  )}
                  {invoiceDetails.invoice.additional_amount && invoiceDetails.invoice.additional_amount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography>Additional Amount:</Typography>
                      <Typography color="success.main">+{invoiceDetails.invoice.additional_amount.toFixed(2)}</Typography>
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: 1, pt: 1 }}>
                    <Typography variant="h6">Total:</Typography>
                    <Typography variant="h6">
                      {invoiceDetails.invoice.total_amount.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
              {invoiceDetails.payments && invoiceDetails.payments.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Payments:
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoiceDetails.payments.map((pay) => (
                        <TableRow key={pay.id}>
                          <TableCell>
                            {new Date(pay.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Chip label={pay.payment_type} size="small" />
                          </TableCell>
                          <TableCell align="right">{pay.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenViewInvoiceDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog
        open={openEditInvoiceDialog}
        onClose={() => setOpenEditInvoiceDialog(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Edit Invoice {invoiceDetails?.invoice?.invoice_number}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {invoiceDetails && (
            <Box>
              {/* Customer Selection */}
              <Autocomplete
                options={customersForEdit}
                getOptionLabel={(option) => option.name || ''}
                value={editCustomer}
                onChange={(_, newValue) => setEditCustomer(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label="Customer (Optional)" margin="normal" fullWidth />
                )}
                sx={{ mb: 2 }}
              />

              {/* Items Table */}
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Items
              </Typography>
              <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {editItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Autocomplete
                          options={products}
                          getOptionLabel={(option) => option.name || ''}
                          value={item.product || null}
                          onChange={(_, newValue) => {
                            const updated = [...editItems];
                            updated[index] = {
                              ...updated[index],
                              product: newValue,
                              productId: newValue?.id || null,
                              unitPrice: newValue?.selling_price || 0,
                              quantity: updated[index].quantity || 1,
                            };
                            updated[index].lineTotal =
                              (updated[index].unitPrice || 0) * (updated[index].quantity || 0);
                            setEditItems(updated);
                          }}
                          renderInput={(params) => (
                            <TextField {...params} size="small" placeholder="Select product" />
                          )}
                          sx={{ minWidth: 200 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={item.quantity || 1}
                          onChange={(e) => {
                            const updated = [...editItems];
                            updated[index].quantity = Number(e.target.value) || 1;
                            updated[index].lineTotal =
                              (updated[index].unitPrice || 0) * updated[index].quantity;
                            setEditItems(updated);
                          }}
                          inputProps={{ min: getInputMin(), step: getInputStep() }}
                          sx={{ width: 100 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={item.unitPrice || 0}
                          onChange={(e) => {
                            const updated = [...editItems];
                            updated[index].unitPrice = Number(e.target.value) || 0;
                            updated[index].lineTotal =
                              updated[index].unitPrice * (updated[index].quantity || 1);
                            setEditItems(updated);
                          }}
                          inputProps={{ min: 0, step: getInputStep() }}
                          sx={{ width: 100 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(item.lineTotal || 0)}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setEditItems(editItems.filter((_, i) => i !== index));
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Add Item Button */}
              <Button
                startIcon={<Add />}
                onClick={() => {
                  setEditItems([
                    ...editItems,
                    { productId: null, product: null, quantity: 1, unitPrice: 0, lineTotal: 0 },
                  ]);
                }}
                sx={{ mb: 2 }}
              >
                Add Item
              </Button>

              {/* Discount */}
              <TextField
                label="Discount"
                fullWidth
                margin="normal"
                type="number"
                value={editDiscount}
                onChange={(e) => setEditDiscount(Number(e.target.value) || 0)}
                inputProps={{ min: 0, step: getInputStep() }}
              />

              {/* Additional Amount */}
              <TextField
                label="Additional Amount"
                fullWidth
                margin="normal"
                type="number"
                value={editAdditionalAmount}
                onChange={(e) => setEditAdditionalAmount(Number(e.target.value) || 0)}
                inputProps={{ min: 0, step: getInputStep() }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography variant="body2" color="text.secondary">
                        +
                      </Typography>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Totals */}
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Subtotal:
                  </Typography>
                  <Typography variant="body2">
                    {editItems
                      .reduce((sum, item) => sum + (item.lineTotal || 0), 0)
                      .toFixed(2)}
                  </Typography>
                </Box>
                {editDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Discount:
                    </Typography>
                    <Typography variant="body2">{editDiscount.toFixed(2)}</Typography>
                  </Box>
                )}
                {editAdditionalAmount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Additional Amount:
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      +{editAdditionalAmount.toFixed(2)}
                    </Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: 1, pt: 1 }}>
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6">
                    {Math.max(
                      0,
                      editItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0) - editDiscount + editAdditionalAmount
                    ).toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditInvoiceDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (editItems.length === 0) {
                toast.error('At least one item is required');
                return;
              }
              if (editItems.some((item) => !item.productId)) {
                toast.error('Please select a product for all items');
                return;
              }
              try {
                await api.updateInvoice(invoiceDetails.invoice.id, {
                  items: editItems.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                  })),
                  discount: editDiscount,
                  additionalAmount: editAdditionalAmount,
                  customerId: editCustomer?.id || null,
                });
                toast.success('Invoice updated successfully');
                setOpenEditInvoiceDialog(false);
                if (selectedCustomer) {
                  loadCustomerData(selectedCustomer.id);
                }
                load();
              } catch (err) {
                toast.error(err.message);
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Status Dialog */}
      <Dialog
        open={openStatusDialog}
        onClose={() => setOpenStatusDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Change Invoice Status - {selectedStatusInvoice?.invoice_number}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current Status: <strong>{selectedStatusInvoice?.payment_status}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
            Total Amount: {selectedStatusInvoice?.total_amount?.toFixed(2)}
          </Typography>
          <FormControl fullWidth margin="normal">
            <InputLabel>New Status</InputLabel>
            <Select
              label="New Status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <MenuItem value="CREDIT">CREDIT</MenuItem>
              <MenuItem value="PARTIAL">PARTIAL</MenuItem>
              <MenuItem value="PAID">PAID</MenuItem>
            </Select>
          </FormControl>
          {newStatus !== selectedStatusInvoice?.payment_status && (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#fff3cd', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> Changing the status will update the customer balance accordingly.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStatusDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (newStatus === selectedStatusInvoice?.payment_status) {
                setOpenStatusDialog(false);
                return;
              }
              try {
                await api.updateInvoiceStatus(selectedStatusInvoice.id, newStatus);
                toast.success('Invoice status updated successfully');
                setOpenStatusDialog(false);
                if (selectedCustomer) {
                  loadCustomerData(selectedCustomer.id);
                }
                load();
              } catch (err) {
                toast.error(err.message);
              }
            }}
            disabled={newStatus === selectedStatusInvoice?.payment_status}
          >
            Update Status
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog />
    </Box>
  );
}

export default Customers;


