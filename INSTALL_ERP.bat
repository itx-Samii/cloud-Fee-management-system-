@echo off
setlocal

:: ============================================================
::           SCHOOL ERP - INSTALLER
:: Installs Node.js if needed, the app's libraries, builds the
:: app and puts a shortcut on the Desktop.
:: ============================================================

TITLE School ERP - Installer
COLOR 0B

:: Run from this script's own folder (double-clicking can start in System32)
cd /d "%~dp0"

:: Running straight from inside a ZIP extracts to a temp folder that later disappears
echo %CD% | findstr /i "AppData\Local\Temp" >nul
if %errorlevel% == 0 (
    echo.
    echo [X] ERROR: Please extract the ZIP first.
    echo [!] Right-click the ZIP, choose "Extract All", then run this file
    echo     from the extracted folder.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo Starting installation...
echo ============================================================
echo.

:: 1. Node.js
echo [1/5] Checking for Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js is not installed. Downloading the official installer...
    curl -L "https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi" -o node_installer.msi
    if errorlevel 1 (
        echo [X] ERROR: Could not download Node.js. Check your internet connection.
        goto :failed
    )
    echo [!] Installing Node.js ^(Windows will ask for permission^)...
    msiexec /i node_installer.msi /passive /norestart
    del node_installer.msi
    rem This window still has the old PATH, so Node.js only becomes visible in a new one.
    echo [OK] Node.js installed. Close this window and run INSTALL_ERP.bat again.
    goto :stop
)
echo [OK] Node.js is ready.

:: 2. Database settings
echo.
echo [2/5] Checking database settings...
if not exist ".env.local" (
    copy ".env.example" ".env.local" >nul
    echo [!] A settings file has been created: .env.local
    echo [!] Put your Supabase connection string in DATABASE_URL, save it,
    echo     then run this installer again.
    start "" notepad ".env.local"
    goto :stop
)
findstr /r /c:"^DATABASE_URL=postgres" ".env.local" >nul
if errorlevel 1 (
    echo [X] .env.local has no DATABASE_URL. Copy that line from .env.example, put your
    echo     Supabase connection string in it and run this again.
    start "" notepad ".env.local"
    goto :stop
)
findstr /c:"YOUR-PROJECT-REF" ".env.local" >nul
if %errorlevel% == 0 (
    echo [X] .env.local still has the example DATABASE_URL. Put your real one in and run this again.
    start "" notepad ".env.local"
    goto :stop
)
echo [OK] Settings found.

:: 3. Libraries
echo.
echo [3/5] Installing required libraries...
call npm ci
if errorlevel 1 (
    echo [X] ERROR: Failed to install libraries.
    goto :failed
)
echo [OK] Libraries ready.

:: 4. Build
echo.
echo [4/5] Building the app...
call npm run build
if errorlevel 1 (
    echo [X] ERROR: Failed to build the app.
    goto :failed
)
echo [OK] App built.

:: 5. Shortcut
echo.
echo [5/5] Creating Desktop shortcut...
powershell -ExecutionPolicy Bypass -File "CreateShortcut.ps1"
if errorlevel 1 (
    echo [!] Warning: Could not create the Desktop shortcut. Use RUN_ERP.bat instead.
) else (
    echo [OK] Shortcut created on the Desktop.
)

echo.
echo ============================================================
echo              INSTALLATION SUCCESSFUL!
echo ============================================================
echo.
echo Start the system from the "Fee Management System" icon on your Desktop.
echo First login: admin / brookfield  (change it right away from the Dashboard)
echo.
pause
exit /b 0

:failed
echo.
echo [X] INSTALLATION FAILED. Please check the errors above.
:stop
echo.
pause
exit /b 1
