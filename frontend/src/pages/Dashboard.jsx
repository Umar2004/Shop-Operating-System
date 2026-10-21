import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  Paper,
  TextField,
  Typography,
  Snackbar,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { MdOutlineAttachMoney, MdOutlineShoppingCart, MdInventory } from 'react-icons/md';
import {
  FaArrowTrendUp,
  FaMoneyBillWave,
  FaCashRegister,
  FaUserPlus,
} from 'react-icons/fa6';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import BackupPromptDialog from '../components/settings/BackupPromptDialog';
import { formatCurrency, formatNumber } from '../utils/numberFormat';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [pendingEndDay, setPendingEndDay] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setError('');
      try {
        const current = await api.getCurrentSession();
        if (!isMounted) return;
        setSession(current);

        if (current && current.business_date) {
          const data = await api.getDaySummary(current.business_date);
          if (!isMounted) return;
          setSummary(data);
        } else {
          setSummary(null);
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartDay = async () => {
    setError('');
    try {
      const res = await api.startSession(Number(openingCash) || 0);
      setSession(res);
      setOpeningCash('');

      if (res.business_date) {
        const data = await api.getDaySummary(res.business_date).catch(() => null);
        if (data) {
          setSummary(data);
        }
      }
    } catch (err) {
      // Show detailed error message from backend
      const errorMessage = err.data?.message || err.message || 'Failed to start day';
      setError(errorMessage);
      
    }
  };

  const handleEndDay = async () => {
    // Check if daily backup is enabled
    try {
      const schedule = await api.getBackupSchedule();
      if (schedule.daily === 'enabled') {
        // Check if skip option is enabled
        if (schedule.daily_skip_option === 'true') {
          // Show dialog with skip option
          setPendingEndDay(true);
          setShowBackupDialog(true);
          return;
        } else {
          // Automatic backup without prompt - backend will create it
          setPendingEndDay(true);
          await executeEndDay(false); // false = don't skip backup (backend will create it)
          return;
        }
      }
    } catch (err) {
      // If settings load fails, proceed without backup
      console.error('Error loading backup schedule:', err);
    }

    // Proceed with ending day without backup (skip backup)
    await executeEndDay(true);
  };

  const executeEndDay = async (skipBackup = false) => {
    setError('');
    try {
      const res = await api.endSession(Number(closingCash) || 0, skipBackup);
      setSession(null);
      setClosingCash('');

      if (res.backup && res.backup.created) {
        // Backup was created successfully
        // Could show a success message here if needed
      }

      if (res.business_date) {
        const data = await api.getDaySummary(res.business_date).catch(() => null);
        if (data) {
          setSummary(data);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingEndDay(false);
    }
  };

  const handleBackupDialogClose = () => {
    setShowBackupDialog(false);
    if (pendingEndDay) {
      setPendingEndDay(false);
      // User closed dialog without creating backup, proceed with ending day
      executeEndDay(false);
    }
  };

  const handleBackupCreated = () => {
    // After backup is created, proceed with ending day
    if (pendingEndDay) {
      setPendingEndDay(false);
      executeEndDay(false); // Backup already created by dialog
    }
  };

  const handleBackupSkip = () => {
    // User skipped backup, proceed with ending day
    if (pendingEndDay) {
      setPendingEndDay(false);
      executeEndDay(false);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {getGreeting()}, {user?.username || 'Operator'} 👋
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Today is {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </Typography>
      </Box>

      {/* Day start priority section */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          bgcolor: session ? '#E8F5E9' : '#FFF8E1',
          borderLeft: session ? '6px solid #2E7D32' : '6px solid #ED6C02',
        }}
      >
        {session ? (
          <>
            <Typography variant="h6" gutterBottom>
              🕒 Session Running
            </Typography>
            <Typography>
              Business date: <strong>{session.business_date}</strong> | Opening cash:{' '}
              <strong>{formatCurrency(session.opening_cash)}</strong>
            </Typography>
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <TextField
                label="Closing cash"
                type="number"
                size="small"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
              />
              <Button
                variant="outlined"
                color="error"
                onClick={handleEndDay}
              >
                End Day
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Typography variant="h6" gutterBottom>
              🕒 Today&apos;s Session
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              To start billing and recording expenses, open the day with the opening cash
              amount in the drawer.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                label="Opening cash"
                type="number"
                size="small"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
              <Button
                variant="contained"
                color="success"
                onClick={handleStartDay}
              >
                Start Day
              </Button>
            </Box>
          </>
        )}
      </Paper>

      {/* Summary cards */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#E8F5E9',
              borderLeft: '6px solid #2E7D32',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              boxShadow: '0 4px 10px rgba(46,125,50,0.12)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MdOutlineAttachMoney size={22} color="#2E7D32" />
              <Typography variant="subtitle2" color="text.secondary">
                Total Sales Today
              </Typography>
            </Box>
            {summary && summary.sales.total_sales > 0 ? (
              <Typography variant="h5">
                {formatCurrency(summary.sales.total_sales)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No sales yet today
              </Typography>
            )}
          </Paper>
        </Grid>
        {/* Profit card - only visible for ADMIN and MANAGER, hidden for CASHIER */}
        {user?.role !== 'CASHIER' && (
          <Grid item xs={12} md={3}>
            <Paper
              sx={{
                p: 2,
                bgcolor: '#FFF3E0',
                borderLeft: '6px solid #ED6C02',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                boxShadow: '0 4px 10px rgba(237,108,2,0.12)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FaArrowTrendUp size={20} color="#ED6C02" />
                <Typography variant="subtitle2" color="text.secondary">
                  Profit Today
                </Typography>
              </Box>
              {summary ? (
                <Typography 
                  variant="h5" 
                  sx={{ 
                    color: (summary.profit || 0) >= 0 ? 'success.main' : 'error.main' 
                  }}
                >
                  {formatCurrency(summary.profit || 0)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No profit yet today
                </Typography>
              )}
            </Paper>
          </Grid>
        )}
        <Grid item xs={12} md={3}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#FFEBEE',
              borderLeft: '6px solid #D32F2F',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              boxShadow: '0 4px 10px rgba(211,47,47,0.12)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FaMoneyBillWave size={20} color="#D32F2F" />
              <Typography variant="subtitle2" color="text.secondary">
                Expenses Today
              </Typography>
            </Box>
            {summary && summary.expenses.total_expenses > 0 ? (
              <Typography variant="h5">
                {formatCurrency(summary.expenses.total_expenses)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No expenses recorded
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#E3F2FD',
              borderLeft: '6px solid #1565C0',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              boxShadow: '0 4px 10px rgba(21,101,192,0.12)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MdOutlineShoppingCart size={22} color="#1565C0" />
              <Typography variant="subtitle2" color="text.secondary">
                Cash Expected
              </Typography>
            </Box>
            {summary ? (
              <Typography variant="h5">{formatCurrency(summary.expectedCash)}</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Start your day to track cash
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper
            sx={{
              p: 2,
              bgcolor: '#F3E5F5',
              borderLeft: '6px solid #7B1FA2',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              boxShadow: '0 4px 10px rgba(123,31,162,0.12)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MdInventory size={22} color="#7B1FA2" />
              <Typography variant="subtitle2" color="text.secondary">
                Total Products
              </Typography>
            </Box>
            {summary && summary.products ? (
              <Typography variant="h5">
                {formatNumber(summary.products.total_products || 0)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Loading...
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Today activity strip */}
      <Paper
        sx={{
          mt: 3,
          p: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          alignItems: 'center',
          bgcolor: '#FFFFFF',
          boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
        }}
      >
        <Typography variant="body2">
          🧾 Invoices:{' '}
          <strong>{summary?.invoiceStats?.invoice_count ?? 0}</strong>
        </Typography>
        <Typography variant="body2">
          💰 Cash:{' '}
          <strong>
            {formatCurrency(summary?.payments?.cash_sales || 0)}
          </strong>
        </Typography>
        <Typography variant="body2">
          💳 Credit:{' '}
          <strong>
            {formatCurrency(summary?.payments?.credit_sales || 0)}
          </strong>
        </Typography>
      </Paper>

      {/* Quick actions */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Quick actions
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<FaCashRegister />}
            sx={{ minWidth: 'clamp(8rem, 15vw, 10rem)' }}
            onClick={() => navigate('/sell')}
          >
            New Sale
          </Button>
          <Button
            variant="outlined"
            startIcon={<MdOutlineAttachMoney />}
            sx={{ minWidth: 'clamp(8rem, 15vw, 10rem)' }}
            onClick={() => navigate('/products')}
          >
            Add Product
          </Button>
          <Button
            variant="outlined"
            startIcon={<FaUserPlus />}
            sx={{ minWidth: 'clamp(8rem, 15vw, 10rem)' }}
            onClick={() => navigate('/customers')}
          >
            Add Customer
          </Button>
          <Button
            variant="outlined"
            startIcon={<FaMoneyBillWave />}
            sx={{ minWidth: 'clamp(8rem, 15vw, 10rem)' }}
            onClick={() => navigate('/expenses')}
          >
            Add Expense
          </Button>
        </Box>
      </Box>
      <Snackbar
        open={!!error}
        autoHideDuration={3000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setError('')}
          severity="error"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>

      <BackupPromptDialog
        open={showBackupDialog}
        onClose={handleBackupDialogClose}
        onBackupCreated={handleBackupCreated}
        onSkip={handleBackupSkip}
      />
    </Box>
  );
}

export default Dashboard;


