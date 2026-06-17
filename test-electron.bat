@echo off
echo ========================================
echo Quick Test - NovelHelper Electron
echo ========================================
echo.
echo This will:
echo 1. Compile Electron main process
echo 2. Start Electron app
echo 3. Backend will auto-start on :8787
echo 4. Frontend will auto-start on :5173
echo.
echo Press Ctrl+C to stop at any time
echo.
pause

npm run dev
