const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');

// Log file setup for production mode
let logFileStream = null;
let logFilePath = null;

// Initialize log file in production mode
function initLogFile() {
  if (!isDev) {
    try {
      const userDataPath = app.getPath('userData');
      const logsDir = path.join(userDataPath, 'logs');

      // Ensure logs directory exists
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      logFilePath = path.join(logsDir, 'app.log');

      // Open log file in append mode
      logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      // Write header
      const header = `\n${'='.repeat(80)}\nApplication started at ${new Date().toISOString()}\n${'='.repeat(80)}\n`;
      logFileStream.write(header);
    } catch (err) {
      console.error('Failed to initialize log file:', err.message);
    }
  }
}

// Helper function for timestamped console logging with file output
function log(component, message, isError = false) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const prefix = `[${timestamp}] [${component}]`;
  const logMessage = isError ? `${prefix} ✗ ${message}` : `${prefix} ${message}`;

  // Always log to console
  if (isError) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }

  // Also write to log file in production mode
  if (!isDev && logFileStream) {
    try {
      logFileStream.write(logMessage + '\n');
    } catch (err) {
      // Silently fail if log file write fails
    }
  }
}

// Detect if we're in development mode
// In installed app, app.isPackaged will be true
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

let mainWindow;
let backendProcess;
let backendOutput = '';
let usingExistingBackend = false;

// Keep only the tail of backend output in memory (it is also written to the log file)
const BACKEND_OUTPUT_LIMIT = 64 * 1024;
function appendBackendOutput(text) {
  backendOutput = (backendOutput + text).slice(-BACKEND_OUTPUT_LIMIT);
}

// One copy of the app at a time: a second launch focuses the existing window instead of
// starting a second backend that would fail on the already-used port 4000.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Enumerate all USB devices that have a Printer class interface (bInterfaceClass = 0x07).
// Returns an array of { vid, pid, label, ifaceNumber, outEpAddress, device }.
function listUsbPrinterDevices() {
  const usb = require('usb');
  const found = [];
  for (const dev of usb.getDeviceList()) {
    try {
      const cfg = dev.configDescriptor;
      if (!cfg) continue;
      for (const ifaceAlts of cfg.interfaces) {
        for (const alt of ifaceAlts) {
          if (alt.bInterfaceClass !== 0x07) continue;
          const outEp = alt.endpoints.find(ep => (ep.bEndpointAddress & 0x80) === 0);
          if (outEp) {
            const vid = dev.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
            const pid = dev.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
            found.push({
              vid, pid,
              id: `${vid}:${pid}`,
              label: `USB ${vid}:${pid}`,
              ifaceNumber: alt.bInterfaceNumber,
              outEpAddress: outEp.bEndpointAddress,
              device: dev,
            });
            break; // only one entry per physical device
          }
        }
      }
    } catch (_) {}
  }
  return found;
}

// Send raw ESC/POS bytes to a USB printer via libusb.
// usbDeviceId: "vid:pid" string (e.g. "0483:5743"). If null, uses first found printer.
function sendRawToPrinter(usbDeviceId, dataBuffer) {
  return new Promise((resolve, reject) => {
    let usb;
    try {
      usb = require('usb');
    } catch (e) {
      return reject(new Error('usb package not installed. Run: npm install usb in D:\\SOS'));
    }

    const all = listUsbPrinterDevices();
    if (all.length === 0) {
      return reject(new Error(
        'No USB printer found via libusb.\n' +
        'The printer needs a WinUSB driver — install it with Zadig (zadig.akeo.ie):\n' +
        '  1. Open Zadig → Options → List All Devices\n' +
        '  2. Select your Xprinter\n' +
        '  3. Choose WinUSB → Install Driver'
      ));
    }

    // Match by vid:pid if specified, otherwise use first
    let entry;
    if (usbDeviceId) {
      entry = all.find(d => d.id === usbDeviceId.toLowerCase());
      if (!entry) {
        // Device not found — may need WinUSB driver. List what IS accessible.
        const accessible = all.map(d => d.id).join(', ');
        return reject(new Error(
          `USB device ${usbDeviceId} not found via libusb (accessible: ${accessible || 'none'}).\n` +
          'This device likely uses the Windows usbprint.sys driver.\n' +
          'Fix: Open Zadig → select this printer → install WinUSB driver.'
        ));
      }
    } else {
      entry = all[0];
    }

    log('PRINTER', `Using USB device: ${entry.id} iface=${entry.ifaceNumber} ep=0x${entry.outEpAddress.toString(16)}`);

    try {
      entry.device.open();
    } catch (e) {
      return reject(new Error(
        `Cannot open USB device ${entry.id}: ${e.message}\n` +
        'This usually means the device needs a WinUSB driver.\n' +
        'Fix: Open Zadig → select your printer → install WinUSB driver.'
      ));
    }

    const iface = entry.device.interface(entry.ifaceNumber);
    try {
      iface.claim();
    } catch (e) {
      try { entry.device.close(); } catch (_) {}
      return reject(new Error(
        `Cannot claim USB interface on ${entry.id}: ${e.message}\n` +
        'Fix: Open Zadig → select your printer → install WinUSB driver.'
      ));
    }

    const endpoint = iface.endpoint(entry.outEpAddress);
    // libusb waits forever by default; a stalled printer (out of paper, cover open) must fail instead
    endpoint.timeout = 15000;
    endpoint.transfer(dataBuffer, (err) => {
      iface.release(() => { try { entry.device.close(); } catch (_) {} });
      if (err) {
        reject(new Error(`USB transfer failed: ${err.message}`));
      } else {
        log('PRINTER', `Sent ${dataBuffer.length} bytes to ${entry.id}`);
        resolve({ success: true });
      }
    });
  });
}

// Google sign-in for Drive backup must run in the system browser (Google refuses embedded windows).
// Only Google's sign-in page may be opened this way.
ipcMain.handle('shell:openGoogleSignIn', async (event, url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') return false;
  await shell.openExternal(parsed.toString());
  return true;
});

// IPC Handlers for Printing
ipcMain.handle('printer:getPrinters', async (event) => {
  try {
    return await event.sender.getPrintersAsync();
  } catch (error) {
    log('PRINTER', `Failed to get printers: ${error.message}`, true);
    throw error;
  }
});

// List USB devices that have a Printer class interface and are accessible via libusb.
// Returns [{ id: "vid:pid", label: "USB vid:pid" }, ...]
ipcMain.handle('printer:listUsbPrinters', async () => {
  try {
    require('usb');
  } catch (e) {
    return [];
  }
  try {
    return listUsbPrinterDevices().map(({ id, label }) => ({ id, label }));
  } catch (e) {
    log('PRINTER', `listUsbPrinters error: ${e.message}`, true);
    return [];
  }
});

ipcMain.handle('printer:print', async (event, options) => {
  const { html, printerName, silent, paperSize } = options;

  log('PRINTER', `Print request — printer: ${printerName || 'Default'}, paper: ${paperSize || '80'}mm`);

  // Write HTML to a temp file — avoids data URI length/encoding limits that
  // cause some POS printer drivers to cancel the job.
  const os = require('os');
  const tempFile = path.join(os.tmpdir(), `sos-receipt-${Date.now()}.html`);
  fs.writeFileSync(tempFile, html, 'utf8');

  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await printWindow.loadFile(tempFile);

    const printOptions = {
      silent: silent !== false,
      printBackground: true,
      deviceName: printerName,
      margins: { marginType: 'none' },
    };

    log('PRINTER', `Print options: ${JSON.stringify(printOptions)}`);

    // Some drivers never call back; give up after 30 s so the Sell screen is not left waiting forever
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        log('PRINTER', 'Print timed out after 30 s', true);
        reject(new Error('Printer did not respond (timed out after 30 s)'));
      }, 30000);
      printWindow.webContents.print(printOptions, (success, errorType) => {
        clearTimeout(timer);
        if (!success) {
          log('PRINTER', `Print failed: ${errorType}`, true);
          reject(new Error(`Print failed: ${errorType}`));
        } else {
          log('PRINTER', 'Print completed successfully');
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    log('PRINTER', `Print error: ${err.message}`, true);
    throw err;
  } finally {
    setTimeout(() => {
      if (!printWindow.isDestroyed()) printWindow.close();
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }, 5000);
  }
});

// The small Vexora mark above "Powered by Vexora Labs" at the end of each receipt (converted once per paper size)
const footerMarks = {};
async function receiptFooterMark(escpos, paperSize) {
  if (!(paperSize in footerMarks)) {
    try {
      footerMarks[paperSize] = await escpos.logoToEscpos(fs.readFileSync(path.join(__dirname, 'assets', 'vexora-swirl.png')), paperSize, 48);
    } catch (e) {
      log('PRINTER', `Receipt footer mark conversion failed: ${e.message}`, true); // the text line still prints
      footerMarks[paperSize] = null;
    }
  }
  return footerMarks[paperSize];
}

ipcMain.handle('printer:printDirect', async (event, options) => {
  const { type, printerName, paperSize, invoice, receipt, shopName, receiptSettings, printLogo, usbDeviceId } = options;

  log('PRINTER', `Direct ESC/POS print — type: ${type}, usb: ${usbDeviceId || 'auto'}, paper: ${paperSize}mm, logo: ${!!printLogo}`);

  const escpos = require('./escpos');

  // Resolve logo as ESC/POS bitmap if requested
  let logoBuffer = null;
  if (printLogo) {
    try {
      // Logo path relative to backend directory
      const uploadsDir = isDev
        ? path.join(__dirname, '..', 'backend', 'uploads')
        : path.join(app.getPath('userData'), 'uploads');
      const logoPath = path.join(uploadsDir, 'logo', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const imgData = fs.readFileSync(logoPath);
        logoBuffer = await escpos.logoToEscpos(imgData, paperSize || '80');
        log('PRINTER', `Logo converted: ${logoBuffer.length} bytes`);
      } else {
        log('PRINTER', `Logo file not found at ${logoPath}`, true);
      }
    } catch (e) {
      log('PRINTER', `Logo conversion failed: ${e.message}`, true);
    }
  }

  const footerMark = await receiptFooterMark(escpos, paperSize || '80');
  let buffer;
  if (type === 'test') {
    buffer = escpos.generateTest(shopName || 'Shop', paperSize || '80', receiptSettings, logoBuffer, footerMark);
  } else if (type === 'receipt') {
    buffer = escpos.generatePaymentReceipt(receipt, shopName || 'Shop', paperSize || '80', receiptSettings, logoBuffer, footerMark);
  } else {
    buffer = escpos.generateInvoice(invoice, shopName || 'Shop', paperSize || '80', receiptSettings, logoBuffer, footerMark);
  }

  return await sendRawToPrinter(usbDeviceId || null, buffer);
});

// Get paths for production vs development
function getAppPaths() {
  if (isDev) {
    return {
      backendPath: path.join(__dirname, '..', 'backend', 'src', 'server.js'),
      dataDir: path.join(__dirname, '..', 'backend', 'data'),
      uploadsDir: path.join(__dirname, '..', 'backend', 'uploads'),
    };
  } else {
    // In production, use userData directory for data storage
    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, 'data');
    const uploadsDir = path.join(userDataPath, 'uploads');

    // Ensure directories exist
    [dataDir, path.join(uploadsDir, 'logo')].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // In production, backend is in resources or app root
    // When installed: <install dir>\resources\app.asar.unpacked\backend\src\server.js
    const appRoot = path.dirname(process.execPath); // <install dir>, e.g. ...\Programs\Vexora Labs Shop Operating System
    const resourcesPath = process.resourcesPath || path.join(appRoot, 'resources');

    log('APP', `App root (executable dir): ${appRoot}`);
    log('APP', `Resources path: ${resourcesPath}`);
    log('APP', `__dirname: ${__dirname}`);

    const possibleBackendPaths = [
      path.join(appRoot, 'backend', 'src', 'server.js'), // extraFiles location at app root (should have node_modules) - FIRST
      path.join(resourcesPath, 'app.asar.unpacked', 'backend', 'src', 'server.js'), // asarUnpack location
      path.join(appRoot, 'resources', 'app.asar.unpacked', 'backend', 'src', 'server.js'), // Alternative unpacked path
      path.join(resourcesPath, 'backend', 'src', 'server.js'), // Alternative resources path
      path.join(__dirname, '..', 'backend', 'src', 'server.js'), // Fallback
    ];

    log('APP', 'Searching for backend server.js...');
    let finalBackendPath = null;
    for (const possiblePath of possibleBackendPaths) {
      try {
        log('APP', `  Checking: ${possiblePath}`);
        if (fs.existsSync(possiblePath)) {
          finalBackendPath = possiblePath;
          log('APP', `✓ Found backend at: ${finalBackendPath}`);
          break;
        } else {
          log('APP', `  ✗ Not found`);
        }
      } catch (e) {
        log('APP', `  ✗ Error checking: ${e.message}`, true);
      }
    }

    if (!finalBackendPath) {
      log('APP', '✗ Backend not found!', true);
      log('APP', 'Tried paths:', true);
      possibleBackendPaths.forEach(p => log('APP', `  - ${p}`, true));
      // Use first path as fallback but log error
      finalBackendPath = possibleBackendPaths[0];
      log('APP', `Using fallback path: ${finalBackendPath}`, true);
    }

    return {
      backendPath: finalBackendPath,
      dataDir: dataDir,
      uploadsDir: uploadsDir,
    };
  }
}

// Validation function to check all prerequisites before starting backend
function validateBackendPrerequisites(paths, backendDir, nodeExecutable) {
  const errors = [];
  const warnings = [];

  // Check Node.js
  if (!nodeExecutable || nodeExecutable === 'node') {
    try {
      const { execSync } = require('child_process');
      execSync('node --version', { encoding: 'utf8', timeout: 2000 });
    } catch (err) {
      errors.push('Node.js is not available in PATH');
    }
  } else if (!fs.existsSync(nodeExecutable)) {
    errors.push(`Node.js executable not found at: ${nodeExecutable}`);
  }

  // Check backend directory
  if (!fs.existsSync(backendDir)) {
    errors.push(`Backend directory not found: ${backendDir}`);
  } else {
    // Check backend server.js
    const serverJsPath = path.join(backendDir, 'src', 'server.js');
    if (!fs.existsSync(serverJsPath)) {
      errors.push(`Backend server.js not found at: ${serverJsPath}`);
    }

    // Check node_modules
    const nodeModulesPath = path.join(backendDir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      errors.push(`Backend node_modules not found at: ${nodeModulesPath}`);
    }
  }

  // Check data directory (warn if can't create, but don't fail)
  try {
    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }
  } catch (err) {
    warnings.push(`Could not create data directory: ${paths.dataDir} - ${err.message}`);
  }

  return { errors, warnings };
}

async function startBackend() {
  if (backendProcess) {
    log('BACKEND', 'Backend already started, skipping...');
    return;
  }

  // Check if a backend is already running: in dev via `npm run dev`; in production a backend left
  // behind by an earlier copy of the app that did not shut down cleanly. Reuse it instead of
  // spawning a second one that cannot bind port 4000.
  {
    log('BACKEND', 'Checking if a backend is already running on port 4000...');
    try {
      const http = require('http');
      const backendRunning = await new Promise((resolve) => {
        const testReq = http.get('http://localhost:4000/api/health', { timeout: 1000 }, (res) => {
          resolve(true);
        });
        testReq.on('error', () => {
          resolve(false);
        });
        testReq.on('timeout', () => {
          testReq.destroy();
          resolve(false);
        });
        setTimeout(() => {
          testReq.destroy();
          resolve(false);
        }, 1500);
      });

      if (backendRunning) {
        log('BACKEND', '✓ Backend is already running on port 4000');
        log('BACKEND', 'Skipping backend spawn - using existing server');
        usingExistingBackend = true;
        return;
      } else {
        log('BACKEND', 'Backend not detected on port 4000, will spawn new instance...');
      }
    } catch (e) {
      log('BACKEND', `Error checking backend: ${e.message}, will try to spawn...`);
    }
  }

  log('BACKEND', '=== Starting Backend Server ===');
  const paths = getAppPaths();

  log('APP', `Data directory: ${paths.dataDir}`);
  log('APP', `Uploads directory: ${paths.uploadsDir}`);

  // Validate Node.js availability and find executable
  let nodeExecutable = 'node';
  let nodePath = null;

  if (!isDev) {
    const { execSync } = require('child_process');

    // Try to find Node.js in PATH
    try {
      log('BACKEND', 'Testing if Node.js is available in PATH...');
      const nodeVersion = execSync('node --version', { encoding: 'utf8', timeout: 2000 }).trim();
      log('BACKEND', `✓ Node.js is available in PATH: ${nodeVersion}`);

      // Try to get full path to node executable
      try {
        if (process.platform === 'win32') {
          nodePath = execSync('where node', { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0];
        } else {
          nodePath = execSync('which node', { encoding: 'utf8', timeout: 2000 }).trim();
        }
        log('BACKEND', `Node.js path: ${nodePath}`);
      } catch (e) {
        // Ignore if we can't get the path
      }
    } catch (err) {
      log('BACKEND', 'Node.js NOT FOUND IN PATH', true);
      log('BACKEND', `Error: ${err.message}`, true);

      // Try common Node.js installation paths as fallback
      const commonNodePaths = [
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'nodejs', 'node.exe') : null,
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'nodejs', 'node.exe') : null,
      ].filter(Boolean);

      log('BACKEND', 'Trying common Node.js installation paths...');
      for (const commonPath of commonNodePaths) {
        if (fs.existsSync(commonPath)) {
          nodeExecutable = commonPath;
          nodePath = commonPath;
          log('BACKEND', `✓ Found Node.js at: ${nodePath}`);
          break;
        }
      }

      if (!nodePath) {
        const errorMsg = 'Node.js is required to run the backend server but was not found.\n\n' +
          'Please install Node.js from https://nodejs.org/ and ensure it is in your system PATH, ' +
          'or install it to the default location (C:\\Program Files\\nodejs\\).\n\n' +
          `Log file location: ${logFilePath || 'Not initialized'}`;
        log('BACKEND', 'Node.js not found in PATH or common locations', true);
        if (mainWindow) {
          dialog.showErrorBox('Node.js Not Found', errorMsg);
        }
        return;
      }
    }
  }

  // In production, search for backend directory FIRST before checking file existence
  // This ensures we find the correct backend path regardless of how the app is launched
  if (!isDev) {
    const appRoot = path.dirname(process.execPath);
    const resourcesPath = process.resourcesPath || path.join(appRoot, 'resources');

    // Calculate initial backend directory from backendPath
    let backendDir = path.dirname(path.dirname(paths.backendPath)); // Go from server.js -> src -> backend

    const possibleBackendDirs = [
      path.join(appRoot, 'backend'), // extraFiles location at app root (should have node_modules) - FIRST
      path.join(resourcesPath, 'app.asar.unpacked', 'backend'), // asarUnpack location
      path.join(appRoot, 'resources', 'app.asar.unpacked', 'backend'), // Alternative unpacked path
      path.join(resourcesPath, 'backend'), // Alternative resources
      backendDir, // The calculated path from backendPath
    ];

    // Remove duplicates while preserving order
    const uniqueBackendDirs = [...new Set(possibleBackendDirs)];

    log('BACKEND', 'Searching for backend directory...');
    let foundBackendDir = null;
    for (const possibleDir of uniqueBackendDirs) {
      try {
        log('BACKEND', `  Checking: ${possibleDir}`);
        if (fs.existsSync(possibleDir)) {
          // Verify it's actually a backend directory by checking for src/server.js
          const serverJsPath = path.join(possibleDir, 'src', 'server.js');
          if (fs.existsSync(serverJsPath)) {
            foundBackendDir = possibleDir;
            log('BACKEND', `✓ Found valid backend directory: ${foundBackendDir}`);
            // Update paths.backendPath to match the found directory
            paths.backendPath = serverJsPath;
            log('BACKEND', `✓ Updated backend path to: ${paths.backendPath}`);
            break;
          } else {
            log('BACKEND', `  ✗ Missing src/server.js`);
          }
        } else {
          log('BACKEND', `  ✗ Not found`);
        }
      } catch (e) {
        log('BACKEND', `  ✗ Error checking: ${e.message}`, true);
      }
    }

    if (!foundBackendDir) {
      log('BACKEND', 'Backend directory not found in any expected location!', true);
    }
  }

  // Check if backend file exists (after potential path update)
  if (!fs.existsSync(paths.backendPath)) {
    const errorMsg = `Backend file not found at: ${paths.backendPath}`;
    log('BACKEND', errorMsg, true);
    if (!isDev && mainWindow) {
      dialog.showErrorBox('Backend Server File Not Found', `The backend server file could not be found.\n\nPath: ${paths.backendPath}\n\nPlease reinstall the application.`);
    }
    return;
  }

  log('BACKEND', `✓ Backend file found: ${paths.backendPath}`);

  // Find frontend path for production
  let frontendDistPath = null;
  if (!isDev) {
    // In packaged app, frontend is unpacked at: resources/app.asar.unpacked/frontend/dist
    const appRoot = path.dirname(process.execPath); // Directory containing the .exe
    const resourcesPath = process.resourcesPath || path.join(appRoot, 'resources');

    const possibleFrontendPaths = [
      path.join(appRoot, 'resources', 'app.asar.unpacked', 'frontend', 'dist'), // Most common for installed app
      path.join(resourcesPath, 'app.asar.unpacked', 'frontend', 'dist'), // Unpacked (most likely)
      path.join(appRoot, 'frontend', 'dist'), // Alternative location
      path.join(resourcesPath, 'app.asar', 'frontend', 'dist'), // In ASAR (if not unpacked)
      path.join(app.getAppPath(), 'frontend', 'dist'), // From app.asar path
      path.join(__dirname, '..', 'frontend', 'dist'), // Local development (when running npm start)
      path.join(process.cwd(), 'frontend', 'dist'), // Current working directory
    ];

    log('APP', 'Looking for frontend dist...');
    log('APP', `App root: ${appRoot}`);
    log('APP', `Resources path: ${resourcesPath}`);
    log('APP', `App path: ${app.getAppPath()}`);

    for (const possiblePath of possibleFrontendPaths) {
      try {
        const resolvedPath = path.resolve(possiblePath);
        log('APP', `Checking: ${resolvedPath}`);
        if (fs.existsSync(resolvedPath)) {
          // Verify it's actually a frontend dist by checking for index.html
          const indexPath = path.join(resolvedPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            frontendDistPath = resolvedPath;
            log('APP', `✓ Found frontend at: ${frontendDistPath}`);
            break;
          } else {
            log('APP', `  ✗ Missing index.html`);
          }
        } else {
          log('APP', `  ✗ Not found`);
        }
      } catch (e) {
        log('APP', `  ✗ Error: ${e.message}`, true);
      }
    }

    if (!frontendDistPath) {
      log('APP', 'Frontend dist not found!', true);
      log('APP', 'Tried paths:', true);
      possibleFrontendPaths.forEach(p => {
        try {
          log('APP', `  - ${path.resolve(p)}`, true);
        } catch (e) {
          log('APP', `  - ${p}`, true);
        }
      });
    }
  }

  // Set environment variables for backend
  // Ensure PATH includes system PATH to find Node.js and other dependencies
  const systemPath = process.env.PATH || process.env.Path || '';
  const env = {
    ...process.env,
    PATH: systemPath, // Explicitly set PATH to ensure Node.js is found
    Path: systemPath, // Windows uses both PATH and Path
    PORT: process.env.PORT || '4000',
    NODE_ENV: process.env.NODE_ENV || 'production',
    DATA_DIR: paths.dataDir,
    UPLOADS_DIR: paths.uploadsDir,
  };

  // Only set SERVE_FRONTEND if frontend path is actually found
  if (frontendDistPath) {
    env.SERVE_FRONTEND = 'true';
    env.FRONTEND_DIST_PATH = frontendDistPath;
    log('BACKEND', `✓ Frontend will be served from: ${frontendDistPath}`);
  } else {
    env.SERVE_FRONTEND = 'false';
    log('BACKEND', '⚠️ Frontend dist not found - backend will not serve frontend', true);
  }

  log('BACKEND', `Port: ${env.PORT}`);
  log('BACKEND', `DATA_DIR: ${env.DATA_DIR}`);
  log('BACKEND', `UPLOADS_DIR: ${env.UPLOADS_DIR}`);
  log('BACKEND', `PATH length: ${systemPath.length} characters`);
  if (systemPath.length > 200) {
    log('BACKEND', `PATH (first 200 chars): ${systemPath.substring(0, 200)}...`);
  } else {
    log('BACKEND', `PATH: ${systemPath}`);
  }

  // Get backend directory (parent of src directory)
  // In production, we've already found and updated paths.backendPath above
  let backendDir = isDev
    ? path.join(__dirname, '..', 'backend')
    : path.dirname(path.dirname(paths.backendPath)); // Go from server.js -> src -> backend

  log('BACKEND', `Calculated backend dir: ${backendDir}`);
  log('BACKEND', `Backend dir exists: ${fs.existsSync(backendDir)}`);

  // In production, if backend directory still doesn't exist, try alternative paths
  if (!isDev && !fs.existsSync(backendDir)) {
    log('BACKEND', 'Backend directory not found at calculated path, trying alternatives...', true);
    const appRoot = path.dirname(process.execPath);
    const resourcesPath = process.resourcesPath || path.join(appRoot, 'resources');
    const altPaths = [
      path.join(appRoot, 'backend'), // extraFiles location at app root (should have node_modules) - FIRST
      path.join(resourcesPath, 'app.asar.unpacked', 'backend'), // asarUnpack location
      path.join(appRoot, 'resources', 'app.asar.unpacked', 'backend'), // Alternative unpacked path
      path.join(resourcesPath, 'backend'), // Alternative resources
    ];
    for (const altPath of altPaths) {
      log('BACKEND', `  Checking: ${altPath}`);
      if (fs.existsSync(altPath)) {
        log('BACKEND', `✓ Using alternative backend directory: ${altPath}`);
        backendDir = altPath;
        // Also update backendPath if we found a valid directory
        const serverJsPath = path.join(altPath, 'src', 'server.js');
        if (fs.existsSync(serverJsPath)) {
          paths.backendPath = serverJsPath;
          log('BACKEND', `✓ Updated backend path to: ${paths.backendPath}`);
        }
        break;
      } else {
        log('BACKEND', `  ✗ Not found`);
      }
    }
  }

  // Validate all prerequisites before attempting to start
  const validation = validateBackendPrerequisites(paths, backendDir, nodeExecutable);

  if (validation.errors.length > 0) {
    log('BACKEND', '✗ Validation failed:', true);
    validation.errors.forEach(err => log('BACKEND', `  - ${err}`, true));

    if (mainWindow) {
      const errorMsg = `Cannot start backend server. Validation errors:\n\n` +
        validation.errors.map(e => `• ${e}`).join('\n') +
        (validation.warnings.length > 0 ? `\n\nWarnings:\n${validation.warnings.map(w => `• ${w}`).join('\n')}` : '') +
        `\n\nLog file: ${logFilePath || 'Not initialized'}`;
      dialog.showErrorBox('Backend Validation Failed', errorMsg);
    }
    return;
  }

  if (validation.warnings.length > 0) {
    log('BACKEND', '⚠️ Validation warnings:', true);
    validation.warnings.forEach(warn => log('BACKEND', `  - ${warn}`, true));
  }

  log('BACKEND', `✓ Working directory: ${backendDir}`);
  log('BACKEND', `✓ node_modules found in backend directory`);

  // Use the node executable we found during validation
  // If we found a specific path, use it directly; otherwise use 'node' and let shell find it
  let useShell = true;

  if (nodePath && fs.existsSync(nodePath)) {
    nodeExecutable = nodePath;
    useShell = false; // Use direct path, no need for shell
    log('BACKEND', `Using Node.js at: ${nodeExecutable}`);
  } else {
    nodeExecutable = 'node';
    useShell = true; // Must use shell to find 'node' in PATH
    log('BACKEND', `Using system Node.js (must be in PATH)`);
  }

  log('BACKEND', `Node executable: ${nodeExecutable}`);
  log('BACKEND', `Using shell: ${useShell}`);

  // Ensure we use absolute paths (declare outside try block for error handler access)
  const absoluteBackendPath = path.resolve(paths.backendPath);
  const absoluteBackendDir = path.resolve(backendDir);

  try {
    log('BACKEND', 'Spawning backend process...');
    log('BACKEND', `Using absolute backend path: ${absoluteBackendPath}`);
    log('BACKEND', `Using absolute working directory: ${absoluteBackendDir}`);

    backendProcess = spawn(nodeExecutable, [absoluteBackendPath], {
      stdio: isDev ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: env,
      cwd: absoluteBackendDir,
      shell: useShell,
    });

    if (!backendProcess.pid) {
      const error = new Error('Failed to spawn backend process - no PID returned');
      log('BACKEND', error.message, true);
      throw error;
    }

    log('BACKEND', `✓ Backend process spawned (PID: ${backendProcess.pid})`);

    // Monitor backend process status for first 5 seconds
    let processCheckCount = 0;
    const maxChecks = 10; // Check 10 times over 5 seconds (every 500ms)
    let processMonitor = setInterval(() => {
      processCheckCount++;

      if (!backendProcess) {
        clearInterval(processMonitor);
        return;
      }

      // Check if process has exited
      try {
        // On Windows, we can't easily check if process is alive without trying to kill it
        // So we rely on the exit event and stderr/stdout
        if (backendProcess.killed) {
          log('BACKEND', '⚠️ Backend process was killed!', true);
          clearInterval(processMonitor);
        } else if (backendProcess.exitCode !== null) {
          log('BACKEND', `⚠️ Backend process exited with code: ${backendProcess.exitCode}`, true);
          clearInterval(processMonitor);
        }
      } catch (err) {
        // Ignore errors checking process status
      }

      // Stop monitoring after max checks
      if (processCheckCount >= maxChecks) {
        clearInterval(processMonitor);
        log('BACKEND', 'Process monitoring completed - backend appears to be running');
      }
    }, 500);

    // Capture backend output
    if (!isDev) {
      backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        appendBackendOutput(output);
        const lines = output.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.trim()) {
            log('BACKEND', line.trim());
            // Check for database-related messages
            if (line.includes('database') || line.includes('Database') || line.includes('db')) {
              log('DATABASE', line.trim());
            }
          }
        });
      });

      backendProcess.stderr.on('data', (data) => {
        const error = data.toString();
        appendBackendOutput(error);
        const lines = error.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          if (line.trim()) {
            log('BACKEND', line.trim(), true);
            // Check for database-related errors
            if (line.includes('database') || line.includes('Database') || line.includes('db') || line.includes('SQLite')) {
              log('DATABASE', line.trim(), true);
            }
          }
        });
      });
    }

    backendProcess.on('exit', (code, signal) => {
      log('BACKEND', `⚠️ PROCESS EXITED (code: ${code}, signal: ${signal})`, true);
      if (code !== 0 && code !== null) {
        log('BACKEND', 'Last output before exit:', true);
        const lastLines = backendOutput.split('\n').slice(-20).join('\n');
        log('BACKEND', lastLines, true);
      }

      // Clear the process monitor interval if it's still running
      if (processMonitor) {
        clearInterval(processMonitor);
      }

      backendProcess = null;

      if (mainWindow && !isDev) {
        // Get last 500 characters of backend output for error message
        const errorOutput = backendOutput.length > 500
          ? backendOutput.slice(-500)
          : backendOutput;
        const errorMsg = `The backend server process exited unexpectedly.\n\n` +
          `Exit code: ${code}\n` +
          `Signal: ${signal}\n\n` +
          (errorOutput ? `Backend Error Output:\n${errorOutput}\n\n` : 'No backend output captured.\n\n') +
          `Log file: ${logFilePath || 'Not initialized'}\n\n` +
          `Please check the log file for detailed error information.`;

        dialog.showErrorBox('Backend Server Crashed', errorMsg);
      }
    });

    backendProcess.on('error', (err) => {
      log('BACKEND', `Failed to start backend: ${err.message}`, true);
      log('BACKEND', `Error code: ${err.code}`, true);
      if (err.code === 'ENOENT') {
        log('BACKEND', 'Node.js executable not found in PATH', true);
      }
      backendProcess = null;
      if (!isDev && mainWindow) {
        const errorMsg = `The backend server process could not be started.\n\n` +
          `Error: ${err.message}\n` +
          `Error code: ${err.code}\n\n` +
          (err.code === 'ENOENT'
            ? 'Node.js executable not found in PATH.\n\nPlease ensure Node.js is installed and in your system PATH, or install it to the default location (C:\\Program Files\\nodejs\\)\n\n'
            : '') +
          `Node executable attempted: ${nodeExecutable}\n` +
          `Backend directory: ${absoluteBackendDir}\n` +
          `Log file: ${logFilePath || 'Not initialized'}`;

        dialog.showErrorBox('Backend Server Failed to Start', errorMsg);
      }
    });

    log('BACKEND', '=== Backend startup initiated ===');
  } catch (err) {
    log('BACKEND', `Exception starting backend: ${err.message}`, true);
    log('BACKEND', err.stack, true);
    if (!isDev && mainWindow) {
      dialog.showErrorBox('Backend Server Exception', `An exception occurred while starting the backend server.\n\n${err.message}`);
    }
  }
}

// Wait for server to be ready
function waitForServer(url, maxAttempts = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkServer = () => {
      attempts++;
      log('BACKEND', `Health check attempt ${attempts}/${maxAttempts}: Checking ${url}...`);

      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'GET',
        timeout: 2000,
      };

      const req = http.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          log('BACKEND', `✓ Health check passed (Status: ${res.statusCode})`);
          log('DATABASE', 'Database status: Connected (via backend health check)');
          resolve();
        } else {
          log('BACKEND', `Server responded with status ${res.statusCode}, retrying...`);
          if (attempts >= maxAttempts) {
            reject(new Error(`Server at ${url} returned status ${res.statusCode} after ${maxAttempts} attempts`));
          } else {
            setTimeout(checkServer, delay);
          }
        }
        res.on('data', () => { });
        res.on('end', () => { });
      });

      req.on('error', (err) => {
        log('BACKEND', `Connection error: ${err.message}`);
        if (attempts >= maxAttempts) {
          reject(new Error(`Server at ${url} did not become available after ${maxAttempts} attempts. Last error: ${err.message}`));
        } else {
          setTimeout(checkServer, delay);
        }
      });

      req.on('timeout', () => {
        log('BACKEND', 'Request timeout');
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`Server at ${url} did not respond after ${maxAttempts} attempts`));
        } else {
          setTimeout(checkServer, delay);
        }
      });

      req.setTimeout(2000);
      req.end();
    };

    checkServer();
  });
}

const APP_TITLE = 'Vexora Labs — Shop Operating System';

// The window opens straight away on the Vexora boot splash (electron/splash.html: local files only, so it needs
// no backend and no network). createWindow() replaces it with the app once the backend passes its health check.
async function showSplash() {
  log('APP', 'Creating application window (boot splash)...');
  const devIcon = path.join(__dirname, '..', 'build', 'vexora-icon.ico'); // a packaged exe carries the icon itself

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_TITLE,
    backgroundColor: '#050507', // the splash colour: no white flash before a page paints
    icon: fs.existsSync(devIcon) ? devIcon : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // Always open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Log frontend loading events
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log('FRONTEND', `Failed to load: ${errorDescription} (Code: ${errorCode})`, true);
    log('FRONTEND', `URL: ${validatedURL}`, true);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('FRONTEND', `✓ Loaded ${mainWindow.webContents.getURL().startsWith('file:') ? 'boot splash' : 'frontend'}`);
  });

  // 'crashed' no longer exists in Electron 39; 'render-process-gone' is its replacement.
  // Reload so a renderer crash does not leave the cashier with a blank window.
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log('FRONTEND', `Renderer process gone (reason: ${details.reason}, exitCode: ${details.exitCode})`, true);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  try {
    await mainWindow.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } });
  } catch (error) {
    log('APP', `Boot splash failed to load: ${error.message}`, true); // the dark window still shows
  }
  mainWindow.show();
}

// Update the splash's status line; failed stops its loading bar (an error dialog is about to open)
function setSplashStatus(text, failed) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(`window.setSplashStatus && window.setSplashStatus(${JSON.stringify(text)}, ${!!failed})`)
    .catch(() => {});
}

async function createWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await showSplash();
  }

  if (isDev) {
    try {
      // Try common Vite dev server ports
      const possiblePorts = [5173, 5174, 5175, 3000, 8080];
      let frontendUrl = null;

      for (const port of possiblePorts) {
        const url = `http://localhost:${port}`;
        log('FRONTEND', `Checking frontend server at ${url}...`);
        try {
          await waitForServer(url, 5, 500);
          frontendUrl = url;
          log('FRONTEND', `✓ Frontend server found at ${url}!`);
          break;
        } catch (err) {
          // Try next port
          continue;
        }
      }

      if (!frontendUrl) {
        throw new Error('Frontend server not found on any common port');
      }

      await mainWindow.loadURL(frontendUrl);
      mainWindow.show();
    } catch (error) {
      log('FRONTEND', `Failed to connect to frontend server: ${error.message}`, true);
      mainWindow.show();
    }
  } else {
    // PRODUCTION MODE
    log('APP', '=== PRODUCTION MODE - Starting Application ===');

    // Wait for the backend (up to 60 s: a cold start on a slow PC can take well over 10 s)
    log('BACKEND', 'Waiting for backend server to be ready (max 60 seconds)...');
    try {
      await waitForServer('http://localhost:4000/api/health', 120, 500);
      log('BACKEND', '✓ Backend server is ready!');
    } catch (error) {
      log('BACKEND', `Backend server not available: ${error.message}`, true);

      // Check if backend process is still running
      let backendStatus = 'Unknown';
      if (!backendProcess) {
        backendStatus = 'Backend process is null (never started or already exited)';
      } else if (backendProcess.killed) {
        backendStatus = 'Backend process was killed';
      } else if (backendProcess.exitCode !== null) {
        backendStatus = `Backend process exited with code: ${backendProcess.exitCode}`;
      } else {
        backendStatus = 'Backend process appears to be running but not responding';
      }

      // Get backend output if available
      const errorOutput = backendOutput.length > 500
        ? backendOutput.slice(-500)
        : backendOutput;

      const errorMsg = `The backend server is not responding.\n\n` +
        `${error.message}\n\n` +
        `Backend Status: ${backendStatus}\n\n` +
        (errorOutput ? `Backend Output (last 500 chars):\n${errorOutput}\n\n` : 'No backend output captured.\n\n') +
        `Log file location: ${logFilePath || 'Not initialized'}\n\n` +
        `Please check the log file for detailed error information.`;

      setSplashStatus('Could not start the app', true);
      dialog.showErrorBox('Backend Server Not Available', errorMsg);
      return;
    }

    // Load frontend from backend (which serves static files)
    log('FRONTEND', 'Loading frontend from backend server...');

    try {
      await mainWindow.loadURL('http://localhost:4000');
      log('FRONTEND', '✓ Frontend loaded successfully!');
      mainWindow.show();
    } catch (error) {
      log('FRONTEND', `Failed to load frontend: ${error.message}`, true);

      // Get backend output to see if there are frontend serving errors
      const errorOutput = backendOutput.length > 500
        ? backendOutput.slice(-500)
        : backendOutput;

      const errorMsg = `Could not load the application interface.\n\n` +
        `Error: ${error.message}\n\n` +
        `This usually means the backend is running but not serving the frontend files.\n\n` +
        (errorOutput ? `Backend Output:\n${errorOutput}\n\n` : '') +
        `Log file: ${logFilePath || 'Not initialized'}`;

      setSplashStatus('Could not start the app', true);
      dialog.showErrorBox('Frontend Not Found', errorMsg);
    }
  }
}

app.whenReady().then(async () => {
  // A second copy is quitting (see requestSingleInstanceLock above); it must not start a backend
  if (!gotSingleInstanceLock) return;

  // Initialize log file first (before any logging)
  initLogFile();

  // Log app initialization
  log('APP', '========================================');
  log('APP', '=== ELECTRON APP READY ===');
  log('APP', '========================================');
  log('APP', `Platform: ${process.platform}`);
  log('APP', `Architecture: ${process.arch}`);
  log('APP', `Node version: ${process.versions.node}`);
  log('APP', `Electron version: ${process.versions.electron}`);
  log('APP', `App version: ${app.getVersion()}`);
  log('APP', `App path: ${app.getAppPath()}`);
  log('APP', `User data path: ${app.getPath('userData')}`);
  log('APP', `Is packaged: ${app.isPackaged}`);
  log('APP', `Is dev: ${isDev}`);
  log('APP', `Executable path: ${process.execPath}`);
  log('APP', '========================================');

  // The window and its boot splash first, so something shows while the backend starts
  await showSplash();

  // Start backend (or use existing if in dev mode)
  log('APP', '=== STARTING BACKEND SERVER ===');
  await startBackend();

  // In dev mode, backend might already be running (via npm run dev)
  // So backendProcess might be null, which is OK
  if (backendProcess) {
    log('APP', `Backend process created, PID: ${backendProcess.pid}`);
    // Brief pause only to catch a backend that dies immediately (e.g. missing module);
    // readiness itself is detected by the health check in createWindow()
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if backend process is still alive
    if (backendProcess.killed || backendProcess.exitCode !== null) {
      log('APP', `CRITICAL: Backend process died during initialization! Exit code: ${backendProcess.exitCode}`, true);
      const errorOutput = backendOutput.length > 500
        ? backendOutput.slice(-500)
        : backendOutput;
      if (mainWindow) {
        const errorMsg = `Backend process exited during startup.\n\n` +
          `Exit code: ${backendProcess.exitCode}\n\n` +
          (errorOutput ? `Backend Error Output:\n${errorOutput}\n\n` : '') +
          `Log file: ${logFilePath || 'Not initialized'}`;
        setSplashStatus('Could not start the app', true);
        dialog.showErrorBox('Backend Startup Failed', errorMsg);
      }
      return;
    }
  } else if (usingExistingBackend) {
    log('APP', 'Using the backend that was already running on port 4000');
  } else if (isDev) {
    log('APP', 'Dev mode: Backend may already be running separately');
    log('APP', 'Waiting 2 seconds for backend to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  } else {
    log('APP', 'CRITICAL: Backend process is null after startBackend()!', true);
    if (mainWindow) {
      const errorMsg = `Backend process was not created.\n\n` +
        `This usually means:\n` +
        `• Node.js was not found\n` +
        `• Backend directory was not found\n` +
        `• Backend dependencies are missing\n\n` +
        `Log file: ${logFilePath || 'Not initialized'}`;
      setSplashStatus('Could not start the app', true);
      dialog.showErrorBox('Backend Not Started', errorMsg);
    }
    return;
  }

  // Replace the splash with the app (in production once the backend passes its health check)
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  log('APP', 'Application quitting, cleaning up...');
  if (backendProcess) {
    log('BACKEND', 'Killing backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
});
