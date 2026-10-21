import { Box, Grid, Paper, Typography, Skeleton } from '@mui/material';
import {
  MdTrendingUp,
  MdTrendingDown,
  MdAttachMoney,
  MdShoppingCart,
  MdPercent,
  MdDiscount,
} from 'react-icons/md';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';

function KPICard({ title, value, subtitle, icon: Icon, trend, loading }) {
  if (loading) {
    return (
      <Paper sx={{ p: 2, height: '100%' }}>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="40%" height={32} sx={{ mt: 1 }} />
        {subtitle && <Skeleton variant="text" width="50%" height={20} sx={{ mt: 1 }} />}
      </Paper>
    );
  }

  const formatValue = (val) => {
    if (typeof val === 'number') {
      return formatNumber(val);
    }
    return val || formatNumber(0);
  };

  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, boxShadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        {Icon && (
          <Icon
            style={{
              fontSize: '1.5rem',
              color: 'rgba(0, 0, 0, 0.54)',
            }}
          />
        )}
      </Box>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 600,
          mb: subtitle ? 0.5 : 0,
          color: 'primary.main',
        }}
      >
        {typeof value === 'number' && value >= 0 ? formatCurrency(value) : formatValue(value)}
      </Typography>
      {subtitle && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          {trend && (
            <>
              {trend > 0 ? (
                <MdTrendingUp style={{ color: '#2e7d32', fontSize: '1rem' }} />
              ) : trend < 0 ? (
                <MdTrendingDown style={{ color: '#d32f2f', fontSize: '1rem' }} />
              ) : null}
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function KPICards({ summary, loading }) {
  if (loading) {
    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={i}>
            <KPICard loading />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!summary) {
    return null;
  }

  const profitMargin = summary.profit_margin || 0;
  const avgTransaction = summary.avg_transaction_value || 0;

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Total Sales"
          value={summary.total_sales || 0}
          icon={MdAttachMoney}
          subtitle={`${summary.transaction_count || 0} transactions`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Total Profit"
          value={summary.total_profit || 0}
          icon={MdTrendingUp}
          subtitle={`${profitMargin}% margin`}
          trend={profitMargin > 0 ? 1 : profitMargin < 0 ? -1 : 0}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Avg Transaction"
          value={avgTransaction}
          icon={MdShoppingCart}
          subtitle="Per transaction"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Total Discounts"
          value={summary.total_discount || 0}
          icon={MdDiscount}
          subtitle={`${summary.total_sales > 0 ? ((summary.total_discount / summary.total_sales) * 100).toFixed(1) : 0}% of sales`}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Total Outstanding"
          value={summary.total_outstanding || 0}
          icon={MdTrendingDown}
          subtitle={[
            'Unpaid balances',
            (summary.write_offs || 0) > 0 ? `written off in period ${formatNumber(summary.write_offs)}` : null,
            (summary.customer_refund_due || 0) > 0 ? `refunds due ${formatNumber(summary.customer_refund_due)}` : null,
          ].filter(Boolean).join(' · ')}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={4} lg={2} xl={2}>
        <KPICard
          title="Transactions"
          value={summary.transaction_count || 0}
          icon={MdShoppingCart}
          subtitle="Total invoices"
        />
      </Grid>
    </Grid>
  );
}

export default KPICards;
