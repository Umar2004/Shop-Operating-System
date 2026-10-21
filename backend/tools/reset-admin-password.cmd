@echo off
rem Last resort when the admin password AND the recovery key are lost. Close the app first.
rem Makes a verified backup, then prints a one-time password for the admin account.
setlocal
set "NODE=node"
where node >nul 2>nul || set "NODE=%ProgramFiles%\nodejs\node.exe"
echo.
echo Shop Operating Platform - reset the admin password
echo ---------------------------------------------------
echo Close the app before continuing.
echo.
pause
"%NODE%" "%~dp0reset-admin-password.js" %*
echo.
pause
