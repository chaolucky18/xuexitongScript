@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 20 or later, then retry.
  pause
  exit /b 1
)
node "%~dp0start.mjs"
pause
