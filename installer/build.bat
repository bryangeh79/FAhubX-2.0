@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Master Build Script
:: Orchestrates: build backend + frontend, download deps,
:: compile Inno Setup installer
:: ============================================================

set INSTALLER_DIR=%~dp0
:: Remove trailing backslash
if "%INSTALLER_DIR:~-1%"=="\" set INSTALLER_DIR=%INSTALLER_DIR:~0,-1%

set DEPS_DIR=%INSTALLER_DIR%\deps
set STAGING_DIR=%INSTALLER_DIR%\staging
set OUTPUT_DIR=%INSTALLER_DIR%\output

:: Dependency URLs
set NODE_VERSION=20.18.0
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip
set NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip
set NODE_DIR=node-v%NODE_VERSION%-win-x64

set PG_VERSION=16.4-1
set PG_URL=https://get.enterprisedb.com/postgresql/postgresql-%PG_VERSION%-windows-x64-binaries.zip
set PG_ZIP=postgresql-%PG_VERSION%-windows-x64-binaries.zip

set REDIS_VERSION=5.0.14.1
set REDIS_URL=https://github.com/tporadowski/redis/releases/download/v%REDIS_VERSION%/Redis-x64-%REDIS_VERSION%.zip
set REDIS_ZIP=Redis-x64-%REDIS_VERSION%.zip

echo ============================================================
echo   FAhubX Installer Build Pipeline
echo ============================================================
echo.

:: ---- Check prerequisites ----
echo [CHECK] Verifying prerequisites...

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH. Install Node.js 18+ first.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found in PATH.
    exit /b 1
)

:: Check for Inno Setup compiler
set ISCC=
where iscc >nul 2>&1
if not errorlevel 1 (
    set ISCC=iscc
) else (
    if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    ) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
        set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
    ) else if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" (
        set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
    )
)

if not defined ISCC (
    echo ERROR: Inno Setup compiler (ISCC.exe^) not found.
    echo Download from: https://jrsoftware.org/isdl.php
    exit /b 1
)

echo   Node.js: OK
echo   npm: OK
echo   Inno Setup: OK
echo.

:: ---- Ensure directories ----
if not exist "%DEPS_DIR%" mkdir "%DEPS_DIR%"
if not exist "%STAGING_DIR%" mkdir "%STAGING_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: ============================================================
:: Phase 1: Build Backend
:: ============================================================
echo [PHASE 1/4] Building Backend...
echo.
call "%INSTALLER_DIR%\build-backend.bat"
if errorlevel 1 (
    echo.
    echo FATAL: Backend build failed!
    exit /b 1
)
echo.

:: ============================================================
:: Phase 2: Build Frontend
:: ============================================================
echo [PHASE 2/4] Building Frontend...
echo.
call "%INSTALLER_DIR%\build-frontend.bat"
if errorlevel 1 (
    echo.
    echo FATAL: Frontend build failed!
    exit /b 1
)
echo.

:: ============================================================
:: Phase 3: Download & Extract Dependencies
:: ============================================================
echo [PHASE 3/4] Preparing runtime dependencies...
echo.

:: ---- Node.js ----
if not exist "%DEPS_DIR%\%NODE_ZIP%" (
    echo [DOWNLOAD] Node.js v%NODE_VERSION%...
    curl -L -o "%DEPS_DIR%\%NODE_ZIP%" "%NODE_URL%"
    if errorlevel 1 (
        echo ERROR: Failed to download Node.js
        exit /b 1
    )
) else (
    echo [CACHED] Node.js v%NODE_VERSION%
)

if not exist "%STAGING_DIR%\node\node.exe" (
    echo [EXTRACT] Node.js...
    powershell -Command "Expand-Archive -Path '%DEPS_DIR%\%NODE_ZIP%' -DestinationPath '%DEPS_DIR%' -Force"
    if exist "%STAGING_DIR%\node" rmdir /s /q "%STAGING_DIR%\node"
    rename "%DEPS_DIR%\%NODE_DIR%" node
    move "%DEPS_DIR%\node" "%STAGING_DIR%\node" >nul
    echo   Extracted to staging\node\
)

:: ---- PostgreSQL ----
if not exist "%DEPS_DIR%\%PG_ZIP%" (
    echo [DOWNLOAD] PostgreSQL v%PG_VERSION%...
    curl -L -o "%DEPS_DIR%\%PG_ZIP%" "%PG_URL%"
    if errorlevel 1 (
        echo ERROR: Failed to download PostgreSQL
        exit /b 1
    )
) else (
    echo [CACHED] PostgreSQL v%PG_VERSION%
)

if not exist "%STAGING_DIR%\pgsql\bin\initdb.exe" (
    echo [EXTRACT] PostgreSQL...
    powershell -Command "Expand-Archive -Path '%DEPS_DIR%\%PG_ZIP%' -DestinationPath '%DEPS_DIR%\pg-extract' -Force"
    if exist "%STAGING_DIR%\pgsql" rmdir /s /q "%STAGING_DIR%\pgsql"
    :: EDB zip extracts to pgsql/ subfolder
    if exist "%DEPS_DIR%\pg-extract\pgsql" (
        move "%DEPS_DIR%\pg-extract\pgsql" "%STAGING_DIR%\pgsql" >nul
    ) else (
        move "%DEPS_DIR%\pg-extract" "%STAGING_DIR%\pgsql" >nul
    )
    :: Cleanup
    if exist "%DEPS_DIR%\pg-extract" rmdir /s /q "%DEPS_DIR%\pg-extract"
    echo   Extracted to staging\pgsql\
)

:: ---- Redis ----
if not exist "%DEPS_DIR%\%REDIS_ZIP%" (
    echo [DOWNLOAD] Redis v%REDIS_VERSION% (Windows^)...
    curl -L -o "%DEPS_DIR%\%REDIS_ZIP%" "%REDIS_URL%"
    if errorlevel 1 (
        echo ERROR: Failed to download Redis
        exit /b 1
    )
) else (
    echo [CACHED] Redis v%REDIS_VERSION%
)

if not exist "%STAGING_DIR%\redis\redis-server.exe" (
    echo [EXTRACT] Redis...
    if exist "%STAGING_DIR%\redis" rmdir /s /q "%STAGING_DIR%\redis"
    mkdir "%STAGING_DIR%\redis"
    powershell -Command "Expand-Archive -Path '%DEPS_DIR%\%REDIS_ZIP%' -DestinationPath '%STAGING_DIR%\redis' -Force"
    echo   Extracted to staging\redis\
)

echo.
echo   All dependencies ready.
echo.

:: ============================================================
:: Phase 4: Compile Installer
:: ============================================================
echo [PHASE 4/4] Compiling Inno Setup installer...
echo.

cd /d "%INSTALLER_DIR%"
"%ISCC%" fahubx-setup.iss
if errorlevel 1 (
    echo.
    echo FATAL: Inno Setup compilation failed!
    exit /b 1
)

echo.
echo ============================================================
echo   BUILD COMPLETE!
echo ============================================================
echo.
echo   Installer: %OUTPUT_DIR%\FAhubX-Setup-v1.4.2.exe
echo.

:: Show file size
for %%F in ("%OUTPUT_DIR%\FAhubX-Setup-v1.4.2.exe") do (
    set SIZE=%%~zF
    set /a SIZE_MB=!SIZE! / 1048576
    echo   Size: ~!SIZE_MB! MB
)

echo.
echo   Next steps:
echo   1. Test on a clean Windows 10/11 VM
echo   2. Verify database initialization
echo   3. Verify license activation (local mode^)
echo   4. Verify start/stop scripts
echo ============================================================

exit /b 0
