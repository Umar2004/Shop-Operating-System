import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  alpha,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { FaCashRegister, FaUsers, FaChartBar, FaCogs } from 'react-icons/fa';
import { MdDashboard, MdInventory, MdLogout, MdCategory, MdChevronLeft, MdChevronRight, MdMenu, MdClose, MdPeople, MdReceipt, MdVpnKey } from 'react-icons/md';
import { useAuthStore } from '../store/authStore';
import ClockCalendar from '../components/ClockCalendar';
import { api } from '../api/client';

const drawerWidth = 230;
const drawerWidthCollapsed = 70;

const menuSections = [
  {
    title: 'MAIN',
    items: [
      { label: 'Dashboard', icon: <MdDashboard />, path: '/', permission: 'dashboard' },
      { label: 'Sell', icon: <FaCashRegister />, path: '/sell', permission: 'sell' },
    ],
  },
  {
    title: 'MANAGE',
    items: [
      { label: 'Products', icon: <MdInventory />, path: '/products', permission: 'products' },
      { label: 'Categories', icon: <MdCategory />, path: '/product-categories', permission: 'categories' },
      { label: 'Customers', icon: <FaUsers />, path: '/customers', permission: 'customers' },
      { label: 'Invoices', icon: <MdReceipt />, path: '/invoices', permission: 'invoices' },
      { label: 'Expenses', icon: <FaCogs />, path: '/expenses', permission: 'expenses' },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [{ label: 'Reports', icon: <FaChartBar />, path: '/reports', permission: 'reports' }],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Settings', icon: <FaCogs />, path: '/settings', permission: 'settings' },
      { label: 'Users', icon: <MdPeople />, path: '/users', adminOnly: true, permission: 'users' },
    ],
  },
];

function MainLayout({ window }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [shopName, setShopName] = useState('Shop Operating Platform');
  const [logoError, setLogoError] = useState(false);
  // Load colors from localStorage first to prevent flash
  const getInitialSidebarColors = () => {
    try {
      const cached = localStorage.getItem('sidebarColors');
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          background: parsed.background || '#0D47A1',
          text: parsed.text || '#E3F2FD',
          accent: parsed.accent || '#1976D2',
        };
      }
    } catch (err) {
      // Ignore parse errors
    }
    return {
      background: '#0D47A1',
      text: '#E3F2FD',
      accent: '#1976D2',
    };
  };

  const [sidebarColors, setSidebarColors] = useState(getInitialSidebarColors());
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isSellPage = location.pathname === '/sell';

  useEffect(() => {
    // Load logo, shop name, and sidebar colors on mount
    const loadSettings = async () => {
      try {
        const settings = await api.getSettings();

        // Load shop name
        if (settings['shop.name']) {
          setShopName(settings['shop.name']);
        }

        // Load logo - always try to load (backend will return 404 if no logo)
        // Add timestamp to prevent caching issues
        const logoPath = settings['shop.logo_path'];
        if (logoPath && logoPath.trim()) {
          // Reset error state and set new logo URL with timestamp
          const logoUrlWithTimestamp = `${api.getLogoUrl()}?t=${Date.now()}`;
          setLogoError(false);
          setLogoUrl(logoUrlWithTimestamp);
        } else {
          setLogoUrl(null);
          setLogoError(false);
        }

        // Load sidebar colors
        const newColors = {
          background: settings['sidebar.background'] || '#0D47A1',
          text: settings['sidebar.text'] || '#E3F2FD',
          accent: settings['sidebar.accent'] || '#1976D2',
        };
        setSidebarColors(newColors);
        // Cache in localStorage for instant load on next refresh
        localStorage.setItem('sidebarColors', JSON.stringify(newColors));
      } catch (err) {
        // Ignore errors
      }
    };
    loadSettings();

    // Refresh logo and shop name periodically (every 30 seconds) in case they change
    const interval = setInterval(() => {
      loadSettings();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <div>
      <Toolbar sx={{ px: 2, justifyContent: 'space-between' }}>
        {!sidebarCollapsed && (
          <Typography variant="h6" noWrap component="div">
            SOP
          </Typography>
        )}
        <IconButton
          color="inherit"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          sx={{ ml: 'auto' }}
        >
          {sidebarCollapsed ? <MdChevronRight /> : <MdChevronLeft />}
        </IconButton>
      </Toolbar>
      <Divider />
      {menuSections.map((section) => (
        <Box key={section.title} sx={{ mt: 1, mb: 0.5 }}>
          {!sidebarCollapsed && (
            <Typography
              variant="caption"
              sx={{
                px: 2,
                py: 0.5,
                color: alpha(sidebarColors.text, 0.6),
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontWeight: 500,
              }}
            >
              {section.title}
            </Typography>
          )}
          <List dense disablePadding>
            {section.items
              .filter((item) => {
                // Filter admin-only items
                if (item.adminOnly && user?.role !== 'ADMIN') {
                  return false;
                }
                // Filter by permissions (ADMIN has all permissions)
                if (user?.role === 'ADMIN') {
                  return true; // Admin sees everything
                }
                // Check if user has permission for this page
                if (item.permission && user?.permissions) {
                  return user.permissions.includes(item.permission);
                }
                // If no permission specified, show it (for backward compatibility)
                return true;
              })
              .map((item) => {
                const selected =
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                return (
                  <ListItem key={item.path} disablePadding sx={{ px: 1, py: 0.25 }}>
                    <ListItemButton
                      component={Link}
                      to={item.path}
                      selected={selected}
                      sx={{
                        borderRadius: 1.5,
                        px: sidebarCollapsed ? 1.5 : 1.5,
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        '&.Mui-selected': {
                          bgcolor: `${alpha(sidebarColors.accent, 0.14)} !important`,
                          '&:hover': {
                            bgcolor: `${alpha(sidebarColors.accent, 0.25)} !important`,
                          },
                        },
                        '&:hover:not(.Mui-selected)': {
                          bgcolor: `${alpha(sidebarColors.accent, 0.15)} !important`,
                        },
                      }}
                      title={sidebarCollapsed ? item.label : ''}
                    >
                      <ListItemIcon
                        sx={{
                          color: 'inherit',
                          minWidth: sidebarCollapsed ? 0 : 32,
                          justifyContent: 'center',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!sidebarCollapsed && <ListItemText primary={item.label} />}
                    </ListItemButton>
                  </ListItem>
                );
              })}
          </List>
        </Box>
      ))}
    </div>
  );

  const container = window !== undefined ? () => window().document.body : undefined;

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'primary.main',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            {/* Simple hamburger icon */}
            <span style={{ fontSize: 'clamp(1.25rem, 2.5vw, 1.5rem)' }}>☰</span>
          </IconButton>
          <IconButton
            color="inherit"
            aria-label="toggle sidebar"
            edge="start"
            onClick={() => setSidebarHidden(!sidebarHidden)}
            sx={{ mr: 2, display: { xs: 'none', sm: 'flex' } }}
          >
            {sidebarHidden ? <MdMenu /> : <MdClose />}
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            {logoUrl && (
              <Box
                component="img"
                src={logoUrl}
                alt="Shop Logo"
                onError={() => {
                  // Try to reload after a short delay
                  setTimeout(() => {
                    api.getSettings().then((s) => {
                      if (s['shop.logo_path']) {
                        setLogoUrl(`${api.getLogoUrl()}?t=${Date.now()}`);
                        setLogoError(false);
                      } else {
                        setLogoUrl(null);
                      }
                    }).catch(() => {
                      // Ignore errors
                    });
                  }, 2000);
                }}
                onLoad={() => {
                  setLogoError(false);
                }}
                sx={{
                  height: 40,
                  maxWidth: 150,
                  minWidth: 40,
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                  cursor: 'pointer',
                  flexShrink: 0,
                  mr: 1,
                  backgroundColor: 'transparent',
                }}
                onClick={async () => {
                  // Refresh logo on click
                  try {
                    const settings = await api.getSettings();
                    if (settings['shop.logo_path']) {
                      setLogoUrl(`${api.getLogoUrl()}?t=${Date.now()}`);
                      setLogoError(false);
                    }
                  } catch (err) {
                    // Ignore errors
                  }
                }}
              />
            )}
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexShrink: 0,
              }}
            >
              {shopName}
            </Typography>
          </Box>
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
              <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <ClockCalendar />
              </Box>
              <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {user.username} ({user.role})
              </Typography>
              <IconButton
                color="inherit"
                onClick={() => navigate('/change-password')}
                aria-label="change my password"
                title="Change my password"
              >
                <MdVpnKey />
              </IconButton>
              <IconButton
                color="inherit"
                onClick={async () => {
                  // End the login on the server too; log out here even if the server can't be reached
                  try {
                    await api.logout();
                  } catch (_) {
                    // already ended or backend down
                  }
                  logout();
                  navigate('/login');
                }}
                aria-label="logout"
              >
                <MdLogout />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{
          width: {
            sm: sidebarHidden ? 0 : (sidebarCollapsed ? drawerWidthCollapsed : drawerWidth),
          },
          flexShrink: { sm: 0 },
          transition: 'width 0.3s ease',
          overflow: 'hidden',
        }}
        aria-label="navigation"
      >
        <Drawer
          container={container}
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: sidebarColors.background,
              color: sidebarColors.text,
              borderRight: 'none',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: sidebarHidden ? 'none' : 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: sidebarCollapsed ? drawerWidthCollapsed : drawerWidth,
              bgcolor: sidebarColors.background,
              color: sidebarColors.text,
              borderRight: 'none',
              transition: 'width 0.3s ease',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: isSellPage ? 0 : 3,
          width: '100%', // Allow flex to control width
          minWidth: 0, // Prevent flex item from overflowing
          bgcolor: isSellPage ? '#f5f5f5' : '#fafafa',
          minHeight: '100vh',
          transition: 'width 0.3s ease',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default MainLayout;


