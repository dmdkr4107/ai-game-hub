@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title AI Game Hub - Build Windows Installer

echo This builds an UNSIGNED INTERNAL-TEST installer on Windows.
where node >nul 2>&1
if errorlevel 1 goto :requirements
where npm.cmd >nul 2>&1
if errorlevel 1 goto :requirements
if not exist "node_modules\electron\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)
call npm run package:win
if errorlevel 1 goto :error

echo.
echo Installer output is in the release folder.
echo Do not publicly distribute this unauthenticated prototype.
pause
exit /b 0

:requirements
echo Install Node.js LTS from https://nodejs.org/ first.
:error
echo.
echo Installer build failed. Check the messages above.
pause
exit /b 1
