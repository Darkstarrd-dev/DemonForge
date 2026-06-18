@echo off
rem Switch console code page to UTF-8(65001) so UTF-8 output from Node is
rem not mis-decoded as GBK by the parent CMD console (which garbles Chinese).
rem NOTE: this bat file itself MUST stay pure ASCII, because CMD reads .bat
rem bytes using the system default code page (GBK on zh-CN) BEFORE chcp runs,
rem so any non-ASCII comment here would be mis-parsed and break the script.
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
