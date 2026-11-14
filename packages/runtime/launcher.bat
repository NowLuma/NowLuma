@echo off
chcp 65001 >nul
setlocal
rem Run from this script's folder: config/, logs/ and native/ are all relative to it.
cd /d "%~dp0"

if exist ".\node.exe" (
  set "NODE_BIN=.\node.exe"
) else (
  set "NODE_BIN=node"
)

"%NODE_BIN%" .\check-node-version.cjs
if errorlevel 1 (
  echo.
  echo   [Nowluma] 没有可用的 Node.js，或版本过低。
  echo   需要 Node.js 24.22.1 -^> 24.x，或 ^>= 26.12.1。
  echo   下载：https://nodejs.org/dist/
  echo   也可以把 node.exe 放到本目录，启动器会优先使用它。
  echo.
  pause
  exit /b 1
)

"%NODE_BIN%" .\index.mjs
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo   [Nowluma] 已退出，退出码 %EXIT_CODE%。日志在 logs\ 目录。
  echo.
)

pause
exit /b %EXIT_CODE%
