import { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  Box,
  Skeleton,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import { MdDownload, MdVisibility } from 'react-icons/md';
import { exportToCSV } from '../../utils/exportUtils';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';

function SalesDetailTable({ data, loading, total, limit, offset, onPageChange, onRowClick, filters }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(limit || 50);

  if (loading) {
    return (
      <Paper sx={{ p: 3 }}>
        <Skeleton variant="text" width="40%" height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={400} />
      </Paper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sales Detail
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Typography variant="body2" color="text.secondary">
            No sales data available for the selected filters
          </Typography>
        </Box>
      </Paper>
    );
  }

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    if (onPageChange) {
      onPageChange(newPage * rowsPerPage, rowsPerPage);
    }
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    if (onPageChange) {
      onPageChange(0, newRowsPerPage);
    }
  };

  const handleExport = () => {
    const headers = ['Invoice #', 'Date', 'Customer', 'Amount', 'Cost', 'Discount', 'Profit', 'Payment Status', 'Payment Details'];
    const rows = data.map((invoice) => [
      invoice.invoice_number,
      new Date(invoice.date_time).toLocaleString(),
      invoice.customer_name || 'Walk-in',
      formatNumber(invoice.total_amount),
      formatNumber(invoice.total_cost),
      formatNumber(invoice.discount),
      formatNumber(invoice.profit),
      invoice.payment_status,
      invoice.payment_details || '',
    ]);

    const filename = `sales-report-${filters?.startDate || 'start'}-${filters?.endDate || 'end'}.csv`;
    exportToCSV(headers, rows, filename);
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'PARTIAL':
        return 'warning';
      case 'CREDIT':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Sales Detail</Typography>
        <Tooltip title="Export to CSV">
          <IconButton onClick={handleExport} color="primary">
            <MdDownload />
          </IconButton>
        </Tooltip>
      </Box>
      <TableContainer sx={{ maxHeight: { xs: 400, md: 600 }, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Invoice #</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Cost</TableCell>
              <TableCell align="right">Discount</TableCell>
              <TableCell align="right">Profit</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((invoice) => (
              <TableRow key={invoice.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{invoice.invoice_number}</TableCell>
                <TableCell>{new Date(invoice.date_time).toLocaleString()}</TableCell>
                <TableCell>{invoice.customer_name || 'Walk-in'}</TableCell>
                <TableCell align="right">{formatCurrency(invoice.total_amount || 0)}</TableCell>
                <TableCell align="right">{formatCurrency(invoice.total_cost || 0)}</TableCell>
                <TableCell align="right">{formatCurrency(invoice.discount || 0)}</TableCell>
                <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                  {formatCurrency(invoice.profit || 0)}
                </TableCell>
                <TableCell>
                  <Chip
                    label={invoice.payment_status}
                    size="small"
                    color={getPaymentStatusColor(invoice.payment_status)}
                  />
                </TableCell>
                <TableCell>
                  {onRowClick && (
                    <Tooltip title="View Details">
                      <IconButton size="small" onClick={() => onRowClick(invoice)}>
                        <MdVisibility />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total || 0}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Paper>
  );
}

export default SalesDetailTable;
