@echo off
chcp 65001 >nul
setlocal EnableExtensions
title 豆包本地服务（学习通）
cd /d "%~dp0"
if errorlevel 1 (
  echo 无法进入脚本目录：%~dp0
  goto :failed
)

if not exist "doubao-local.mjs" (
  echo 缺少 doubao-local.mjs，请确认文件完整。
  goto :failed
)
if not exist "xuexitong-console.js" (
  echo 缺少 xuexitong-console.js，请确认文件完整。
  goto :failed
)

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
  set "NODE_EXE="
  for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
)
if not defined NODE_EXE (
  echo 没有找到 Node.js，请先安装 Node.js。
  goto :failed
)

rem 豆包自动化实例是否在跑（调试端口 9333）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:9333/json/version' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo 豆包自动化实例未启动，正在拉起...
  start "" "%~dp0..\desktop-doubao\启动豆包自动化实例.cmd"
  powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(45); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -Uri 'http://127.0.0.1:9333/json/version' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1" >nul 2>nul
  if errorlevel 1 echo 调试端口仍未就绪，服务仍会启动，但答题可能失败。
)

echo 启动豆包本地服务...
"%NODE_EXE%" "doubao-local.mjs"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo 服务已退出，代码 %EXIT_CODE%。
pause
exit /b %EXIT_CODE%

:failed
echo.
echo 启动失败，请把上面的信息发给我。
pause
exit /b 1
