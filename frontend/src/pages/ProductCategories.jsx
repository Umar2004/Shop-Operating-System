import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  TextField,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Grid,
  Checkbox,
  IconButton,
  Toolbar,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { api } from '../api/client';
import { useConfirmDialog } from '../utils/confirmDialog';

function ProductCategories() {
  const [productName, setProductName] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [productCategories, setProductCategories] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [selectedProductCategories, setSelectedProductCategories] = useState([]);
  const [selectedExpenseCategories, setSelectedExpenseCategories] = useState([]);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const loadProductCategories = () => {
    api
      .listProductCategories()
      .then((data) => {
        setProductCategories(data);
        setSelectedProductCategories([]);
      })
      .catch((err) => toast.error(err.message));
  };

  const loadExpenseCategories = () => {
    api
      .listExpenseCategories()
      .then((data) => {
        setExpenseCategories(data);
        setSelectedExpenseCategories([]);
      })
      .catch((err) => toast.error(err.message));
  };

  useEffect(() => {
    loadProductCategories();
    loadExpenseCategories();
  }, []);

  const handleAddProductCategory = async () => {
    if (!productName.trim()) return;
    try {
      await api.createProductCategory(productName.trim());
      setProductName('');
      toast.success('Product category added');
      loadProductCategories();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddExpenseCategory = async () => {
    if (!expenseName.trim()) return;
    try {
      await api.createExpenseCategory(expenseName.trim());
      setExpenseName('');
      toast.success('Expense category added');
      loadExpenseCategories();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteProductCategory = async (id, name) => {
    confirm(
      `Delete product category "${name}"?`,
      async () => {
        try {
          await api.deleteProductCategory(id);
          toast.success('Product category deleted');
          loadProductCategories();
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  };

  const handleBulkDeleteProductCategories = async () => {
    if (selectedProductCategories.length === 0) return;
    confirm(
      `Delete ${selectedProductCategories.length} selected product categor${selectedProductCategories.length === 1 ? 'y' : 'ies'}?`,
      async () => {
        try {
          const res = await api.bulkDeleteProductCategories(selectedProductCategories);
          if (res.errors && res.errors.length > 0) {
            toast.warning(`Deleted ${res.deleted}, ${res.errors.length} failed`);
            res.errors.forEach((err) => {
              toast.error(`Category ID ${err.id}: ${err.error}`);
            });
          } else {
            toast.success(`${res.deleted} categor${res.deleted === 1 ? 'y' : 'ies'} deleted`);
          }
          loadProductCategories();
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  };

  const handleDeleteExpenseCategory = async (id, name) => {
    confirm(
      `Delete expense category "${name}"?`,
      async () => {
        try {
          await api.deleteExpenseCategory(id);
          toast.success('Expense category deleted');
          loadExpenseCategories();
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  };

  const handleBulkDeleteExpenseCategories = async () => {
    if (selectedExpenseCategories.length === 0) return;
    confirm(
      `Delete ${selectedExpenseCategories.length} selected expense categor${selectedExpenseCategories.length === 1 ? 'y' : 'ies'}?`,
      async () => {
        try {
          const res = await api.bulkDeleteExpenseCategories(selectedExpenseCategories);
          if (res.errors && res.errors.length > 0) {
            toast.warning(`Deleted ${res.deleted}, ${res.errors.length} failed`);
            res.errors.forEach((err) => {
              toast.error(`Category ID ${err.id}: ${err.error}`);
            });
          } else {
            toast.success(`${res.deleted} categor${res.deleted === 1 ? 'y' : 'ies'} deleted`);
          }
          loadExpenseCategories();
        } catch (err) {
          toast.error(err.message);
        }
      }
    );
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Categories
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Product Categories
            </Typography>
            <Box
              sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <TextField
                label="Category name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
              <Button variant="contained" onClick={handleAddProductCategory}>
                Save
              </Button>
            </Box>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Toolbar sx={{ p: 0, mb: 1, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="subtitle1">
                Product Category List
              </Typography>
              {selectedProductCategories.length > 0 && (
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<Delete />}
                  onClick={handleBulkDeleteProductCategories}
                >
                  Delete Selected ({selectedProductCategories.length})
                </Button>
              )}
            </Toolbar>
            {productCategories.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No product categories yet. Add your first category above.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={
                          productCategories.length > 0 &&
                          selectedProductCategories.length === productCategories.length
                        }
                        indeterminate={
                          selectedProductCategories.length > 0 &&
                          selectedProductCategories.length < productCategories.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductCategories(productCategories.map((c) => c.id));
                          } else {
                            setSelectedProductCategories([]);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {productCategories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedProductCategories.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProductCategories((prev) => [...prev, c.id]);
                            } else {
                              setSelectedProductCategories((prev) =>
                                prev.filter((id) => id !== c.id)
                              );
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>{c.id}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteProductCategory(c.id, c.name)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Expense Categories
            </Typography>
            <Box
              sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <TextField
                label="Category name"
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
              />
              <Button variant="contained" color="error" onClick={handleAddExpenseCategory}>
                Save
              </Button>
            </Box>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Toolbar sx={{ p: 0, mb: 1, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="subtitle1">
                Expense Category List
              </Typography>
              {selectedExpenseCategories.length > 0 && (
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<Delete />}
                  onClick={handleBulkDeleteExpenseCategories}
                >
                  Delete Selected ({selectedExpenseCategories.length})
                </Button>
              )}
            </Toolbar>
            {expenseCategories.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No expense categories yet. Add your first category above.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={
                          expenseCategories.length > 0 &&
                          selectedExpenseCategories.length === expenseCategories.length
                        }
                        indeterminate={
                          selectedExpenseCategories.length > 0 &&
                          selectedExpenseCategories.length < expenseCategories.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExpenseCategories(expenseCategories.map((c) => c.id));
                          } else {
                            setSelectedExpenseCategories([]);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {expenseCategories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedExpenseCategories.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExpenseCategories((prev) => [...prev, c.id]);
                            } else {
                              setSelectedExpenseCategories((prev) =>
                                prev.filter((id) => id !== c.id)
                              );
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>{c.id}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteExpenseCategory(c.id, c.name)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>
      <ConfirmDialog />
    </Box>
  );
}

export default ProductCategories;


