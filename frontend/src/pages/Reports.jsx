import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Snackbar, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { api } from '../api/client';
import ReportFilters from '../components/reports/ReportFilters';
import KPICards from '../components/reports/KPICards';
import SalesTrendsChart from '../components/reports/SalesTrendsChart';
import PaymentMethodChart from '../components/reports/PaymentMethodChart';
import CategorySalesChart from '../components/reports/CategorySalesChart';
import TopProductsTable from '../components/reports/TopProductsTable';
import SalesDetailTable from '../components/reports/SalesDetailTable';
import DailyReportsTable from '../components/reports/DailyReportsTable';
import StockValuationTab from '../components/reports/StockValuationTab';

function Reports() {
  // Initialize filters with default date range (last month)
  const getDefaultFilters = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 1);

    return {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      preset: 'thisMonth',
      paymentType: 'ALL',
      customerId: null,
      customer: null,
      search: '',
    };
  };

  const [filters, setFilters] = useState(getDefaultFilters());
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data states
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [categorySales, setCategorySales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesDetail, setSalesDetail] = useState([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLimit, setDetailLimit] = useState(50);
  const [detailOffset, setDetailOffset] = useState(0);

  // Load all report data
  const loadReports = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) return;

    setLoading(true);
    setError('');

    try {
      const [
        summaryData,
        trendsData,
        paymentMethodsData,
        categorySalesData,
        topProductsData,
        detailData,
      ] = await Promise.all([
        api.getSalesSummary(filters.startDate, filters.endDate),
        api.getSalesTrends(filters.startDate, filters.endDate, 'day'),
        api.getSalesByPaymentMethod(filters.startDate, filters.endDate),
        api.getSalesByCategory(filters.startDate, filters.endDate),
        api.getTopProducts(filters.startDate, filters.endDate, 10),
        api.getSalesDetail({
          ...filters,
          limit: detailLimit,
          offset: detailOffset,
        }),
      ]);

      setSummary(summaryData);
      setTrends(trendsData);
      setPaymentMethods(paymentMethodsData);
      setCategorySales(categorySalesData);
      setTopProducts(topProductsData);
      setSalesDetail(detailData.invoices || []);
      setDetailTotal(detailData.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load reports');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, detailLimit, detailOffset]);

  // Load on mount and when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadReports();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [filters.startDate, filters.endDate, filters.paymentType, filters.customerId, filters.search]);

  // Reload detail table when pagination changes
  useEffect(() => {
    if (!loading) {
      const loadDetail = async () => {
        try {
          const detailData = await api.getSalesDetail({
            ...filters,
            limit: detailLimit,
            offset: detailOffset,
          });
          setSalesDetail(detailData.invoices || []);
          setDetailTotal(detailData.total || 0);
        } catch (err) {
          setError(err.message || 'Failed to load sales detail');
        }
      };
      loadDetail();
    }
  }, [detailLimit, detailOffset]);

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setDetailOffset(0); // Reset pagination when filters change
  };

  const handleDetailPageChange = (newOffset, newLimit) => {
    setDetailOffset(newOffset);
    setDetailLimit(newLimit);
  };

  const handleProductClick = (product) => {
    // Could navigate to product details or filter by product
  };

  const handleInvoiceClick = (invoice) => {
    // Could navigate to invoice details
    // You could use: navigate(`/invoices/${invoice.id}`);
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        Sales Reports
      </Typography>

      <ReportFilters filters={filters} onFiltersChange={handleFiltersChange} />

      {error && (
        <Snackbar
          open={!!error}
          autoHideDuration={5000}
          onClose={() => setError('')}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setError('')} severity="error" variant="filled" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
      )}

      {/* KPI Cards */}
      <KPICards summary={summary} loading={loading} />

      {/* Charts Section */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 3, width: '100%' }}>
        <Grid item xs={12} lg={9} xl={10}>
          <SalesTrendsChart
            data={trends}
            loading={loading}
            startDate={filters.startDate}
            endDate={filters.endDate}
          />
        </Grid>
        <Grid item xs={12} lg={3} xl={2}>
          <PaymentMethodChart data={paymentMethods} loading={loading} />
        </Grid>
        <Grid item xs={12} sx={{ width: '100%', maxWidth: '100%' }}>
          <CategorySalesChart data={categorySales} loading={loading} />
        </Grid>
      </Grid>

      {/* Tabs for Tables */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Daily Reports" />
          <Tab label="Top Products" />
          <Tab label="Sales Detail" />
          <Tab label="Stock Valuation" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      {activeTab === 0 && (
        <DailyReportsTable
          data={trends}
          loading={loading}
        />
      )}

      {activeTab === 1 && (
        <TopProductsTable
          data={topProducts}
          loading={loading}
          onProductClick={handleProductClick}
        />
      )}

      {activeTab === 2 && (
        <SalesDetailTable
          data={salesDetail}
          loading={loading}
          total={detailTotal}
          limit={detailLimit}
          offset={detailOffset}
          onPageChange={handleDetailPageChange}
          onRowClick={handleInvoiceClick}
          filters={filters}
        />
      )}

      {activeTab === 3 && (
        <StockValuationTab />
      )}
    </Box>
  );
}

export default Reports;
