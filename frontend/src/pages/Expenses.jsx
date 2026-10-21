import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Autocomplete,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useConfirmDialog } from '../utils/confirmDialog';

function Expenses() {
  const user = useAuthStore((s) => s.user);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  // Edit State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editForm, setEditForm] = useState({
    category: '',
    description: '',
    amount: '',
  });

  const loadExpenses = () => {
    api
      .listExpenses()
      .then((data) => setExpenses(data))
      .catch((err) => toast.error(err.message));
  };

  const loadCategories = () => {
    api
      .listExpenseCategories()
      .then((data) => setCategories(data))
      .catch(() => { });
  };

  useEffect(() => {
    loadExpenses();
    loadCategories();
  }, []);

  const handleSave = async () => {
    if (!category || !amount) {
      toast.error('Category and amount are required');
      return;
    }
    try {
      await api.recordExpense({
        category,
        description,
        amount: Number(amount) || 0,
      });
      setCategory('');
      setDescription('');
      setAmount('');
      toast.success('Expense recorded');
      loadExpenses();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = (expense) => {
    confirm(
      `Are you sure you want to delete this expense of ${expense.amount.toFixed(2)} (${expense.category})?`,
      async () => {
        try {
          await api.deleteExpense(expense.id);
          toast.success('Expense deleted');
          loadExpenses();
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  };

  const handleOpenEdit = (expense) => {
    setEditingExpense(expense);
    setEditForm({
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount,
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editForm.category || !editForm.amount) {
      toast.error('Category and amount are required');
      return;
    }
    try {
      await api.updateExpense(editingExpense.id, {
        category: editForm.category,
        description: editForm.description,
        amount: Number(editForm.amount) || 0,
      });
      setEditDialogOpen(false);
      toast.success('Expense updated');
      loadExpenses();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Expenses
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Add Expense
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
          <Autocomplete
            freeSolo
            options={categories.map((c) => c.name)}
            value={category}
            onChange={(_, newValue) => setCategory(newValue || '')}
            sx={{ minWidth: 200 }}
            renderInput={(params) => <TextField {...params} label="Category" size="small" />}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            sx={{ flexGrow: 1, minWidth: 200 }}
          />
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            size="small"
            sx={{ width: 150 }}
          />
          <Button variant="contained" color="error" onClick={handleSave} sx={{ height: 40 }}>
            Save Expense
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Today&apos;s Expenses
        </Typography>
        {expenses.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No expenses recorded for this session.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>{new Date(e.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {e.amount.toFixed(2)}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit">
                      <IconButton size="small" color="primary" onClick={() => handleOpenEdit(e)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(e)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Expense</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Autocomplete
              freeSolo
              options={categories.map((c) => c.name)}
              value={editForm.category}
              onChange={(_, newValue) => setEditForm({ ...editForm, category: newValue || '' })}
              fullWidth
              renderInput={(params) => <TextField {...params} label="Category" />}
            />
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
            />
            <TextField
              label="Amount"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleUpdate}>
            Update Expense
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog />
    </Box>
  );
}

export default Expenses;


