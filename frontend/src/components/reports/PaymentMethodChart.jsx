import { Paper, Typography, Box, Skeleton } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/numberFormat';

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#9c27b0'];

function PaymentMethodChart({ data, loading }) {
  if (loading) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Skeleton variant="text" width="40%" height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={500} />
      </Paper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Payment Methods
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
          <Typography variant="body2" color="text.secondary">
            No payment data available
          </Typography>
        </Box>
      </Paper>
    );
  }

  const chartData = data.map((item) => ({
    name: item.payment_type,
    value: parseFloat(item.amount || 0),
    count: item.transaction_count || 0,
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
      return (
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid #e0e0e0',
            borderRadius: 1,
            p: 1.5,
            boxShadow: 2,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {data.name}
          </Typography>
          <Typography variant="body2">{formatCurrency(data.value)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {percentage}% of total
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {data.payload.count} transactions
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Payment Methods Breakdown
      </Typography>
      <Box sx={{ width: '100%', height: { xs: 350, sm: 450, md: 500 } }}>
        <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default PaymentMethodChart;
