@echo off
echo ========================================
echo NovelHelper Electron Build Script
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] Checking dependencies...
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
echo [2/5] Building backend...
cd server
call npm run build
if errorlevel 1 (
    echo Backend build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [3/5] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo Frontend build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [4/5] Building Electron main process...
call npm run build:electron
if errorlevel 1 (
    echo Electron main process build failed!
    pause
    exit /b 1
)

echo.
echo [5/5] Packaging application...
call npm run dist
if errorlevel 1 (
    echo Packaging failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed!
echo Output directory: release\
echo ========================================
echo.

explorer release

pause
