@echo off
chcp 65001 >nul
echo ========================================
echo NovelHelper Electron Build Script
echo ========================================
echo.

cd /d "%~dp0"

:: Check and install dependencies
echo [1/6] Checking dependencies...
if not exist "node_modules\electron" (
    echo Installing root dependencies...
    call npm install
)
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend && call npm install && cd ..
)
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server && call npm install && cd ..
)

:: Build backend
echo.
echo [2/6] Building backend (tsc)...
cd server
call npm run build
if errorlevel 1 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)
cd ..

:: Build frontend
echo.
echo [3/6] Building frontend (Vite)...
cd frontend
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
cd ..

:: Build Electron main process
echo.
echo [4/6] Building Electron main process...
call npm run build:electron
if errorlevel 1 (
    echo ERROR: Electron main process build failed!
    pause
    exit /b 1
)

:: Assemble Electron app directory
echo.
echo [5/6] Assembling app directory...
set BUILDDIR=%~dp0_build_temp\win-unpacked
if exist "%BUILDDIR%" rmdir /s /q "%BUILDDIR%"
mkdir "%BUILDDIR%"

:: Copy Electron dist (excluding resources/)
robocopy "node_modules\electron\dist" "%BUILDDIR%" /E /XD "resources" /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1
move "%BUILDDIR%\electron.exe" "%BUILDDIR%\NovelHelper.exe" >nul

:: Create app directory
mkdir "%BUILDDIR%\resources\app\dist-electron"
mkdir "%BUILDDIR%\resources\app\frontend\dist"
mkdir "%BUILDDIR%\resources\app\server\dist"

:: Copy app code
robocopy "dist-electron" "%BUILDDIR%\resources\app\dist-electron" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1
robocopy "frontend\dist" "%BUILDDIR%\resources\app\frontend\dist" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1
robocopy "server\dist" "%BUILDDIR%\resources\app\server\dist" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1

:: Copy node_modules for child process (native addons: better-sqlite3, sqlite-vec)
echo     Copying server/node_modules (native modules)...
robocopy "server\node_modules" "%BUILDDIR%\resources\node_modules" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 exit /b 1

:: Create app package.json
echo {"name":"novelhelper","main":"dist-electron/main.js","type":"module"} > "%BUILDDIR%\resources\app\package.json"

echo     Assembly complete.

:: Package with electron-builder (prepackaged mode - avoids app-builder.exe lock issue)
echo.
echo [6/6] Packaging installers (NSIS + portable)...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

call npx electron-builder --win --x64 --prepackaged "%BUILDDIR%"
if errorlevel 1 (
    echo ERROR: Packaging failed!
    pause
    exit /b 1
)

:: Cleanup temp build directory
if exist "%BUILDDIR%" rmdir /s /q "%BUILDDIR%"
if exist "%~dp0_build_temp" rmdir /s /q "%~dp0_build_temp"

echo.
echo ========================================
echo Build completed!
echo   NSIS installer : release\NovelHelper Setup 0.1.0.exe
echo   Portable       : release\NovelHelper-0.1.0-portable.exe
echo ========================================
echo.

explorer release

pause
