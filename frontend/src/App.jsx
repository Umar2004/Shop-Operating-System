import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sell from './pages/Sell';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Expenses from './pages/Expenses';
import ProductCategories from './pages/ProductCategories';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Invoices from './pages/Invoices';
import { useAuthStore } from './store/authStore';
import './App.css';

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PermissionRoute({ children, permission, adminOnly }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  // Admin has access to everything
  if (user?.role === 'ADMIN') {
    return children;
  }
  
  // Check admin-only routes
  if (adminOnly && user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  
  // Check permission
  if (permission && user?.permissions) {
    if (!user.permissions.includes(permission)) {
      return <Navigate to="/" replace />;
    }
  }
  
  return children;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<PermissionRoute permission="dashboard"><Dashboard /></PermissionRoute>} />
          <Route path="sell" element={<PermissionRoute permission="sell"><Sell /></PermissionRoute>} />
          <Route path="products" element={<PermissionRoute permission="products"><Products /></PermissionRoute>} />
          <Route path="product-categories" element={<PermissionRoute permission="categories"><ProductCategories /></PermissionRoute>} />
          <Route path="customers" element={<PermissionRoute permission="customers"><Customers /></PermissionRoute>} />
          <Route path="invoices" element={<PermissionRoute permission="invoices"><Invoices /></PermissionRoute>} />
          <Route path="reports" element={<PermissionRoute permission="reports"><Reports /></PermissionRoute>} />
          <Route path="expenses" element={<PermissionRoute permission="expenses"><Expenses /></PermissionRoute>} />
          <Route path="settings" element={<PermissionRoute permission="settings"><Settings /></PermissionRoute>} />
          <Route path="users" element={<PermissionRoute adminOnly><Users /></PermissionRoute>} />
        </Route>
      </Routes>
      <ToastContainer
        position="bottom-center"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </HashRouter>
  );
}

export default App;

