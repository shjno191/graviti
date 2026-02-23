@echo off
title SQL Helper - Build
echo ============================================
echo   SQL Helper Tauri - Production Build
echo ============================================
echo.

:: -----------------------------------------------
:: 1. Check prerequisites
:: -----------------------------------------------
echo [1/4] Checking prerequisites...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo        Download from https://nodejs.org/
    goto :error
)

where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Rust/Cargo is not installed or not in PATH.
    echo        Download from https://rustup.rs/
    goto :error
)

echo        Node.js ... OK
echo        Cargo   ... OK
echo.

:: -----------------------------------------------
:: 2. Install npm dependencies (if needed)
:: -----------------------------------------------
echo [2/4] Installing npm dependencies...
if not exist node_modules (
    call npm install
    if %errorlevel% neq 0 goto :error
    echo        npm install ... OK
) else (
    echo        node_modules already exists, skipping.
)
echo.

:: -----------------------------------------------
:: 3. Set NSIS installer options
::    - Disable one-click install so user can choose directory
:: -----------------------------------------------
echo [3/4] Configuring build environment...
set TAURI_BUNDLE_WINDOWS_NSIS_ONE_CLICK=false
set TAURI_BUNDLE_WINDOWS_NSIS_ALLOW_TO_CHANGE_INSTALLATION_DIRECTORY=true
echo        NSIS one-click              = false
echo        NSIS allow change directory = true
echo.

:: -----------------------------------------------
:: 4. Build the Tauri application
:: -----------------------------------------------
echo [4/4] Building Tauri application (this may take a few minutes)...
echo.
call npx tauri build
if %errorlevel% neq 0 goto :error

echo.
echo ============================================
echo   BUILD SUCCESSFUL!
echo ============================================
echo.
echo   Output files are located in:
echo     src-tauri\target\release\sql-helper-tauri.exe
echo.
echo   Installers are located in:
echo     src-tauri\target\release\bundle\msi\
echo     src-tauri\target\release\bundle\nsis\
echo.
echo ============================================
pause
exit /b 0

:error
echo.
echo ============================================
echo   BUILD FAILED! See errors above.
echo ============================================
pause
exit /b 1
