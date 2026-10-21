import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Box,
    Skeleton,
} from '@mui/material';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';

function DailyReportsTable({ data, loading }) {
    if (loading) {
        return (
            <Box sx={{ mt: 2 }}>
                <Skeleton variant="rectangular" height={400} />
            </Box>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
                <Typography color="text.secondary">No daily data available for this period.</Typography>
            </Paper>
        );
    }

    return (
        <TableContainer component={Paper} sx={{ mt: 2, maxHeight: 600 }}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Transactions</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Revenue</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cost</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Profit</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Margin</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map((row) => {
                        const margin = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(2) : 0;
                        return (
                            <TableRow key={row.period} hover>
                                <TableCell>{row.period}</TableCell>
                                <TableCell align="right">{formatNumber(row.transaction_count)}</TableCell>
                                <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                                <TableCell align="right">{formatCurrency(row.cost)}</TableCell>
                                <TableCell align="right" sx={{ color: row.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 500 }}>
                                    {formatCurrency(row.profit)}
                                </TableCell>
                                <TableCell align="right">{margin}%</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default DailyReportsTable;
