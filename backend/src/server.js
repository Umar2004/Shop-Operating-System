require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { initDb } = require('./initDb');
const { authRouter, authMiddleware } = require('./auth');
const { productsRouter } = require('./products');
const { customersRouter } = require('./customers');
const { invoicesRouter } = require('./invoices');
const { sessionsRouter } = require('./sessions');
const { expensesRouter } = require('./expenses');
const { reportsRouter } = require('./reports');
const { expenseCategoriesRouter } = require('./expenseCategories');
const { categoriesRouter } = require('./categories');
const { settingsRouter } = require('./settings');
const { usersRouter } = require('./users');
const { startScheduler } = require('./backupScheduler');

// Initialize database and seed defaults
initDb();

// Start backup scheduler
startScheduler();

const app = express();
const PORT = process.env.PORT || 4000;
// Single-PC install: listen on the loopback interface only, so nothing else on the network can connect
const HOST = process.env.HOST || '127.0.0.1';

// Only the app itself may call the API from a browser context. Any other web page opened on this PC
// (which could otherwise log in with a known password and read the token) is refused.
const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
if (process.env.NODE_ENV !== 'production') {
  // Vite dev server ports used by `npm run dev` (see electron/main.js)
  [5173, 5174, 5175, 3000, 8080].forEach((p) => {
    allowedOrigins.add(`http://localhost:${p}`);
    allowedOrigins.add(`http://127.0.0.1:${p}`);
  });
}

// Reject requests addressed to any other host name (protects against DNS-rebinding web pages)
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
app.use((req, res, next) => {
  if (!allowedHosts.has(String(req.headers.host || '').toLowerCase())) {
    return res.status(403).json({ message: 'Forbidden host' });
  }
  next();
});

app.use(
  cors({
    // Requests without an Origin header (same-origin page loads, Electron's health check) are allowed
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  })
);
app.use(express.json());
// Serve uploaded files (logos)
// In production, use UPLOADS_DIR environment variable if set
// If not set, use user data directory to avoid permission issues in Program Files
let uploadsBaseDir = process.env.UPLOADS_DIR;

if (!uploadsBaseDir) {
  // Default to user data directory to avoid permission issues
  // Windows: %APPDATA%\SOP\uploads
  // Linux/Mac: ~/.config/SOP/uploads
  const appName = 'SOP';
  if (process.platform === 'win32') {
    uploadsBaseDir = path.join(os.homedir(), 'AppData', 'Roaming', appName, 'uploads');
  } else {
    uploadsBaseDir = path.join(os.homedir(), '.config', appName, 'uploads');
  }
}

// Ensure uploads directory exists
try {
  if (!fs.existsSync(uploadsBaseDir)) {
    fs.mkdirSync(uploadsBaseDir, { recursive: true });
    // Create logo subdirectory
    const logoDir = path.join(uploadsBaseDir, 'logo');
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }
  }
} catch (error) {
  console.error(`Failed to create uploads directory: ${uploadsBaseDir}`, error);
  // Don't throw - uploads directory is optional
}

app.use('/uploads', express.static(uploadsBaseDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Public routes
app.use('/api/auth', authRouter);

// Public logo endpoint (needs to be before protected routes)
// This allows the logo to be loaded in <img> tags without authentication
app.get('/api/settings/logo', (req, res) => {
  const db = require('./db');
  const fs = require('fs');
  const path = require('path');
  
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('shop.logo_path');
    
    if (setting && setting.value && setting.value.trim()) {
      let logoPath = setting.value.trim();
      
      // If it's a relative path, resolve it using UPLOADS_DIR or default uploads directory
      if (!path.isAbsolute(logoPath)) {
        // Use UPLOADS_DIR environment variable if set (for production), otherwise use relative path
        const uploadsBaseDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
        // logoPath is like "uploads/logo/logo.png", so we need to extract just "logo/logo.png"
        const logoRelativePath = logoPath.replace(/^uploads\//, '');
        logoPath = path.join(uploadsBaseDir, logoRelativePath);
      }
      
      logoPath = path.resolve(logoPath);
      
      console.log(`[LOGO] Attempting to serve logo from: ${logoPath}`);
      console.log(`[LOGO] File exists: ${fs.existsSync(logoPath)}`);
      
      if (fs.existsSync(logoPath)) {
        const ext = path.extname(logoPath).toLowerCase();
        const contentTypeMap = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        };
        const contentType = contentTypeMap[ext] || 'image/jpeg';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        console.log(`[LOGO] ✓ Serving logo: ${logoPath}`);
        return res.sendFile(logoPath);
      } else {
        console.error(`[LOGO] ✗ Logo file not found at: ${logoPath}`);
        // Try to find any logo file in the uploads directory
        const uploadsBaseDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
        const logoDir = path.join(uploadsBaseDir, 'logo');
        if (fs.existsSync(logoDir)) {
          const files = fs.readdirSync(logoDir);
          console.error(`[LOGO] Files in logo directory: ${files.join(', ')}`);
        }
      }
    } else {
      console.error('[LOGO] ✗ No logo path found in settings');
    }
    res.status(404).json({ message: 'Logo not found' });
  } catch (err) {
    console.error('[LOGO] ✗ Error serving logo:', err);
    res.status(500).json({ message: err.message });
  }
});

// Public shop info endpoint (for login page)
app.get('/api/settings/shop-info', (req, res) => {
  const db = require('./db');
  
  try {
    const nameSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('shop.name');
    const logoSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('shop.logo_path');
    
    res.json({
      name: nameSetting?.value || 'Shop Operating Platform',
      logo_path: logoSetting?.value || null,
    });
  } catch (err) {
    console.error('Error getting shop info:', err);
    res.status(500).json({ message: err.message });
  }
});

// Protected routes
app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/customers', authMiddleware, customersRouter);
app.use('/api/invoices', authMiddleware, invoicesRouter);
app.use('/api/sessions', authMiddleware, sessionsRouter);
app.use('/api/expenses', authMiddleware, expensesRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/expense-categories', authMiddleware, expenseCategoriesRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/users', authMiddleware, usersRouter);

// Global error handler (minimal)
app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  console.error('Unexpected error', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Serve frontend static files in production (for Electron) - must be after all API routes
if (process.env.SERVE_FRONTEND === 'true') {
  // In packaged app, backend is at: resources/app.asar.unpacked/backend/src/
  // Frontend is at: resources/app.asar.unpacked/frontend/dist/
  // From backend/src, go up to backend, then up to unpacked root, then to frontend/dist
  const possibleFrontendPaths = [
    process.env.FRONTEND_DIST_PATH, // Explicit path from Electron (most reliable)
    path.join(__dirname, '..', '..', 'frontend', 'dist'), // Relative from backend/src to unpacked root
    path.join(__dirname, '..', '..', '..', 'frontend', 'dist'), // Alternative relative path
    path.join(path.dirname(__dirname), '..', 'frontend', 'dist'), // From backend to frontend
  ];
  
  // Log for debugging
  console.log('Looking for frontend dist...');
  console.log('Backend __dirname:', __dirname);
  console.log('FRONTEND_DIST_PATH env:', process.env.FRONTEND_DIST_PATH);
  
  let frontendDistPath = null;
  for (const possiblePath of possibleFrontendPaths) {
    if (!possiblePath) continue;
    try {
      const resolvedPath = path.resolve(possiblePath);
      console.log(`Checking: ${resolvedPath}`);
      if (fs.existsSync(resolvedPath)) {
        frontendDistPath = resolvedPath;
        console.log(`✓ Found frontend at: ${frontendDistPath}`);
        break;
      } else {
        console.log(`  ✗ Not found`);
      }
    } catch (e) {
      console.log(`  ✗ Error checking: ${e.message}`);
    }
  }
  
  if (!frontendDistPath) {
    console.error('✗ Frontend dist directory not found!');
    console.error('Tried paths:', possibleFrontendPaths.map(p => p ? path.resolve(p) : 'undefined'));
    console.error('Current working directory:', process.cwd());
  } else {
    console.log(`Serving frontend from: ${frontendDistPath}`);
    
    // Serve static files first (JS, CSS, images, etc.)
    app.use(express.static(frontendDistPath, {
      index: false, // Don't serve index.html automatically
      setHeaders: (res, filePath) => {
        // Set proper cache headers for static assets
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
      }
    }));
    
    // Handle React Router - serve index.html for all non-API routes that don't match static files
    // Use app.use instead of app.get('*') as Express 5 doesn't support wildcard in get()
    app.use((req, res, next) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/')) {
        return next();
      }
      // Don't serve index.html for static asset requests (they should have been handled above)
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        return next();
      }
      // Serve index.html for all other routes (React Router)
      const indexPath = path.join(frontendDistPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          res.status(500).send('Error loading application');
        }
      });
    });
  }
}

app.listen(PORT, HOST, () => {
  console.log(`Backend API listening on http://${HOST}:${PORT}`);
});


