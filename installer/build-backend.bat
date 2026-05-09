@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Backend Build Script
:: Compiles NestJS, obfuscates sensitive files, stages output
:: ============================================================

set PROJECT_ROOT=%~dp0..
set BACKEND_DIR=%PROJECT_ROOT%\backend
set STAGING_DIR=%~dp0staging\backend
set INSTALLER_DIR=%~dp0

echo ========================================
echo   Building FAhubX Backend
echo ========================================
echo.

:: Step 1: Install dependencies
echo [1/5] Installing backend dependencies...
cd /d "%BACKEND_DIR%"
call npm ci --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: npm ci failed
    exit /b 1
)

:: Install serve-static for local mode
call npm install @nestjs/serve-static --save --legacy-peer-deps
if errorlevel 1 (
    echo ERROR: Failed to install @nestjs/serve-static
    exit /b 1
)

:: Step 2: Build
echo [2/5] Compiling TypeScript...
:: 关键：先清 dist，防止上次已被混淆的文件再次被混淆导致指数级膨胀
if exist "%BACKEND_DIR%\dist" (
    echo   Removing previous dist to force fresh build...
    rmdir /s /q "%BACKEND_DIR%\dist"
)
call npx nest build
if errorlevel 1 (
    echo ERROR: nest build failed
    exit /b 1
)
echo   Build complete: backend\dist\

:: Step 3: Obfuscate
echo [3/5] Obfuscating sensitive files...
cd /d "%INSTALLER_DIR%"

:: Install javascript-obfuscator if not present
call npm list javascript-obfuscator >nul 2>&1
if errorlevel 1 (
    call npm install javascript-obfuscator --no-save
)

:: Obfuscator 需要大堆内存（license.service.js 可能 >5MB，默认 4GB 堆不够）
node --max-old-space-size=8192 obfuscate.js --backend-dist "%BACKEND_DIR%\dist"
if errorlevel 1 (
    echo ERROR: Obfuscation failed
    exit /b 1
)

:: Step 4: Stage files
echo [4/5] Staging backend files...
if exist "%STAGING_DIR%" rmdir /s /q "%STAGING_DIR%"
mkdir "%STAGING_DIR%"

:: Copy dist
xcopy /E /I /Q /Y "%BACKEND_DIR%\dist" "%STAGING_DIR%\dist" >nul
:: Copy node_modules
xcopy /E /I /Q /Y "%BACKEND_DIR%\node_modules" "%STAGING_DIR%\node_modules" >nul
:: Copy package.json
copy /Y "%BACKEND_DIR%\package.json" "%STAGING_DIR%\" >nul
:: Copy database migrations
xcopy /E /I /Q /Y "%BACKEND_DIR%\database" "%STAGING_DIR%\database" >nul
:: Copy scripts (seed)
xcopy /E /I /Q /Y "%BACKEND_DIR%\scripts" "%STAGING_DIR%\scripts" >nul

:: Step 5: Prune dev dependencies
echo [5/5] Pruning development dependencies...
cd /d "%STAGING_DIR%"
call npm prune --production >nul 2>&1
echo   Pruned dev dependencies.

:: Copy Puppeteer Chromium cache (bundles browser so installer works offline)
:: Tries C:\FAhubX\backend\puppeteer-cache (production install) first,
:: then backend\puppeteer-cache (dev env). Exits with error if neither found.
if exist "C:\FAhubX\backend\puppeteer-cache" (
    echo   Copying bundled Chromium from C:\FAhubX\backend\puppeteer-cache...
    xcopy /E /I /Q /Y "C:\FAhubX\backend\puppeteer-cache" "%STAGING_DIR%\puppeteer-cache" >nul
) else if exist "%BACKEND_DIR%\puppeteer-cache" (
    echo   Copying bundled Chromium from %BACKEND_DIR%\puppeteer-cache...
    xcopy /E /I /Q /Y "%BACKEND_DIR%\puppeteer-cache" "%STAGING_DIR%\puppeteer-cache" >nul
) else (
    echo ERROR: puppeteer-cache not found. Installer would ship without Chromium.
    echo   Expected: C:\FAhubX\backend\puppeteer-cache or %BACKEND_DIR%\puppeteer-cache
    echo   Run Puppeteer once to download Chromium, then rebuild.
    exit /b 1
)

echo.
echo   Backend build complete!
echo   Staged at: %STAGING_DIR%
echo.
cd /d "%INSTALLER_DIR%"
exit /b 0
