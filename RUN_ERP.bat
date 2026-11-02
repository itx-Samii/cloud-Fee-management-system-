@echo off
TITLE School ERP Launcher
COLOR 0A
cd /d "%~dp0"

echo ============================================================
echo                SCHOOL ERP - STARTING SYSTEM
echo ============================================================
echo.

if not exist ".next" (
    echo [X] ERROR: The system is not installed yet.
    echo [!] Please run "INSTALL_ERP.bat" first.
    echo.
    pause
    exit /b 1
)
if not exist ".env.local" (
    echo [X] ERROR: Database settings ^(.env.local^) are missing.
    echo [!] Please run "INSTALL_ERP.bat" again.
    echo.
    pause
    exit /b 1
)

echo [!] Starting the local server; your browser will open shortly.
echo [!] First login: admin / brookfield  (change it right away)
echo.
echo ------------------------------------------------------------
echo Press Ctrl+C and type 'Y' to stop the system.
echo ------------------------------------------------------------
echo.

start "" http://localhost:3001
npm start
