@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0" || exit /b 1
title AI Game Hub - Windows Launcher

echo ============================================
echo AI Game Hub - Phase 3 Internal Test
echo ============================================
echo.
echo Create games by chatting with AI and play them in the same app.
echo The source launcher needs Node.js 22.12.0 or newer and npm.
echo Internet access is needed to download dependencies on the first run.
echo Use Ollama to create an original 2D game. Godot opens older saved template games.
echo.

where node >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node

echo [1/3] Checking dependencies...
node scripts\prepare-windows.cjs
if errorlevel 1 goto :failed

echo.
echo [2/3] Checking and building the application...
call npm.cmd run build
if errorlevel 1 goto :build_failed

echo.
echo [3/3] Starting AI Game Hub...
echo Close the app window to finish.
call npm.cmd start
if errorlevel 1 goto :start_failed
goto :done

:missing_node
echo [ERROR] Node.js or npm was not found.
echo Install Node.js LTS from https://nodejs.org/ and try again.
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
