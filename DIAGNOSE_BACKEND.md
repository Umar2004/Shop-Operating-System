# Backend Connection Diagnostic Guide

## Quick Test

Run this to test if backend can start manually:

```powershell
cd backend
$env:DATA_DIR="$env:APPDATA\SOP\data"
$env:UPLOADS_DIR="$env:APPDATA\SOP\uploads"
$env:PORT="4000"
node src\server.js
```

If this works, the backend files are fine.

## Common Issues

### Issue 1: "ENOENT" Error
**Meaning:** Node.js not found in PATH
**Fix:** 
- Install Node.js from https://nodejs.org/
- Add Node.js to system PATH
- Restart computer after adding to PATH

### Issue 2: Backend Process Exits Immediately
**Check console for:**
- Error messages
- Exit code (usually 1 means error)
- Last output before exit

**Common causes:**
- Missing node_modules
- Database path issue
- Port already in use

### Issue 3: Health Check Fails
**Check:**
- Is backend actually listening? (check console for "listening on")
- Can you access http://localhost:4000/api/health in browser?
- Is port 4000 blocked by firewall?

## Quick Fixes

### If Node.js is not in PATH:
1. Find Node.js installation (usually `C:\Program Files\nodejs\`)
2. Add to PATH:
   - Right-click "This PC" → Properties
   - Advanced System Settings → Environment Variables
   - Add `C:\Program Files\nodejs\` to Path variable
3. Restart computer
4. Test: `node --version` in new terminal

### If Backend Crashes:
Check the console output for the actual error message. Common issues:
- Missing dependencies
- Database file locked
- Port conflict

## Test Backend Manually

Use the test script:
```powershell
.\test-backend.bat
```

This will show you exactly what error the backend is producing.
