@echo off
echo ========================================
echo   Starting Backend with Frontend
echo ========================================
echo.

REM Change to the backend directory
cd /d "%~dp0backend"
if not exist "src\server.js" (
    echo ERROR: backend\src\server.js not found!
    echo Please run this from the project root or installed app directory.
    pause
    exit /b 1
)

REM Find frontend dist path
set FRONTEND_PATH=
if exist "..\resources\app.asar.unpacked\frontend\dist" (
    set FRONTEND_PATH=%~dp0resources\app.asar.unpacked\frontend\dist
) else if exist "..\frontend\dist" (
    set FRONTEND_PATH=%~dp0frontend\dist
) else (
    echo WARNING: Frontend dist not found. Backend will start but won't serve frontend.
    echo Looking for frontend in:
    echo   - %~dp0resources\app.asar.unpacked\frontend\dist
    echo   - %~dp0frontend\dist
    echo.
)

echo Setting environment variables...
set SERVE_FRONTEND=true
if defined FRONTEND_PATH (
    set FRONTEND_DIST_PATH=%FRONTEND_PATH%
    echo Frontend path: %FRONTEND_DIST_PATH%
) else (
    echo Frontend path: NOT SET (backend will not serve frontend)
)
set DATA_DIR=%APPDATA%\SOP\data
set UPLOADS_DIR=%APPDATA%\SOP\uploads
set PORT=4000
set NODE_ENV=production

echo.
echo Environment:
echo   SERVE_FRONTEND=%SERVE_FRONTEND%
if defined FRONTEND_DIST_PATH echo   FRONTEND_DIST_PATH=%FRONTEND_DIST_PATH%
echo   DATA_DIR=%DATA_DIR%
echo   UPLOADS_DIR=%UPLOADS_DIR%
echo   PORT=%PORT%
echo   NODE_ENV=%NODE_ENV%
echo.

REM Create data directories if they don't exist
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%UPLOADS_DIR%" mkdir "%UPLOADS_DIR%"

echo Starting backend server...
echo.
echo Press Ctrl+C to stop the server
echo.

node src\server.js

pause

