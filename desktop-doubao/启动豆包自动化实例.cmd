@echo off
chcp 65001 >nul
setlocal EnableExtensions
title 豆包自动化实例（调试端口）

if "%DOUBAO_EXE%"=="" set "DOUBAO_EXE=D:\Doubao\app\Doubao.exe"
if "%DOUBAO_DEBUG_PORT%"=="" set "DOUBAO_DEBUG_PORT=9333"
set "PROFILE=%~dp0doubao-auto"

if not exist "%DOUBAO_EXE%" (
  echo 找不到豆包：%DOUBAO_EXE%
  echo 可以用环境变量指定，例如：set DOUBAO_EXE=D:\Doubao\app\Doubao.exe
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:%DOUBAO_DEBUG_PORT%/json/version' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo 自动化实例已经在运行：http://127.0.0.1:%DOUBAO_DEBUG_PORT%
  echo 如果窗口找不到了，可以在托盘图标里点开豆包。
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

if not exist "%PROFILE%" mkdir "%PROFILE%"

echo 正在启动专用实例（配置目录：%PROFILE%）...
start "豆包自动化实例" "%DOUBAO_EXE%" --remote-debugging-port=%DOUBAO_DEBUG_PORT% --user-data-dir="%PROFILE%"

echo.
echo 第一次使用：在弹出的豆包窗口里扫码登录一次，之后会记住登录状态。
echo 登录完成后可以关闭这个黑窗口，但不要关闭豆包窗口。
echo.
echo 自检：  node "%~dp0ask.mjs" --status
echo 提问：  node "%~dp0ask.mjs" "你好"
echo.
ping -n 6 127.0.0.1 >nul
exit /b 0
