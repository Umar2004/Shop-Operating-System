@echo off
echo ========================================
echo   Manual Backend Server Start
echo ========================================
echo.

REM Check if we're in the right directory
if not exist "backend\src\server.js" (
    echo ERROR: backend\src\server.js not found!
    echo Please run this from the project root directory.
    pause
    exit /b 1
)

echo Setting environment variables...
set PORT=4000
set NODE_ENV=production
set DATA_DIR=%APPDATA%\SOP\data
set UPLOADS_DIR=%APPDATA%\SOP\uploads

echo.
echo Environment:
echo   PORT=%PORT%
echo   NODE_ENV=%NODE_ENV%
echo   DATA_DIR=%DATA_DIR%
echo   UPLOADS_DIR=%UPLOADS_DIR%
echo.

REM Create data directories if they don't exist
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%UPLOADS_DIR%" mkdir "%UPLOADS_DIR%"

echo.
echo Starting backend server...
echo.
echo Press Ctrl+C to stop the server
echo.

cd backend
node src\server.js

pause





