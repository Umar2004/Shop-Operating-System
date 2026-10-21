import { Fragment, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';

// Who did what, when: the activity log, newest first
const ACTION_LABELS = {
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Failed login',
  LOGOUT: 'Logged out',
  PASSWORD_CHANGED: 'Changed own password',
  PASSWORD_CHANGE_FAILED: 'Password change failed',
  PASSWORD_RESET_BY_ADMIN: 'Set a temporary password',
  PASSWORD_RECOVERED: 'Password reset with recovery key',
  RECOVERY_FAILED: 'Recovery key attempt failed',
  RECOVERY_KEY_CREATED: 'Created recovery key',
  ADMIN_PASSWORD_RESET_OFFLINE: 'Admin password reset at the PC',
  USER_CREATED: 'Created user',
  USER_RENAMED: 'Renamed user',
  USER_DELETED: 'Deleted user',
  USER_ACTIVATED: 'Activated user',
  USER_DEACTIVATED: 'Deactivated user',
  ROLE_CHANGED: 'Changed role',
  PERMISSIONS_CHANGED: 'Changed page access',
  SALE: 'Sale',
  INVOICE_EDITED: 'Edited invoice',
  INVOICE_DELETED: 'Deleted invoice',
  PRICE_OVERRIDE: 'Price changed at sale',
  LINE_DISCOUNT: 'Line discount',
  INVOICE_DISCOUNT: 'Invoice discount',
  LOW_MARGIN_CONFIRMED: 'Priced at or below cost',
  PAYMENT_DELETED: 'Deleted payment',
  CREDIT_PAYMENT_RECEIVED: 'Credit repayment',
  BALANCE_ADJUSTMENT: 'Write-off / refund / charge',
  CREDIT_CARRY_OVER: 'Balances carried over (upgrade)',
  CREDIT_REVIEW_APPLIED: 'Credit review applied',
  CREDIT_REVIEW_ROLLED_BACK: 'Credit review rolled back',
  PRODUCT_CREATED: 'Added product',
  PRODUCT_UPDATED: 'Changed product',
  PRODUCT_DEACTIVATED: 'Removed product',
  PRODUCTS_BULK_DEACTIVATED: 'Removed products (bulk)',
  PRODUCTS_IMPORTED: 'Imported products',
  STOCK_ADJUSTED: 'Adjusted stock',
  CATEGORY_CREATED: 'Added category',
  CATEGORY_DELETED: 'Removed category',
  EXPENSE_CATEGORY_CREATED: 'Added expense category',
  EXPENSE_CATEGORY_DELETED: 'Removed expense category',
  EXPENSE_RECORDED: 'Recorded expense',
  EXPENSE_UPDATED: 'Changed expense',
  EXPENSE_DELETED: 'Deleted expense',
  CUSTOMER_CREATED: 'Added customer',
  CUSTOMER_UPDATED: 'Changed customer',
  CUSTOMER_DEACTIVATED: 'Removed customer',
  DAY_OPENED: 'Opened the day',
  DAY_CLOSED: 'Closed the day',
  SETTINGS_CHANGED: 'Changed settings',
  BACKUP_CREATED: 'Backup made',
  BACKUP_FAILED: 'Backup failed',
  BACKUP_UPLOADED: 'Backup uploaded',
  BACKUP_RESTORED: 'Backup restored',
  BACKUP_DELETED: 'Backup deleted',
  SYSTEM_RESET: 'System reset',
  ACTIVITY_LOG_PRUNED: 'Old activity removed',
};
const WARN = new Set(['LOGIN_FAILED', 'RECOVERY_FAILED', 'PASSWORD_CHANGE_FAILED', 'INVOICE_DELETED', 'PAYMENT_DELETED', 'BACKUP_FAILED', 'BACKUP_RESTORED',
  'SYSTEM_RESET', 'ADMIN_PASSWORD_RESET_OFFLINE', 'PRICE_OVERRIDE', 'LOW_MARGIN_CONFIRMED', 'USER_DELETED']);
const label = (a) => ACTION_LABELS[a] || a;
const when = (ts) => new Date(`${String(ts).replace(' ', 'T')}Z`).toLocaleString();
const show = (v) => (v === null || v === undefined || v === '' ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// One line saying what the row is about
function summary(row) {
  const d = row.details || {};
  const parts = [];
  for (const k of ['invoice_number', 'name', 'username', 'product_name', 'file', 'business_date']) if (d[k]) parts.push(d[k]);
  if (d.amount !== undefined) parts.push(`amount ${show(d.amount)}`);
  if (d.total !== undefined) parts.push(`total ${show(d.total)}`);
  if (d.type && row.action === 'BALANCE_ADJUSTMENT') parts.unshift(d.type.replace('_', '-').toLowerCase());
  if (d.keys) parts.push(d.keys.join(', '));
  if (d.reason) parts.push(d.reason);
  if (d.count !== undefined) parts.push(`${d.count} item(s)`);
  if (d.difference !== undefined) parts.push(`cash difference ${show(d.difference)}`);
  return parts.join(' · ');
}

function Details({ row }) {
  const d = row.details || {};
  const { before, after, ...rest } = d;
  const fields = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  return (
    <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
      {fields.length > 0 && (
        <Table size="small" sx={{ mb: 1, maxWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell>Field</TableCell>
              <TableCell>Before</TableCell>
              <TableCell>After</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((f) => (
              <TableRow key={f}>
                <TableCell>{f}</TableCell>
                <TableCell sx={{ wordBreak: 'break-word' }}>{show(before ? before[f] : undefined)}</TableCell>
                <TableCell sx={{ wordBreak: 'break-word', fontWeight: 600 }}>{show(after ? after[f] : undefined)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {Object.entries(rest).map(([k, v]) => (
        <Typography key={k} variant="body2" sx={{ wordBreak: 'break-word' }}>
          <strong>{k}:</strong> {show(v)}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary">
        Record: {row.entity_type || '-'} {row.entity_id ?? ''} · entry #{row.id}
      </Typography>
    </Box>
  );
}

const EMPTY = { userId: '', actions: [], entityType: '', from: '', to: '', q: '' };

function ActivityLog() {
  const [filters, setFilters] = useState(EMPTY);
  const [options, setOptions] = useState({ actions: [], entityTypes: [], users: [] });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [open, setOpen] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getActivityFilters().then(setOptions).catch((err) => toast.error(err.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      api
        .getActivityPage({ ...filters, action: filters.actions.join(','), page, pageSize })
        .then((res) => setData(res))
        .catch((err) => toast.error(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, page, pageSize]);

  const set = (patch) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Activity Log
      </Typography>
      <Paper sx={{ p: 2, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>User</InputLabel>
          <Select label="User" value={filters.userId} onChange={(e) => set({ userId: e.target.value })}>
            <MenuItem value="">Everyone</MenuItem>
            {options.users.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.username}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220, maxWidth: '100%' }}>
          <InputLabel>What</InputLabel>
          <Select
            multiple
            label="What"
            value={filters.actions}
            onChange={(e) => set({ actions: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
            input={<OutlinedInput label="What" />}
            renderValue={(sel) => sel.map(label).join(', ')}
          >
            {options.actions.map((a) => (
              <MenuItem key={a.action} value={a.action}>
                {label(a.action)} ({a.n})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Record</InputLabel>
          <Select label="Record" value={filters.entityType} onChange={(e) => set({ entityType: e.target.value })}>
            <MenuItem value="">Any</MenuItem>
            {options.entityTypes.map((t) => (
              <MenuItem key={t.entityType} value={t.entityType}>
                {t.entityType.toLowerCase()} ({t.n})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        <TextField size="small" label="Search" placeholder="name, invoice no., …" value={filters.q} onChange={(e) => set({ q: e.target.value })} sx={{ flexGrow: 1, minWidth: 160 }} />
        <Button onClick={() => set(EMPTY)}>Clear</Button>
      </Paper>

      <Paper>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>What</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      {loading ? 'Loading…' : 'Nothing matches these filters.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpen((o) => ({ ...o, [row.id]: !o[row.id] }))}>
                    <TableCell padding="checkbox">
                      <IconButton size="small" aria-label="show details">
                        {open[row.id] ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(row.created_at)}</TableCell>
                    <TableCell>{row.username || (row.user_id ? `user #${row.user_id}` : 'the app')}</TableCell>
                    <TableCell>
                      <Chip size="small" label={label(row.action)} color={WARN.has(row.action) ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 480, wordBreak: 'break-word' }}>{summary(row)}</TableCell>
                  </TableRow>
                  {open[row.id] && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Details row={row} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Box>
        <TablePagination
          component="div"
          count={data.total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 200]}
        />
      </Paper>
    </Box>
  );
}

export default ActivityLog;
