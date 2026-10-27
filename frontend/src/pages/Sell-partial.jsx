import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    api
      .getCurrentSession()
      .then((data) => setSession(data))
      .catch((err) => setSessionError(err.message));

    api
      .listProducts()
      .then((data) => setProducts(data))
      .catch((err) => toast.error(err.message));
  }, []);

  // Real-time product search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      api
        .listProducts(search)
        .then((data) => setProducts(data))
        .catch((err) => toast.error(err.message));
    }, 300);

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

  // Group products by category
  const productsByCategory = useMemo(() => {
    const grouped = {};
    productsWithAvailableStock.forEach((product) => {
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
  }, [productsWithAvailableStock]);

  const addToCart = (product) => {
    // Check stock availability
    const cartItem = cart.find((item) => item.id === product.id);
    const currentQuantity = cartItem ? cartItem.quantity : 0;
    if (currentQuantity >= product.current_stock) {
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
      return [...prev, { ...product, quantity: 1, discount: 0, discountType: 'amount' }];
    });
  };

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

      // Validate: Cash payments must be >= total and cannot be zero
      const cashPayments = payments.filter((p) => p.type === 'CASH');
      for (const cashPayment of cashPayments) {
        if (cashPayment.amount === 0) {
          toast.error('Cash payment amount cannot be zero');
          return;
        }
        if (cashPayment.amount > 0 && cashPayment.amount < finalTotal) {
          toast.error(`Cash payment amount (${formatCurrency(cashPayment.amount)}) must be greater than or equal to the total (${formatCurrency(finalTotal)})`);
          return;
        }
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

      // Show success message
      toast.success(`Invoice ${res.invoice.invoice_number} created for ${customerName}`);

      // Auto-print invoice if enabled
      try {
        if (enablePrinting) {
          const printerSettings = await api.getPrinterSettings();
          if (printerSettings.name) {
            // Fetch full invoice details for printing
            const fullInvoice = await api.getInvoice(res.invoice.id);

            // Get shop name and logo
            let shopName = PRODUCT_NAME;
            let logoUrl = null;
            let receiptSettings = {};
            try {
              const shopSetting = await api.getSetting('shop.name');
              shopName = shopSetting?.value || PRODUCT_NAME;

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
            // Don't show toast for auto-print success to avoid clutter
          }
        }
      } catch (printErr) {
        // Log error but don't show toast - invoice was created successfully
        console.error('Auto-print failed:', printErr);
      }

      // Show balance dialog if there's change
      if (change > 0) {
        setBalanceAmount(change);
        setLastInvoiceNumber(res.invoice.invoice_number);
        setBalanceDialogOpen(true);
      }
      // Refresh products to get updated stock
      api
        .listProducts(search)
        .then((data) => setProducts(data))
        .catch((err) => {
          // Ignore errors, stock will update on next search
        });
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
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

