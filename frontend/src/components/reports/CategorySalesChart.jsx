import { Paper, Typography, Box, Skeleton } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../utils/numberFormat';

function CategorySalesChart({ data, loading }) {
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
          Sales by Category
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
          <Typography variant="body2" color="text.secondary">
            No category data available
          </Typography>
        </Box>
      </Paper>
    );
  }

  const chartData = data.map((item) => ({
    category: item.category_name || 'Uncategorized',
    revenue: parseFloat(item.revenue || 0),
    profit: parseFloat(item.profit || 0),
    quantity: parseFloat(item.quantity || 0),
  }));

  return (
    <Paper sx={{ p: 3, mb: 3, width: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Sales by Category
      </Typography>
      <Box sx={{ width: '100%', height: { xs: 350, sm: 450, md: 500 }, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" angle={-45} textAnchor="end" height={100} />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip
            formatter={(value, name) => {
              if (name === 'quantity') {
                return [value, 'Quantity'];
              }
              return [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Profit'];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="revenue" fill="#1976d2" name="Revenue" />
          <Bar yAxisId="left" dataKey="profit" fill="#2e7d32" name="Profit" />
          <Bar yAxisId="right" dataKey="quantity" fill="#ed6c02" name="Quantity" />
        </BarChart>
      </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default CategorySalesChart;
