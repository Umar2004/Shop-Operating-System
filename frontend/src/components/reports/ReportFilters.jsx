import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  ButtonGroup,
  Autocomplete,
  Chip,
  IconButton,
  Typography,
} from '@mui/material';
import { MdFilterList, MdClear } from 'react-icons/md';
import { api } from '../../api/client';

const DATE_PRESETS = {
  TODAY: 'today',
  THIS_WEEK: 'thisWeek',
  LAST_WEEK: 'lastWeek',
  THIS_MONTH: 'thisMonth',
  LAST_MONTH: 'lastMonth',
  YTD: 'ytd',
  CUSTOM: 'custom',
};

function ReportFilters({ filters, onFiltersChange }) {
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  // Load customers when autocomplete opens or search changes
  const loadCustomers = (searchTerm = '') => {
    setCustomerLoading(true);
    api
      .listCustomers(searchTerm || undefined)
      .then((data) => {
        setCustomers(data || []);
        setCustomerLoading(false);
      })
      .catch(() => {
        setCustomers([]);
        setCustomerLoading(false);
      });
  };

  // Load customers when autocomplete opens (if not already loading)
  useEffect(() => {
    if (customerOpen && !customerLoading) {
      loadCustomers(customerSearch);
    }
  }, [customerOpen]);

  // Update customers when search changes (debounced)
  useEffect(() => {
    if (customerSearch !== undefined) {
      const timeoutId = setTimeout(() => {
        loadCustomers(customerSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [customerSearch]);

  const getDateRange = (preset) => {
    const today = new Date();
    const start = new Date();
    const end = new Date();

    switch (preset) {
      case DATE_PRESETS.TODAY:
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case DATE_PRESETS.THIS_WEEK:
        const dayOfWeek = today.getDay();
        start.setDate(today.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case DATE_PRESETS.LAST_WEEK:
        const lastWeekDay = today.getDay();
        start.setDate(today.getDate() - lastWeekDay - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(today.getDate() - lastWeekDay - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case DATE_PRESETS.THIS_MONTH:
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(today.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case DATE_PRESETS.LAST_MONTH:
        start.setMonth(today.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case DATE_PRESETS.YTD:
        start.setMonth(0);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        return null;
    }

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  };

  const handlePresetClick = (preset) => {
    if (preset === DATE_PRESETS.CUSTOM) {
      onFiltersChange({ ...filters, preset: DATE_PRESETS.CUSTOM });
      return;
    }

    const dateRange = getDateRange(preset);
    if (dateRange) {
      onFiltersChange({
        ...filters,
        ...dateRange,
        preset,
      });
    }
  };

  const handleDateChange = (field, value) => {
    onFiltersChange({
      ...filters,
      [field]: value,
      preset: DATE_PRESETS.CUSTOM,
    });
  };

  const handleClearFilters = () => {
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - 1);
    
    onFiltersChange({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
      preset: DATE_PRESETS.THIS_MONTH,
      paymentType: 'ALL',
      customerId: null,
      customer: null,
      search: '',
    });
    setCustomerSearch('');
  };

  const activeFiltersCount = [
    filters.paymentType !== 'ALL',
    filters.customerId,
    filters.search,
  ].filter(Boolean).length;

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MdFilterList />
          <Typography variant="h6">Filters</Typography>
          {activeFiltersCount > 0 && (
            <Chip label={activeFiltersCount} size="small" color="primary" />
          )}
        </Box>
        {activeFiltersCount > 0 && (
          <IconButton size="small" onClick={handleClearFilters} title="Clear all filters">
            <MdClear />
          </IconButton>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Date Presets */}
        <ButtonGroup variant="outlined" size="small" sx={{ flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.TODAY)}
            variant={filters.preset === DATE_PRESETS.TODAY ? 'contained' : 'outlined'}
          >
            Today
          </Button>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.THIS_WEEK)}
            variant={filters.preset === DATE_PRESETS.THIS_WEEK ? 'contained' : 'outlined'}
          >
            This Week
          </Button>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.LAST_WEEK)}
            variant={filters.preset === DATE_PRESETS.LAST_WEEK ? 'contained' : 'outlined'}
          >
            Last Week
          </Button>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.THIS_MONTH)}
            variant={filters.preset === DATE_PRESETS.THIS_MONTH ? 'contained' : 'outlined'}
          >
            This Month
          </Button>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.LAST_MONTH)}
            variant={filters.preset === DATE_PRESETS.LAST_MONTH ? 'contained' : 'outlined'}
          >
            Last Month
          </Button>
          <Button
            onClick={() => handlePresetClick(DATE_PRESETS.YTD)}
            variant={filters.preset === DATE_PRESETS.YTD ? 'contained' : 'outlined'}
          >
            YTD
          </Button>
        </ButtonGroup>

        {/* Date Range */}
        <TextField
          label="Start Date"
          type="date"
          size="small"
          value={filters.startDate || ''}
          onChange={(e) => handleDateChange('startDate', e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: '150px' }}
        />
        <TextField
          label="End Date"
          type="date"
          size="small"
          value={filters.endDate || ''}
          onChange={(e) => handleDateChange('endDate', e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: '150px' }}
        />

        {/* Payment Type */}
        <FormControl size="small" sx={{ minWidth: '150px' }}>
          <InputLabel>Payment Type</InputLabel>
          <Select
            value={filters.paymentType || 'ALL'}
            label="Payment Type"
            onChange={(e) => onFiltersChange({ ...filters, paymentType: e.target.value })}
          >
            <MenuItem value="ALL">All</MenuItem>
            <MenuItem value="CASH">Cash</MenuItem>
            <MenuItem value="CARD">Card</MenuItem>
            <MenuItem value="CREDIT">Credit</MenuItem>
          </Select>
        </FormControl>

        {/* Customer Filter */}
        <Autocomplete
          size="small"
          options={customers}
          getOptionLabel={(option) => option.name || ''}
          value={filters.customer || null}
          onChange={(_, newValue) =>
            onFiltersChange({
              ...filters,
              customer: newValue,
              customerId: newValue?.id || null,
            })
          }
          onInputChange={(_, newValue) => setCustomerSearch(newValue)}
          onOpen={() => {
            setCustomerOpen(true);
            if (customers.length === 0) {
              loadCustomers();
            }
          }}
          onClose={() => setCustomerOpen(false)}
          loading={customerLoading}
          renderInput={(params) => (
            <TextField {...params} label="Customer" placeholder="Search customer..." />
          )}
          sx={{ minWidth: '200px' }}
          clearOnEscape
          noOptionsText={customerLoading ? 'Loading...' : 'No customers found'}
        />

        {/* Search */}
        <TextField
          label="Search Invoice #"
          size="small"
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Invoice number..."
          sx={{ minWidth: '180px' }}
        />
      </Box>
    </Paper>
  );
}

export default ReportFilters;
