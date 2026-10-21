import { useAuthStore } from '../store/authStore';

const API_BASE_URL =import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const token = window.localStorage.getItem('sop_token');

  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (fetchErr) {
    throw fetchErr;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let data = null;

  try {
    const text = await res.text();
    data = isJson && text ? JSON.parse(text) : null;
  } catch (parseErr) {
    throw parseErr;
  }

  if (!res.ok) {
    // 401: the login has ended (logged out elsewhere, password or role changed, reset, restore).
    // Clearing the store sends the router back to the login screen (the app uses hash routes, so
    // navigating to '/login' would only reload the app). A failed login attempt is not a session ending.
    if (res.status === 401 && path !== '/auth/login') {
      useAuthStore.getState().logout();
    }

    const message = data && data.message ? data.message : `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.response = { data }; // Attach response data for debugging
    error.statusText = res.statusText;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  // Fresh role and permissions, plus a renewed token
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getCurrentSession: () => request('/sessions/current'),
  startSession: (openingCash, businessDate) =>
    request('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ openingCash, businessDate }),
    }),
  endSession: (actualCash, skipBackup = false) =>
    request('/sessions/end', {
      method: 'POST',
      body: JSON.stringify({ actualCash, skipBackup }),
    }),
  listProducts: (q) =>
    request(q ? `/products?q=${encodeURIComponent(q)}` : '/products'),
  createProduct: (payload) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  adjustProductStock: (id, quantityChange, reason) =>
    request(`/products/${id}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({ quantityChange, reason }),
    }),
  bulkDeleteProducts: (ids) =>
    request('/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  listCustomers: (q) =>
    request(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers'),
  createCustomer: (payload) =>
    request('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCustomer: (id, payload) =>
    request(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getCustomerInvoices: (customerId) =>
    request(`/customers/${customerId}/invoices`),
  getCustomerPayments: (customerId) =>
    request(`/customers/${customerId}/payments`),
  getCustomerAdjustments: (customerId) =>
    request(`/customers/${customerId}/adjustments`),
  // payload: { type: 'WRITE_OFF' | 'REFUND' | 'CHARGE', amount, reason, invoiceId?, paymentType? }
  addCustomerAdjustment: (customerId, payload) =>
    request(`/customers/${customerId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  payCustomerCredit: (customerId, amount, paymentType, invoiceId) =>
    request(`/customers/${customerId}/pay-credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, paymentType, invoiceId }),
    }),
  listInvoices: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.paymentStatus) queryParams.append('paymentStatus', params.paymentStatus);
    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.search) queryParams.append('search', params.search);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    return request(`/invoices?${queryParams.toString()}`);
  },
  getInvoice: (invoiceId) => request(`/invoices/${invoiceId}`),
  getInvoicePayments: (invoiceId) => request(`/invoices/${invoiceId}/payments`),
  updateInvoice: (invoiceId, data) =>
    request(`/invoices/${invoiceId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updateInvoiceStatus: (invoiceId, paymentStatus) =>
    request(`/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus }),
    }),
  deleteInvoice: (invoiceId) =>
    request(`/invoices/${invoiceId}`, {
      method: 'DELETE',
    }),
  deletePayment: (paymentId) =>
    request(`/invoices/payments/${paymentId}`, {
      method: 'DELETE',
    }),
  createInvoice: (payload) =>
    request('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordExpense: (payload) =>
    request('/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateExpense: (id, payload) =>
    request(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteExpense: (id) =>
    request(`/expenses/${id}`, {
      method: 'DELETE',
    }),
  listExpenseCategories: () => request('/expense-categories'),
  createExpenseCategory: (name) =>
    request('/expense-categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteExpenseCategory: (id) =>
    request(`/expense-categories/${id}`, {
      method: 'DELETE',
    }),
  bulkDeleteExpenseCategories: (ids) =>
    request('/expense-categories/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  listExpenses: () => request('/expenses'),
  listProductCategories: () => request('/categories'),
  createProductCategory: (name) =>
    request('/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteProductCategory: (id) =>
    request(`/categories/${id}`, {
      method: 'DELETE',
    }),
  bulkDeleteProductCategories: (ids) =>
    request('/categories/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  getProductAlerts: () => request('/products/alerts'),
  downloadProductTemplate: async () => {
    const token = window.localStorage.getItem('sop_token');
    const res = await fetch(`${API_BASE_URL}/products/bulk-template`, {
      headers: token
        ? {
          Authorization: `Bearer ${token}`,
        }
        : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data && data.message ? data.message : 'Failed to download template';
      throw new Error(message);
    }
    return res.blob();
  },
  downloadAllProducts: async (status = 'ALL') => {
    const token = window.localStorage.getItem('sop_token');
    const url = `${API_BASE_URL}/products/download${status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : ''}`;
    const res = await fetch(url, {
      headers: token
        ? {
          Authorization: `Bearer ${token}`,
        }
        : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data && data.message ? data.message : 'Failed to download products';
      throw new Error(message);
    }
    return res.blob();
  },
  bulkUploadValidate: (formData) =>
    request('/products/bulk-upload/validate', {
      method: 'POST',
      body: formData,
    }),
  bulkUploadImport: (formData) =>
    request('/products/bulk-upload/import', {
      method: 'POST',
      body: formData,
    }),
  getBulkUploadProgress: (jobId) =>
    request(`/products/bulk-upload/progress/${jobId}`),
  getDaySummary: (date) =>
    request(`/reports/day-summary?date=${encodeURIComponent(date)}`),
  // Sales Reports
  getSalesTrends: (startDate, endDate, groupBy = 'day') =>
    request(`/reports/sales/trends?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&groupBy=${groupBy}`),
  getSalesByPaymentMethod: (startDate, endDate) =>
    request(`/reports/sales/payment-methods?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  getSalesByCategory: (startDate, endDate) =>
    request(`/reports/sales/by-category?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  getTopProducts: (startDate, endDate, limit = 10, sortBy = 'revenue') =>
    request(`/reports/sales/top-products?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=${limit}&sortBy=${sortBy}`),
  getSalesSummary: (startDate, endDate) =>
    request(`/reports/sales/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  getStockValuation: (search = '', categoryId = '') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categoryId) params.append('categoryId', categoryId);
    return request(`/reports/stock-valuation?${params.toString()}`);
  },
  getSalesDetail: (filters) => {
    const params = new URLSearchParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    });
    if (filters.paymentType && filters.paymentType !== 'ALL') {
      params.append('paymentType', filters.paymentType);
    }
    if (filters.customerId) {
      params.append('customerId', filters.customerId);
    }
    if (filters.search) {
      params.append('search', filters.search);
    }
    return request(`/reports/sales/detail?${params.toString()}`);
  },
  // Settings
  getSettings: () => request('/settings'),
  getSetting: (key) => request(`/settings/${encodeURIComponent(key)}`),
  updateSetting: (key, value) =>
    request(`/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  updateSettings: (settings) =>
    request('/settings/bulk', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),
  createBackup: () => request('/settings/backup', { method: 'POST' }),
  listBackups: () => request('/settings/backups'),
  getBackupSchedule: () => request('/settings/backup/schedule'),
  updateBackupSchedule: (schedule) => request('/settings/backup/schedule', {
    method: 'PUT',
    body: JSON.stringify(schedule),
  }),
  validateBackupPath: (path) => request('/settings/backup/validate-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }),
  testBackupPath: (path) => request('/settings/backup/test-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }),
  uploadBackup: async (file) => {
    const token = window.localStorage.getItem('sop_token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/settings/backup/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) {
      const message = data && data.message ? data.message : 'Request failed';
      throw new Error(message);
    }
    return data;
  },
  restoreBackup: (filename) =>
    request(`/settings/backup/restore/${encodeURIComponent(filename)}`, {
      method: 'POST',
    }),
  deleteBackup: (filename) =>
    request(`/settings/backup/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
  resetSystem: (confirmation) =>
    request('/settings/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    }),
  uploadLogo: async (file) => {
    const token = window.localStorage.getItem('sop_token');
    const formData = new FormData();
    formData.append('logo', file);
    const res = await fetch(`${API_BASE_URL}/settings/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) {
      const message = data && data.message ? data.message : 'Request failed';
      throw new Error(message);
    }
    return data;
  },
  getLogoUrl: () => `${API_BASE_URL}/settings/logo`,
  getShopInfo: () => request('/settings/shop-info'),
  // Users
  listUsers: () => request('/users'),
  getUser: (id) => request(`/users/${id}`),
  createUser: (userData) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),
  updateUser: (id, userData) =>
    request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),
  deleteUser: (id) =>
    request(`/users/${id}`, {
      method: 'DELETE',
    }),
  listRoles: () => request('/users/roles'),
  getAvailablePermissions: () => request('/users/permissions/available'),
  getUserPermissions: (id) => request(`/users/${id}/permissions`),
  updateUserPermissions: (id, permissions) =>
    request(`/users/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
  // Printer settings
  getPrinterSettings: () => request('/settings/printer'),
  updatePrinterSettings: (settings) =>
    request('/settings/printer', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getReceiptSettings: () => request('/settings/receipt'),
  updateReceiptSettings: (settings) =>
    request('/settings/receipt', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  // Electron IPC printer methods (only available in Electron)
  getPrinters: async () => {
    if (window.electronAPI) {
      return await window.electronAPI.getPrinters();
    }
    throw new Error('Electron API not available');
  },
  listUsbPrinters: async () => {
    if (window.electronAPI) {
      return await window.electronAPI.listUsbPrinters();
    }
    return [];
  },
  printReceipt: async (options) => {
    if (window.electronAPI) {
      return await window.electronAPI.print(options);
    }
    throw new Error('Electron API not available');
  },
  printReceiptDirect: async (options) => {
    if (window.electronAPI) {
      return await window.electronAPI.printDirect(options);
    }
    throw new Error('Electron API not available');
  },
};

export { API_BASE_URL };


