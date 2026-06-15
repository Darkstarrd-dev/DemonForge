@echo off
echo ========================================
echo   novelhelper launcher
echo ========================================
echo.
echo [1/3] Starting backend (port 8787)...
start "novelhelper-server" cmd /k "cd /d %~dp0server && npm run dev"
timeout /t 5 /nobreak >nul
echo [2/3] Starting frontend (port 5173)...
start "novelhelper-frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul
echo [3/3] Opening browser...
start http://localhost:5173
echo.
echo All processes started. Use the sidebar "Logout" button to stop.
echo.
pause
