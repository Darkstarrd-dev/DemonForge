@echo off
echo ========================================
echo NovelHelper Electron Migration Verification
echo ========================================
echo.

cd /d "%~dp0"

set ERROR=0

echo [1/5] Checking dependencies...
if not exist "node_modules" (
    echo X Root dependencies not installed
    set ERROR=1
) else (
    echo OK Root dependencies installed
)

if not exist "frontend\node_modules" (
    echo X Frontend dependencies not installed
    set ERROR=1
) else (
    echo OK Frontend dependencies installed
)

if not exist "server\node_modules" (
    echo X Backend dependencies not installed
    set ERROR=1
) else (
    echo OK Backend dependencies installed
)

echo.
echo [2/5] Checking backend build...
if not exist "server\dist\index.js" (
    echo X Backend not built, building now...
    cd server
    call npm run build
    if errorlevel 1 (
        echo X Backend build failed
        set ERROR=1
    ) else (
        echo OK Backend built successfully
    )
    cd ..
) else (
    echo OK Backend already built
)

echo.
echo [3/5] Checking Electron main process build...
if not exist "dist-electron\main.js" (
    echo X Electron main process not built, building now...
    call npm run build:electron
    if errorlevel 1 (
        echo X Electron main process build failed
        set ERROR=1
    ) else (
        echo OK Electron main process built successfully
    )
) else (
    echo OK Electron main process already built
)

echo.
echo [4/5] Checking configuration files...
if not exist "electron\main.ts" (
    echo X electron/main.ts does not exist
    set ERROR=1
) else (
    echo OK electron/main.ts exists
)

if not exist "package.json" (
    echo X Root package.json does not exist
    set ERROR=1
) else (
    echo OK Root package.json exists
)

if not exist "server\src\utils\paths.ts" (
    echo X server/src/utils/paths.ts does not exist
    set ERROR=1
) else (
    echo OK server/src/utils/paths.ts exists
)

echo.
echo [5/5] Checking documentation...
if not exist "ELECTRON.md" (
    echo ! ELECTRON.md does not exist
) else (
    echo OK ELECTRON.md exists
)

if not exist "README.md" (
    echo ! README.md does not exist
) else (
    echo OK README.md exists
)

echo.
echo ========================================
if %ERROR%==0 (
    echo OK Verification passed! Ready to run Electron app
    echo.
    echo Next steps:
    echo   - Test dev mode: npm run dev
    echo   - Test packaging: npm run dist
) else (
    echo X Verification failed, please check errors above
)
echo ========================================
echo.

pause
