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

:: 3. Libraries
echo.
echo [3/5] Installing required libraries...
call npm ci
if errorlevel 1 (
    echo [X] ERROR: Failed to install libraries.
    goto :failed
)
echo [OK] Libraries ready.

:: Local settings are created once; existing data and passwords are never replaced.
echo [2/5] Preparing offline database settings...
call npm run offline:setup
if errorlevel 1 goto :failed


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
