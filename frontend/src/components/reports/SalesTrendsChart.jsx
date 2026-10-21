import { useState, useEffect } from 'react';
import { Box, Paper, Typography, ToggleButton, ToggleButtonGroup, Skeleton } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/numberFormat';

function SalesTrendsChart({ data, loading, startDate, endDate }) {
  const [groupBy, setGroupBy] = useState('day');
  const [chartData, setChartData] = useState(data || []);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (startDate && endDate && groupBy) {
      setChartLoading(true);
      api
        .getSalesTrends(startDate, endDate, groupBy)
        .then((trends) => {
          setChartData(trends);
          setChartLoading(false);
        })
        .catch(() => {
          setChartLoading(false);
        });
    } else {
      setChartData(data || []);
    }
  }, [startDate, endDate, groupBy]);

  const isLoading = loading || chartLoading;

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Skeleton variant="text" width="40%" height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={500} />
      </Paper>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sales Trends
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
          <Typography variant="body2" color="text.secondary">
            No data available for the selected period
          </Typography>
        </Box>
      </Paper>
    );
  }


  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Sales Trends</Typography>
        <ToggleButtonGroup
          value={groupBy}
          exclusive
          onChange={(_, newValue) => newValue && setGroupBy(newValue)}
          size="small"
        >
          <ToggleButton value="day">Daily</ToggleButton>
          <ToggleButton value="week">Weekly</ToggleButton>
          <ToggleButton value="month">Monthly</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ width: '100%', height: { xs: 350, sm: 450, md: 500 } }}>
        <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip
            formatter={(value, name) => {
              if (name === 'transaction_count') {
                return [value, 'Transactions'];
              }
              return [formatCurrency(value), name === 'revenue' ? 'Revenue' : name === 'profit' ? 'Profit' : 'Cost'];
            }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            stroke="#1976d2"
            strokeWidth={2}
            name="Revenue"
            dot={{ r: 4 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="profit"
            stroke="#2e7d32"
            strokeWidth={2}
            name="Profit"
            dot={{ r: 4 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="transaction_count"
            stroke="#ed6c02"
            strokeWidth={2}
            name="Transactions"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default SalesTrendsChart;
