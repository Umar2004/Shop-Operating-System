import { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  Box,
  Skeleton,
  Chip,
} from '@mui/material';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';

function TopProductsTable({ data, loading, onProductClick }) {
  const [sortBy, setSortBy] = useState('revenue');
  const [sortOrder, setSortOrder] = useState('desc');

  if (loading) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Skeleton variant="text" width="40%" height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={400} />
      </Paper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Top Products
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Typography variant="body2" color="text.secondary">
            No product data available
          </Typography>
        </Box>
      </Paper>
    );
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = parseFloat(a[sortBy] || 0);
    const bVal = parseFloat(b[sortBy] || 0);
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Top Products
      </Typography>
      <TableContainer sx={{ maxHeight: { xs: 400, md: 600 }, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Rank</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'revenue'}
                  direction={sortBy === 'revenue' ? sortOrder : 'asc'}
                  onClick={() => handleSort('revenue')}
                >
                  Revenue
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'quantity'}
                  direction={sortBy === 'quantity' ? sortOrder : 'asc'}
                  onClick={() => handleSort('quantity')}
                >
                  Quantity
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'profit'}
                  direction={sortBy === 'profit' ? sortOrder : 'asc'}
                  onClick={() => handleSort('profit')}
                >
                  Profit
                </TableSortLabel>
              </TableCell>
              <TableCell>Avg Price</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedData.map((product, index) => (
              <TableRow
                key={product.id}
                hover
                onClick={() => onProductClick && onProductClick(product)}
                sx={{ cursor: onProductClick ? 'pointer' : 'default' }}
              >
                <TableCell>
                  <Chip label={index + 1} size="small" color="primary" variant="outlined" />
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{product.name}</TableCell>
                <TableCell>
                  <Chip label={product.category_name || 'Uncategorized'} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{formatCurrency(product.revenue || 0)}</TableCell>
                <TableCell>{formatNumber(product.quantity || 0)}</TableCell>
                <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>
                  {formatCurrency(product.profit || 0)}
                </TableCell>
                <TableCell>{formatCurrency(product.avg_price || 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default TopProductsTable;
