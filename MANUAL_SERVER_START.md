# Manual Server Start Guide

This guide explains how to manually start the backend server for testing and debugging.

## Prerequisites
- Node.js installed
- Dependencies installed (`npm install` in backend folder)

## Steps

1. **Open Command Prompt or PowerShell**
2. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

3. **Set environment variables (optional):**
   ```bash
   # Windows PowerShell
   $env:PORT="4000"
   $env:NODE_ENV="production"
   $env:DATA_DIR="C:\Users\YourName\AppData\Roaming\SOP\data"
   $env:UPLOADS_DIR="C:\Users\YourName\AppData\Roaming\SOP\uploads"
   
   # Windows CMD
   set PORT=4000
   set NODE_ENV=production
   set DATA_DIR=C:\Users\YourName\AppData\Roaming\SOP\data
   set UPLOADS_DIR=C:\Users\YourName\AppData\Roaming\SOP\uploads
   ```

4. **Start the server:**
   ```bash
   npm start
   # OR
   node src/server.js
   ```

5. **Verify it's running:**
   - Open browser: http://localhost:4000/api/health
   - Should see: `{"status":"ok"}`
   - Check console for: "Server running on port 4000"

## Troubleshooting

### Error: "Cannot find module"
- **Solution:** Make sure you're in the `backend` directory
- **Check:** `node_modules` folder exists in backend directory
- **Fix:** Run `npm install` in backend directory

### Error: "Port 4000 already in use"
- **Solution:** Stop any running instance
- **Check:** `netstat -ano | findstr :4000`
- **Kill process:** `taskkill /PID <process_id> /F`

### Error: "Database not found"
- **Solution:** Set `DATA_DIR` environment variable
- **Default location:** `%APPDATA%\SOP\data\`

### Error: "EACCES" or Permission Denied
- **Solution:** Run as Administrator (if needed)
- **Check:** File permissions on data/uploads directories

## Quick Test Script

Create a file `test-server.bat` in the backend directory:

```batch
@echo off
echo Starting Backend Server...
echo.

set PORT=4000
set NODE_ENV=production
set DATA_DIR=%APPDATA%\SOP\data
set UPLOADS_DIR=%APPDATA%\SOP\uploads

echo Environment:
echo   PORT=%PORT%
echo   NODE_ENV=%NODE_ENV%
echo   DATA_DIR=%DATA_DIR%
echo   UPLOADS_DIR=%UPLOADS_DIR%
echo.

cd /d %~dp0
node src/server.js

pause
```

Run it by double-clicking or: `test-server.bat`

## Verify Server is Running

1. **Check console output:**
   - Should see: "Server running on port 4000"
   - No error messages

2. **Test health endpoint:**
   ```powershell
   # PowerShell
   Invoke-WebRequest -Uri http://localhost:4000/api/health
   
   # OR in browser:
   http://localhost:4000/api/health
   ```

3. **Check if port is listening:**
   ```powershell
   netstat -ano | findstr :4000
   ```
