@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title AI Game Hub - Phase 1 Launcher

echo ============================================
echo AI Game Hub - Phase 1 Internal Prototype
echo ============================================
echo.
echo This is a development prototype, not a public service.
echo First run requires Node.js, npm and an Internet connection.
echo.

where node >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node

REM Require Node.js 20+ for the currently selected tools.
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto :old_node

if not exist "node_modules\electron\dist\electron.exe" goto :install
if not exist "node_modules\vite\package.json" goto :install
goto :build

:install
echo [1/3] Installing dependencies (may take a while)...
call npm install --no-audit --no-fund
if errorlevel 1 goto :install_failed

echo.
:build
echo [2/3] Checking and building the application...
call npm run build
if errorlevel 1 goto :build_failed

echo.
echo [3/3] Starting AI Game Hub...
echo Close the app window to finish.
call npm start
if errorlevel 1 goto :start_failed
goto :done

:missing_node
echo [ERROR] Node.js or npm was not found.
echo Install Node.js LTS from https://nodejs.org/ and try again.
goto :failed

:old_node
echo [ERROR] Node.js version 20 or newer is required.
echo Update Node.js LTS from https://nodejs.org/ and try again.
goto :failed

:install_failed
echo [ERROR] Dependency installation failed.
echo Check Internet access, npm messages above, and free disk space.
goto :failed

:build_failed
echo [ERROR] Build failed. No application was launched.
echo Review the error messages above.
goto :failed

:start_failed
echo [ERROR] AI Game Hub did not launch correctly.
echo Review the error messages above.
goto :failed

:failed
echo.
echo Send a screenshot of this window if you need help.
pause
exit /b 1

:done
echo.
echo AI Game Hub has closed.
exit /b 0
