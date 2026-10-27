import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { MdDelete, MdSearch, MdAdd, MdRemove } from 'react-icons/md';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { formatCurrency, formatNumber, getInputStep, getInputMin } from '../utils/numberFormat';
import { generateInvoiceHTML } from '../utils/print';
import { PRODUCT_NAME } from '../config/brand';

const PRODUCTS_PER_PAGE = 120;

// Receipt settings rarely change: read them once a minute at most, all at the same time
let receiptCache = null;
async function receiptSetup() {
  if (receiptCache && Date.now() - receiptCache.at < 60 * 1000) return receiptCache;
  const [printerSettings, shopInfo, receiptSettings] = await Promise.all([
    api.getPrinterSettings(),
    api.getShopInfo().catch(() => null),
    api.getReceiptSettings().catch(() => ({})),
  ]);
  receiptCache = { at: Date.now(), printerSettings, shopInfo, receiptSettings };
  return receiptCache;
}

// The product cards. Memoised: typing a quantity, discount or cash amount does not redraw them.
const ProductGrid = memo(function ProductGrid({ productsByCategory, onAdd, shown, total, onShowMore }) {
  return (
    <>
      {Object.keys(productsByCategory).length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          No products found
        </Typography>
      ) : (
        Object.entries(productsByCategory).map(([category, categoryProducts]) => (
          <Box key={category} sx={{ mb: 3 }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                pb: 1,
                borderBottom: '2px solid #e0e0e0',
                fontWeight: 600,
                color: 'primary.main',
              }}
            >
              {category} ({categoryProducts.length})
            </Typography>
            <Grid container spacing={{ xs: 1, sm: 1.5, md: 2 }}>
              {categoryProducts.map((product) => (
                <Grid item xs={6} sm={4} md={4} lg={3} xl={2} key={product.id}>
                  <Card
                    sx={{
                      height: '100%',
                      cursor: product.availableStock > 0 ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      opacity: product.availableStock > 0 ? 1 : 0.6,
                      '&:hover': {
                        transform: product.availableStock > 0 ? 'translateY(-4px)' : 'none',
                        boxShadow: product.availableStock > 0 ? 4 : 1,
                      },
                      border: product.availableStock <= product.minimum_stock ? '2px solid #f44336' : '1px solid #e0e0e0',
                    }}
                    onClick={() => {
                      if (product.availableStock > 0) {
                        onAdd(product);
                      } else {
                        toast.error(`Insufficient stock for ${product.name}`);
                      }
                    }}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        noWrap
                        sx={{ mb: 0.5 }}
                      >
                        {product.name}
                      </Typography>
                      <Typography variant="h6" color="primary" sx={{ mb: 0.5 }}>
                        {formatCurrency(product.selling_price)}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={`Stock: ${product.availableStock}`}
                          size="small"
                          color={
                            product.availableStock <= product.minimum_stock
                              ? 'error'
                              : product.availableStock === 0
                                ? 'default'
                                : 'default'
                          }
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))
      )}
      {total > shown && (
        <Box sx={{ textAlign: 'center', my: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      Showing {shown} of {total} products. Type in the search box to find one quickly.
          </Typography>
          <Button variant="outlined" size="small" onClick={onShowMore}>
      Show more
          </Button>
        </Box>
      )}
    </>
  );
});

function Sell() {
  const [session, setSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [payments, setPayments] = useState([{ type: 'CASH', amount: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('amount'); // 'amount' or 'percentage'
  const [additionalAmount, setAdditionalAmount] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState(0);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('');
  const [enablePrinting, setEnablePrinting] = useState(true);
  const [selectedCartItemId, setSelectedCartItemId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Only this many product cards are drawn at once (thousands of cards made typing in the cart slow)
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_PAGE);

  useEffect(() => {
    api
      .getCurrentSession()
      .then((data) => setSession(data))
      .catch((err) => setSessionError(err.message));
  }, []);

  // Product list: loaded once on open (no delay) and again while searching (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      api
        .listProductsForSale(search)
        .then((data) => setProducts(data))
        .catch((err) => toast.error(err.message));
    }, search ? 300 : 0);
    setVisibleCount(PRODUCTS_PER_PAGE);

    return () => clearTimeout(timeoutId);
  }, [search]);

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const s = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.category_name || '').toLowerCase().includes(s)
    );
  }, [products, search]);

  // Calculate available stock for each product (original stock - quantity in cart)
  const productsWithAvailableStock = useMemo(() => {
    return filteredProducts.map((product) => {
      const cartItem = cart.find((item) => item.id === product.id);
      const quantityInCart = cartItem ? cartItem.quantity : 0;
      const availableStock = product.current_stock - quantityInCart;
      return {
        ...product,
        availableStock: Math.max(0, availableStock), // Ensure stock never goes negative in display
      };
    });
  }, [filteredProducts, cart]);

  // Group products by category (only the cards that are drawn)
  const productsByCategory = useMemo(() => {
    const grouped = {};
    productsWithAvailableStock.slice(0, visibleCount).forEach((product) => {
      const category = product.category_name || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(product);
    });
    // Sort categories alphabetically
    return Object.keys(grouped)
      .sort()
      .reduce((acc, key) => {
        acc[key] = grouped[key];
        return acc;
      }, {});
  }, [productsWithAvailableStock, visibleCount]);
  const showMoreProducts = useCallback(() => setVisibleCount((n) => n + PRODUCTS_PER_PAGE), []);

  // product.availableStock is its stock minus what is already in the cart (see productsWithAvailableStock)
  const addToCart = useCallback((product) => {
    // Check stock availability
    if (!(product.availableStock > 0)) {
      toast.error(`Insufficient stock. Only ${product.current_stock} units available.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      // the cart keeps the product, not the grid's on-screen stock figure
      const item = { ...product };
      delete item.availableStock;
      return [...prev, { ...item, quantity: 1, discount: 0, discountType: 'amount' }];
    });
  }, []);

  const updateQuantity = (id, val) => {
    const quantity = val === '' ? '' : Number(val);

    if (quantity !== '' && (isNaN(quantity) || quantity < 0)) return;

    // Check stock availability
    const product = products.find((p) => p.id === id);
    if (product && quantity !== '' && quantity > 0) {
      const availableStock = product.current_stock;
      if (quantity > availableStock) {
        toast.error(`Only ${availableStock} units available in stock`);
        return;
      }
    }
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const total = cart.reduce((sum, item) => {
    const itemSubtotal = item.selling_price * item.quantity;
    let itemDiscount = 0;
    if (item.discountType === 'percentage') {
      itemDiscount = (itemSubtotal * Number(item.discount || 0)) / 100;
    } else {
      itemDiscount = Number(item.discount || 0);
    }
    return sum + (itemSubtotal - itemDiscount);
  }, 0);

  // Calculate global discount amount
  const discountAmount = useMemo(() => {
    if (!discount) return 0;
    if (discountType === 'percentage') {
      return (total * Number(discount)) / 100;
    }
    return Number(discount) || 0;
  }, [discount, discountType, total]);

  const finalTotal = Math.max(total - discountAmount + (Number(additionalAmount) || 0), 0);

  // Calculate total paid and remaining balance
  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  const remainingBalance = Math.max(finalTotal - totalPaid, 0);

  // Money actually collected now (credit-type lines are not money), and the part going on the customer's credit
  const collectedNow = Math.min(
    payments.filter((p) => p.type !== 'CREDIT').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    finalTotal
  );
  const toCreditNow = customer ? Math.max((Math.round(finalTotal * 100) - Math.round(collectedNow * 100)) / 100, 0) : 0;

  // Calculate change/balance when customer pays more than total (for cash payments)
  const changeAmount = useMemo(() => {
    if (totalPaid > finalTotal) {
      return totalPaid - finalTotal;
    }
    return 0;
  }, [totalPaid, finalTotal]);

  // Check if credit limit would be exceeded
  const creditLimitExceeded = useMemo(() => {
    if (!customer || remainingBalance <= 0) return null;
    const newBalance = (customer.current_balance || 0) + remainingBalance;
    if (customer.credit_limit > 0 && newBalance > customer.credit_limit) {
      return {
        exceeded: true,
        currentBalance: customer.current_balance || 0,
        creditLimit: customer.credit_limit,
        totalToPay: newBalance - customer.credit_limit,
      };
    }
    return null;
  }, [customer, remainingBalance]);

  const handlePay = async () => {
    // Ignore a second click while the first sale is still being saved
    if (submitting) return;
    setSubmitting(true);
    try {
      // Validate: If any payment is CREDIT, customer must be selected
      const hasCreditPayment = payments.some((p) => p.type === 'CREDIT' && p.amount > 0);
      if (hasCreditPayment && !customer) {
        toast.error('Customer is required for credit payment');
        return;
      }

      // Validate: Discount cannot exceed cost price (Profit must be >= 0 after discount)
      const currentCart = cart || [];
      const totalCost = currentCart.reduce((sum, item) => {
        const cost = Number(item.cost_price !== undefined ? item.cost_price : item.costPrice) || 0;
        const qty = Number(item.quantity) || 0;
        return sum + (cost * qty);
      }, 0);

      const currentTotal = currentCart.reduce((sum, item) => {
        const price = Number(item.selling_price !== undefined ? item.selling_price : item.sellingPrice) || 0;
        const qty = Number(item.quantity) || 0;
        return sum + (price * qty);
      }, 0);

      const profitMargin = Math.max(0, currentTotal - totalCost);

      if (discountAmount > (profitMargin + 0.01)) { // Added small tolerance for float precision
        toast.error(`Discount (${formatCurrency(discountAmount)}) cannot exceed the profit margin (${formatCurrency(profitMargin)})`);
        return;
      }

      // Validate: without a customer, cash must cover the total and cannot be zero.
      // With a customer selected, a smaller amount is a part-payment and the shortfall goes on their credit.
      if (!customer) {
        const cashPayments = payments.filter((p) => p.type === 'CASH');
        for (const cashPayment of cashPayments) {
          if (cashPayment.amount === 0) {
            toast.error('Cash payment amount cannot be zero');
            return;
          }
          if (cashPayment.amount > 0 && Math.round(cashPayment.amount * 100) < Math.round(finalTotal * 100)) {
            toast.error(`Cash payment amount (${formatCurrency(cashPayment.amount)}) must be greater than or equal to the total (${formatCurrency(finalTotal)})`);
            return;
          }
        }
      }

      // A remaining balance can only be put on credit for a named customer
      const balanceDue = (Math.round(finalTotal * 100) - Math.round(totalPaid * 100)) / 100;
      if (balanceDue > 0 && !customer) {
        toast.error(`A balance of ${formatCurrency(balanceDue)} remains. Select a customer to record it as credit, or take full payment.`);
        return;
      }

      const payload = {
        customerId: customer?.id || null, // null for walking customer
        items: cart.map((item) => ({
          productId: item.id,
          quantity: Number(item.quantity) || 0,
          discount: Number(item.discount) || 0,
          discountType: item.discountType || 'amount',
        })),
        payments: payments.filter((p) => p.amount > 0),
        discount: discountAmount,
        additionalAmount: Number(additionalAmount) || 0,
      };
      const res = await api.createInvoice(payload);
      const customerName = customer ? customer.name : 'Walking Customer';

      // Calculate change if cash payment exceeds total
      const paidAmount = payments.filter((p) => p.amount > 0).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const change = paidAmount > finalTotal ? paidAmount - finalTotal : 0;

      // Reset cart and form
      setCart([]);
      setPayments([{ type: 'CASH', amount: 0 }]);
      setDiscount(0);
      setDiscountType('amount');
      setAdditionalAmount(0);
      setCustomer(null);
      setSelectedCartItemId(null);

      // Show success message (say how much went on the customer's credit, if any)
      const paidNow = payments.filter((p) => p.type !== 'CREDIT').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const onCredit = (Math.round(res.invoice.total_amount * 100) - Math.round(paidNow * 100)) / 100;
      toast.success(
        customer && onCredit > 0
          ? `Invoice ${res.invoice.invoice_number} created for ${customerName}. ${formatCurrency(onCredit)} added to their credit balance.`
          : `Invoice ${res.invoice.invoice_number} created for ${customerName}`
      );

      // Auto-print invoice if enabled
      try {
        if (enablePrinting) {
          const { printerSettings, shopInfo, receiptSettings: cachedReceipt } = await receiptSetup();
          // Direct USB printing does not use a Windows printer name
          if (printerSettings.name || printerSettings.useDirect) {
            // Fetch full invoice details for printing
            const fullInvoice = await api.getInvoice(res.invoice.id);

            // Get shop name and logo
            let shopName = PRODUCT_NAME;
            let logoUrl = null;
            let receiptSettings = {};
            try {
              shopName = shopInfo?.name || PRODUCT_NAME;

              // Get logo URL if printLogo is enabled
              if (printerSettings.printLogo) {
                if (shopInfo?.logo_path) {
                  // Logo is served at /api/settings/logo endpoint
                  // Use API base URL to ensure it's accessible from print window
                  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
                  logoUrl = API_BASE_URL.replace('/api', '') + '/api/settings/logo';
                }
              }

              // Receipt customization settings
              receiptSettings = cachedReceipt || {};
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
            // Don't show toast for auto-print success to avoid clutter
          }
        }
      } catch (printErr) {
        // The sale is already saved; tell the cashier the receipt did not print so they can reprint it
        console.error('Auto-print failed:', printErr);
        toast.warning(`Sale saved, but the receipt did not print (${printErr.message || 'printer error'}). Reprint it from Invoices.`);
      }

      // Show balance dialog if there's change
      if (change > 0) {
        setBalanceAmount(change);
        setLastInvoiceNumber(res.invoice.invoice_number);
        setBalanceDialogOpen(true);
      }
      // Stock after the sale: the server returned the sold lines, so update locally (no catalogue download)
      const sold = {};
      for (const line of res.items || []) sold[line.product_id] = (sold[line.product_id] || 0) + line.quantity;
      setProducts((prev) => prev.map((p) => (sold[p.id] ? { ...p, current_stock: p.current_stock - sold[p.id] } : p)));
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick amount buttons handler
  const handleQuickAmount = (index, amount) => {
    setPayments((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, amount: amount } : item
      )
    );
  };

  // Auto-fill credit payment when customer is selected and payment type is credit
  useEffect(() => {
    if (customer && payments.length > 0) {
      const creditPayment = payments.find((p) => p.type === 'CREDIT');
      if (creditPayment && creditPayment.amount === 0 && remainingBalance > 0) {
        // Don't auto-fill, let user decide
      }
    }
  }, [customer, payments, remainingBalance]);

  if (!session) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Sell
        </Typography>
        {sessionError && (
          <Typography color="error" sx={{ mb: 2 }}>
            {sessionError}
          </Typography>
        )}
        <Paper
          sx={{
            p: 3,
            bgcolor: '#fffde7',
            borderLeft: '6px solid #ffb300',
          }}
        >
          <Typography variant="h6" gutterBottom>
            Day not started
          </Typography>
          <Typography>
            To begin billing, first start the day from the <strong>Dashboard</strong>{' '}
            using the opening cash amount.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      height: { xs: 'auto', sm: 'calc(100vh - 64px)' },
      width: '100%',
      overflow: 'hidden',
      gap: 1,
      p: 1.5,
    }}>
      {/* Left: Product Gallery + Customer Selection */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          p: 0,
          minWidth: { xs: '100%', sm: '300px' },
        }}
      >
        {/* Search Bar */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <TextField
            fullWidth
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MdSearch />
                </InputAdornment>
              ),
            }}
          />
        </Paper>



        {/* Product Gallery */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            pr: 1,
            '&::-webkit-scrollbar': {
              width: 'clamp(0.375rem, 1vw, 0.5rem)',
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#888',
              borderRadius: 'clamp(0.125rem, 0.5vw, 0.25rem)',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#555',
            },
          }}
        >
          <ProductGrid
            productsByCategory={productsByCategory}
            onAdd={addToCart}
            shown={Math.min(visibleCount, productsWithAvailableStock.length)}
            total={productsWithAvailableStock.length}
            onShowMore={showMoreProducts}
          />
        </Box>
      </Box>

      {/* Middle: Cart Items */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', sm: 3 },
          display: { xs: 'none', sm: 'flex' },
          flexDirection: 'column',
          bgcolor: '#fff',
          borderLeft: '1px solid #e0e0e0',
          overflow: 'hidden',
          minWidth: { sm: '280px' },
        }}
      >
        <Paper
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 0,
          }}
        >
          <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
            Cart
          </Typography>

          {/* Customer Selection (Moved here) */}
          <Box sx={{ px: 2, mb: 2 }}>
            <Autocomplete
              options={customerOptions}
              getOptionLabel={(option) => option.name || ''}
              value={customer}
              onChange={(_, newValue) => {
                setCustomer(newValue);
                if (!newValue) {
                  setPayments((prev) =>
                    prev.map((p) => (p.type === 'CREDIT' ? { ...p, type: 'CASH', amount: 0 } : p))
                  );
                }
              }}
              onOpen={async () => {
                if (customerOptions.length === 0) {
                  try {
                    const customers = await api.listCustomers('');
                    setCustomerOptions(customers);
                  } catch (err) {
                    // Ignore
                  }
                }
              }}
              onInputChange={async (_, value) => {
                try {
                  const customers = await api.listCustomers(value || '');
                  setCustomerOptions(customers);
                } catch (err) {
                  // Ignore
                }
                if (!value) {
                  setCustomer(null);
                }
              }}
              filterOptions={(options) => options}
              renderInput={(params) => {
                const hasCreditPayment = payments.some((p) => p.type === 'CREDIT');
                return (
                  <TextField
                    {...params}
                    label={hasCreditPayment ? 'Customer (Required for Credit)' : 'Customer (Optional)'}
                    size="small"
                    placeholder={hasCreditPayment ? 'Select customer for credit...' : 'Search customer...'}
                    required={hasCreditPayment}
                    error={hasCreditPayment && !customer}
                    helperText={hasCreditPayment && !customer ? 'Customer is required for credit payment' : ''}
                  />
                );
              }}
            />
          </Box>

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: 2,
              pb: 2,
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#ccc',
                borderRadius: '3px',
              },
            }}
          >
            {cart.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                Cart is empty
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell align="center">Qty</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cart.map((item) => (
                    <TableRow
                      key={item.id}
                      onClick={() => setSelectedCartItemId(selectedCartItemId === item.id ? null : item.id)}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: selectedCartItemId === item.id ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
                        '&:hover': {
                          bgcolor: selectedCartItemId === item.id ? 'rgba(25, 118, 210, 0.12)' : 'rgba(0, 0, 0, 0.04)',
                        },
                      }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" fontWeight="medium">
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(item.selling_price)} {item.unit ? `per ${item.unit}` : 'each'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => updateQuantity(item.id, Math.max(0, (Number(item.quantity) || 0) - 1))}
                          >
                            <MdRemove fontSize="small" />
                          </IconButton>
                          <TextField
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                            onBlur={(e) => {
                              const value = Number(e.target.value);
                              if (isNaN(value) || value <= 0) {
                                updateQuantity(item.id, getInputMin());
                              }
                            }}
                            inputProps={{
                              min: getInputMin(),
                              step: getInputStep(),
                              style: {
                                textAlign: 'center',
                                padding: '6px 8px',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: '#000',
                                width: item.unit ? '100%' : '60px',
                              },
                            }}
                            size="small"
                            sx={{
                              width: item.unit ? '100px' : '80px',
                              '& .MuiOutlinedInput-root': {
                                paddingRight: item.unit ? '24px' : '8px',
                                '& input': {
                                  color: '#000',
                                  fontWeight: 500,
                                },
                              },
                              '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#d0d0d0',
                              },
                              '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#1976d2',
                              },
                              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#1976d2',
                                borderWidth: '2px',
                              },
                            }}
                            InputProps={{
                              endAdornment: item.unit ? (
                                <InputAdornment position="end" sx={{ mr: 0 }}>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                      fontSize: '0.75rem',
                                      fontWeight: 400,
                                      minWidth: '16px',
                                    }}
                                  >
                                    {item.unit}
                                  </Typography>
                                </InputAdornment>
                              ) : null,
                            }}
                          />
                          <IconButton
                            size="small"
                            onClick={() => updateQuantity(item.id, (Number(item.quantity) || 0) + 1)}
                          >
                            <MdAdd fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" fontWeight="medium">
                          {formatCurrency((item.selling_price * (Number(item.quantity) || 0)) - (
                            item.discountType === 'percentage'
                              ? (item.selling_price * (Number(item.quantity) || 0) * Number(item.discount || 0)) / 100
                              : Number(item.discount || 0)
                          ))}
                        </Typography>
                        {item.discount > 0 && (
                          <Typography variant="caption" color="error" display="block">
                            Disc: -{formatCurrency(item.discountType === 'percentage'
                              ? (item.selling_price * (Number(item.quantity) || 0) * Number(item.discount || 0)) / 100
                              : Number(item.discount || 0))}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeItem(item.id)}
                        >
                          <MdDelete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        </Paper>
      </Box>

      {/* Right: Checkout Section */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', sm: 3 },
          display: { xs: 'none', sm: 'flex' },
          flexDirection: 'column',
          bgcolor: '#fff',
          borderLeft: '1px solid #e0e0e0',
          overflow: 'hidden',
          minWidth: { sm: '280px' },
        }}
      >
        <Paper
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 0,
          }}
        >
          <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
            Checkout
          </Typography>

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#ccc',
                borderRadius: '3px',
              },
            }}
          >
            {/* Totals */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Subtotal:
                </Typography>
                <Typography variant="body2">{formatCurrency(total)}</Typography>
              </Box>
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <ToggleButtonGroup
                    value={selectedCartItemId ? (cart.find(i => i.id === selectedCartItemId)?.discountType || 'amount') : discountType}
                    exclusive
                    onChange={(_, newType) => {
                      if (newType) {
                        if (selectedCartItemId) {
                          setCart(prev => prev.map(item =>
                            item.id === selectedCartItemId ? { ...item, discountType: newType, discount: 0 } : item
                          ));
                        } else {
                          setDiscountType(newType);
                          setDiscount(0);
                        }
                      }
                    }}
                    size="small"
                    sx={{ height: 'clamp(1.5rem, 3vw, 2rem)' }}
                  >
                    <ToggleButton value="amount">Amount</ToggleButton>
                    <ToggleButton value="percentage">%</ToggleButton>
                  </ToggleButtonGroup>
                  <TextField
                    label={selectedCartItemId ? `Discount (${cart.find(i => i.id === selectedCartItemId)?.name})` : "Discount (Total Bill)"}
                    type="number"
                    size="small"
                    value={selectedCartItemId ? (cart.find(i => i.id === selectedCartItemId)?.discount || 0) : discount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (selectedCartItemId) {
                        setCart(prev => prev.map(item =>
                          item.id === selectedCartItemId ? { ...item, discount: val } : item
                        ));
                      } else {
                        setDiscount(val);
                      }
                    }}
                    sx={{ flex: 1 }}
                    inputProps={{
                      min: 0,
                      max: discountType === 'percentage' ? 100 : undefined,
                      step: discountType === 'percentage' ? 0.1 : getInputStep(),
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {discountType === 'percentage' ? '%' : ''}
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
                {discountAmount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Discount:
                    </Typography>
                    <Typography variant="body2" color="error">
                      -{formatCurrency(discountAmount)}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ mb: 1 }}>
                <TextField
                  label="Additional Amount"
                  type="number"
                  size="small"
                  fullWidth
                  value={additionalAmount}
                  onChange={(e) => setAdditionalAmount(e.target.value)}
                  inputProps={{
                    min: 0,
                    step: getInputStep(),
                  }}
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
                {additionalAmount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Additional Amount:
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      +{formatCurrency(Number(additionalAmount) || 0)}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6" color="text.secondary">
                  Total:
                </Typography>
                <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>
                  {formatCurrency(finalTotal)}
                </Typography>
              </Box>
              {totalPaid > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Paid:
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    {formatCurrency(totalPaid)}
                  </Typography>
                </Box>
              )}
              {changeAmount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Change/Balance:
                  </Typography>
                  <Typography variant="body2" color="info.main" fontWeight="bold">
                    {formatCurrency(changeAmount)}
                  </Typography>
                </Box>
              )}
              {remainingBalance > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    {customer ? 'Credit Balance:' : 'Remaining:'}
                  </Typography>
                  <Typography variant="body2" color="warning.main" fontWeight="bold">
                    {formatCurrency(remainingBalance)}
                  </Typography>
                </Box>
              )}
              {creditLimitExceeded && (
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    bgcolor: '#ffebee',
                    borderRadius: 1,
                    border: '1px solid #f44336',
                  }}
                >
                  <Typography variant="body2" color="error" fontWeight="bold" gutterBottom>
                    ⚠️ Credit Limit Exceeded
                  </Typography>
                  <Typography variant="caption" color="error" display="block">
                    Current Balance: {formatCurrency(creditLimitExceeded.currentBalance)}
                  </Typography>
                  <Typography variant="caption" color="error" display="block">
                    Credit Limit: {formatCurrency(creditLimitExceeded.creditLimit)}
                  </Typography>
                  <Typography variant="body2" color="error" fontWeight="bold" sx={{ mt: 0.5 }}>
                    Total Amount to Pay: {formatCurrency(creditLimitExceeded.totalToPay)}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Payments */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2">
                  Payments
                </Typography>
                <Button
                  size="small"
                  onClick={() => setPayments([...payments, { type: 'CASH', amount: 0 }])}
                >
                  Add Payment
                </Button>
              </Box>
              {payments.map((p, index) => (
                <Box key={index} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <FormControl size="small" sx={{ minWidth: 'clamp(5rem, 10vw, 6.25rem)', flex: '0 0 clamp(5rem, 10vw, 6.25rem)' }}>
                      <InputLabel>Type</InputLabel>
                      <Select
                        label="Type"
                        value={p.type}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'CREDIT' && !customer) {
                            toast.error('Please select a customer first for credit payment');
                            return;
                          }
                          setPayments((prev) => {
                            const otherPayments = prev.filter((_, i) => i !== index);
                            const otherTotal = otherPayments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0);
                            const newRemaining = Math.max(finalTotal - otherTotal, 0);
                            return prev.map((item, i) =>
                              i === index
                                ? {
                                  ...item,
                                  type: value,
                                  amount:
                                    value === 'CREDIT' && customer
                                      ? newRemaining
                                      : item.amount,
                                }
                                : item
                            );
                          });
                        }}
                      >
                        <MenuItem value="CASH">Cash</MenuItem>
                        <MenuItem value="CARD">Card</MenuItem>
                        <MenuItem value="CREDIT" disabled={!customer}>
                          Credit {!customer && '(Select Customer)'}
                        </MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Amount"
                      type="number"
                      size="small"
                      fullWidth
                      value={p.amount}
                      onChange={(e) => {
                        const value = Number(e.target.value) || 0;
                        setPayments((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, amount: value } : item
                          )
                        );
                      }}
                      // Same rule as the Pay button: full cash is only required when no customer is selected;
                      // with a customer, a smaller amount is a valid part-payment (the rest goes to credit)
                      inputProps={{ min: p.type === 'CASH' && !customer ? finalTotal : 0, step: getInputStep() }}
                      error={
                        p.type === 'CASH' && !customer &&
                        (p.amount === 0 || (p.amount > 0 && Math.round(p.amount * 100) < Math.round(finalTotal * 100)))
                      }
                      helperText={
                        p.type === 'CASH' && !customer && p.amount === 0
                          ? 'Cash amount cannot be zero'
                          : p.type === 'CASH' && !customer && p.amount > 0 && Math.round(p.amount * 100) < Math.round(finalTotal * 100)
                            ? `Cash amount must be >= ${formatCurrency(finalTotal)}`
                            : p.type === 'CASH' && customer && Math.round(p.amount * 100) < Math.round(finalTotal * 100)
                              ? 'Part-payment: the rest goes to the customer\'s credit'
                              : ''
                      }
                    />
                    {payments.length > 1 && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setPayments(payments.filter((_, i) => i !== index))}
                      >
                        <MdDelete />
                      </IconButton>
                    )}
                  </Box>
                  {/* Quick Amount Buttons */}
                  <ButtonGroup size="small" fullWidth sx={{ mb: 0.5 }}>
                    <Button onClick={() => handleQuickAmount(index, finalTotal)}>
                      Full
                    </Button>
                    <Button onClick={() => handleQuickAmount(index, finalTotal * 0.5)}>
                      50%
                    </Button>
                    <Button onClick={() => handleQuickAmount(index, finalTotal * 0.25)}>
                      25%
                    </Button>
                    <Button onClick={() => handleQuickAmount(index, remainingBalance)}>
                      Balance
                    </Button>
                  </ButtonGroup>
                  {p.type === 'CREDIT' && customer && remainingBalance > 0 && (
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                      Balance {formatCurrency(remainingBalance)} will be added to customer credit
                    </Typography>
                  )}
                </Box>
              ))}
              {/* Print Toggle */}
              <Box sx={{ mb: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={enablePrinting}
                      onChange={(e) => setEnablePrinting(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Print Receipt After Payment"
                />
              </Box>
            </Box>

            {/* Pay Button */}
            <Button
              fullWidth
              variant="contained"
              color="success"
              size="large"
              sx={{ py: 1.5, fontSize: 18, fontWeight: 600 }}
              onClick={handlePay}
              disabled={
                submitting ||
                cart.length === 0 ||
                // Full cash payment is only required when no customer is selected (otherwise the rest goes on credit)
                (!customer && payments.some((p) => p.type === 'CASH' && (p.amount === 0 || Math.round(p.amount * 100) < Math.round(finalTotal * 100))))
              }
            >
              {toCreditNow > 0
                ? collectedNow > 0
                  ? `Pay ${formatCurrency(collectedNow)} now · ${formatCurrency(toCreditNow)} to credit`
                  : `Put ${formatCurrency(toCreditNow)} on credit`
                : `Pay ${formatCurrency(finalTotal)}`}
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* Balance/Change Dialog */}
      <Dialog
        open={balanceDialogOpen}
        onClose={() => setBalanceDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          <Typography variant="h5" fontWeight="bold" color="primary">
            Payment Complete
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pt: 2 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              Invoice: {lastInvoiceNumber}
            </Typography>
            <Typography variant="h4" color="primary" sx={{ mt: 2, mb: 1, fontWeight: 700 }}>
              {formatCurrency(balanceAmount)}
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Change/Balance
            </Typography>
          </Box>
          <Box
            sx={{
              p: 2,
              bgcolor: 'primary.light',
              borderRadius: 2,
              mt: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Please return this amount to the customer
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={() => setBalanceDialogOpen(false)}
            sx={{ minWidth: 150, py: 1.5 }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Sell;
