import { useEffect, useState, useMemo } from 'react';
import {
  Box, Card, CardContent, Chip, CircularProgress, Grid,
  InputAdornment, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { MdSearch, MdInventory, MdTrendingUp, MdWarning, MdRemoveShoppingCart } from 'react-icons/md';
import { api } from '../../api/client';
import { formatCurrency } from '../../utils/numberFormat';

// Small KPI card
function ValuationCard({ label, value, sub, color }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} color={color || 'text.primary'}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function StockValuationTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api.getStockValuation(debouncedSearch)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const items = data?.items || [];
  const totals = data?.totals || {};

  // Group by category for display
  const grouped = useMemo(() => {
    const map = {};
    items.forEach(item => {
      const cat = item.category_name || 'Uncategorized';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [items]);

  const stockStatusChip = (status) => {
    if (status === 'out')  return <Chip label="Out of Stock" color="error"   size="small" />;
    if (status === 'low')  return <Chip label="Low Stock"    color="warning" size="small" />;
    return <Chip label="In Stock" color="success" size="small" />;
  };

  return (
    <Box>
      {/* KPI Summary row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Total Products"
            value={totals.totalItems ?? '—'}
            sub={`${totals.totalUnits ?? 0} units`}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Cost Value"
            value={formatCurrency(totals.totalCostValue ?? 0)}
            sub="Total at cost price"
            color="primary.main"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Selling Value"
            value={formatCurrency(totals.totalSellingValue ?? 0)}
            sub="Total at selling price"
            color="success.main"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Potential Profit"
            value={formatCurrency(totals.totalPotentialProfit ?? 0)}
            sub="If all stock sold"
            color="info.main"
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Low Stock"
            value={totals.lowStock ?? 0}
            sub="At or below minimum"
            color={totals.lowStock > 0 ? 'warning.main' : 'text.primary'}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <ValuationCard
            label="Out of Stock"
            value={totals.outOfStock ?? 0}
            sub="Zero units remaining"
            color={totals.outOfStock > 0 ? 'error.main' : 'text.primary'}
          />
        </Grid>
      </Grid>

      {/* Search */}
      <TextField
        size="small"
        placeholder="Search product or category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <MdSearch />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2, width: 320 }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No products found.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.100' } }}>
                <TableCell>Product</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Unit</TableCell>
                <TableCell align="right">Stock Qty</TableCell>
                <TableCell align="right">Min Stock</TableCell>
                <TableCell align="right">Cost Price</TableCell>
                <TableCell align="right">Selling Price</TableCell>
                <TableCell align="right">Cost Value</TableCell>
                <TableCell align="right">Selling Value</TableCell>
                <TableCell align="right">Potential Profit</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(grouped).map(([category, catItems]) => (
                <>
                  {/* Category header row */}
                  <TableRow key={`cat-${category}`} sx={{ bgcolor: 'primary.50' }}>
                    <TableCell
                      colSpan={11}
                      sx={{ fontWeight: 700, color: 'primary.main', py: 0.5 }}
                    >
                      {category} ({catItems.length} product{catItems.length !== 1 ? 's' : ''})
                    </TableCell>
                  </TableRow>

                  {catItems.map((item) => (
                    <TableRow
                      key={item.id}
                      sx={{
                        bgcolor:
                          item.stock_status === 'out' ? 'error.50' :
                          item.stock_status === 'low' ? 'warning.50' : 'inherit',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>{item.name}</TableCell>
                      <TableCell>{item.category_name || '—'}</TableCell>
                      <TableCell align="right">{item.unit || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {item.current_stock}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {item.minimum_stock || 0}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(item.cost_price)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.selling_price)}</TableCell>
                      <TableCell align="right" sx={{ color: 'primary.main' }}>
                        {formatCurrency(item.cost_value)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                        {formatCurrency(item.selling_value)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'info.main' }}>
                        {formatCurrency(item.potential_profit)}
                      </TableCell>
                      <TableCell align="center">{stockStatusChip(item.stock_status)}</TableCell>
                    </TableRow>
                  ))}

                  {/* Category subtotal */}
                  <TableRow key={`sub-${category}`} sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={7} sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary' }}>
                      {category} subtotal
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {formatCurrency(catItems.reduce((s, i) => s + (i.cost_value || 0), 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {formatCurrency(catItems.reduce((s, i) => s + (i.selling_value || 0), 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'info.main' }}>
                      {formatCurrency(catItems.reduce((s, i) => s + (i.potential_profit || 0), 0))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              ))}

              {/* Grand Total */}
              <TableRow sx={{ bgcolor: 'grey.200', '& td': { fontWeight: 800 } }}>
                <TableCell colSpan={7}>GRAND TOTAL ({totals.totalItems} products · {totals.totalUnits} units)</TableCell>
                <TableCell align="right" sx={{ color: 'primary.main' }}>
                  {formatCurrency(totals.totalCostValue)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'success.main' }}>
                  {formatCurrency(totals.totalSellingValue)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'info.main' }}>
                  {formatCurrency(totals.totalPotentialProfit)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
