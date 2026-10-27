const os = require('os');
const path = require('path');

// Where the INSTALLED app keeps its data, worked out the way Electron does it: electron/main.js gives the backend
// DATA_DIR = app.getPath('userData')\data, and userData is <appData>\<app name>, the app name being package.json
// "name". Tools that run without the app (backend/tools) use this to find the same database.
// (The backend's own fallback when it runs without DATA_DIR, %APPDATA%\SOP in db.js, is a different folder.)
const APP_NAME = 'sos'; // = "name" in the root package.json (the tests check that they agree)
const DB_FILE = 'sop.db';

// Electron's app.getPath('appData')
function appDataRoot() {
  if (process.platform === 'win32') return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

const installedDataDir = () => path.join(appDataRoot(), APP_NAME, 'data');

module.exports = { APP_NAME, DB_FILE, appDataRoot, installedDataDir };
