@echo off
chcp 65001 >nul
setlocal
title DeepSeek Local Service
cd /d "%~dp0"
if errorlevel 1 (
  echo Cannot open script directory: %~dp0
  goto :failed
)

if not exist "deepseek-local.mjs" (
  echo Missing deepseek-local.mjs.
  echo Extract the entire ZIP before running this launcher.
  goto :failed
)
if not exist "deepseek-request.mjs" (
  echo Missing deepseek-request.mjs.
  echo Extract the entire ZIP before running this launcher.
  goto :failed
)
if not exist "xuexitong-console.js" (
  echo Missing xuexitong-console.js.
  echo Keep this launcher, deepseek-local.mjs and xuexitong-console.js together.
  goto :failed
)

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE="
if not defined NODE_EXE for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE (
  echo Node.js was not found. Install Node.js and try again.
  goto :failed
)

rem A previous run may still hold port 37841. The new process would exit with
rem EADDRINUSE while the old one keeps answering requests, which makes the
rem restart silently ineffective. Clear the port before starting.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":37841" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
timeout /t 2 >nul

echo Starting DeepSeek local service...
"%NODE_EXE%" "deepseek-local.mjs"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Local service exited with code %EXIT_CODE%.
echo If there is an error above, please send me the exact text.
pause
exit /b %EXIT_CODE%

:failed
echo.
echo Startup failed. Please send me the exact message above.
pause
exit /b 1
