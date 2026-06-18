@echo off
rem 将控制台代码页切换为 UTF-8(65001)，避免 Node 以 UTF-8 输出的中文日志被
rem 当成 GBK 解码而出现乱码（如 "妫€娴嬪埌" 应为 "检测到"）。
chcp 65001 > nul

echo ========================================
echo NovelHelper Electron Dev Mode
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    call npm install
    cd ..
)

echo.
echo [2/3] Starting Electron in dev mode...
echo Note: Electron will auto-start backend and frontend servers
echo.

call npm run dev

pause
