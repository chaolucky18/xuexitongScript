@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Doubao Local Service (xuexitong)
cd /d "%~dp0"
if errorlevel 1 (
  echo Cannot open script directory: %~dp0
  goto :failed
)

if not exist "doubao-local.mjs" (
  echo Missing doubao-local.mjs.
  goto :failed
)
if not exist "xuexitong-console.js" (
  echo Missing xuexitong-console.js.
  goto :failed
)

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
  set "NODE_EXE="
  for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE (
  echo Node.js was not found.
  goto :failed
)

powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:9333/json/version' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo Starting the Doubao automation instance...
  start "" "%~dp0..\desktop-doubao\启动豆包自动化实例.cmd"
  powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(45); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -Uri 'http://127.0.0.1:9333/json/version' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1" >nul 2>nul
  if errorlevel 1 echo Debug port not ready; the service will still start, but answering may fail.
)

echo Starting Doubao local service...
"%NODE_EXE%" "doubao-local.mjs"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Service exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:failed
echo.
echo Startup failed. Please send me the message above.
pause
exit /b 1
