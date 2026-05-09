@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Database Initialization Script
:: ============================================================

for %%i in ("%~dp0..") do set FAHUBX_HOME=%%~fi

set PG_BIN=%FAHUBX_HOME%\pgsql\bin
set PG_DATA=%FAHUBX_HOME%\pgsql\data
set NODE=%FAHUBX_HOME%\node\node.exe
set BACKEND_DIR=%FAHUBX_HOME%\backend
set LOGS_DIR=%FAHUBX_HOME%\logs

:: Ensure logs + data subdirectories exist
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
if not exist "%FAHUBX_HOME%\data" mkdir "%FAHUBX_HOME%\data"
if not exist "%FAHUBX_HOME%\data\browsers" mkdir "%FAHUBX_HOME%\data\browsers"
if not exist "%FAHUBX_HOME%\data\screenshots" mkdir "%FAHUBX_HOME%\data\screenshots"
if not exist "%FAHUBX_HOME%\data\downloads" mkdir "%FAHUBX_HOME%\data\downloads"
if not exist "%FAHUBX_HOME%\data\puppeteer" mkdir "%FAHUBX_HOME%\data\puppeteer"

:: Read port from .env
set PG_PORT=5433
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%BACKEND_DIR%\.env") do (
    if "%%a"=="DB_PORT" set PG_PORT=%%b
)

echo ========================================
echo   FAhubX Database Initialization
echo   Home: %FAHUBX_HOME%
echo   PG Port: %PG_PORT%
echo ========================================
echo.

:: Check prerequisites
if not exist "%PG_BIN%\initdb.exe" (
    echo ERROR: PostgreSQL not found at %PG_BIN%
    exit /b 1
)
if not exist "%NODE%" (
    echo ERROR: Node.js not found at %NODE%
    exit /b 1
)

:: Step 1: Initialize PostgreSQL data directory
if exist "%PG_DATA%\PG_VERSION" goto :skip_initdb

echo [1/5] Initializing PostgreSQL data directory...
"%PG_BIN%\initdb.exe" -D "%PG_DATA%" -U postgres -E UTF8 --locale=C -A trust >"%LOGS_DIR%\pgsql-initdb.log" 2>&1
if errorlevel 1 (
    echo ERROR: initdb failed. Check logs\pgsql-initdb.log
    exit /b 1
)

:: Configure pg_hba.conf
echo # FAhubX local-only authentication> "%PG_DATA%\pg_hba.conf"
echo host all all 127.0.0.1/32 trust>> "%PG_DATA%\pg_hba.conf"
echo host all all ::1/128 trust>> "%PG_DATA%\pg_hba.conf"

:: Configure postgresql.conf - append custom settings
echo.>> "%PG_DATA%\postgresql.conf"
echo # FAhubX custom settings>> "%PG_DATA%\postgresql.conf"
echo listen_addresses = '127.0.0.1'>> "%PG_DATA%\postgresql.conf"
echo port = %PG_PORT%>> "%PG_DATA%\postgresql.conf"
echo max_connections = 50>> "%PG_DATA%\postgresql.conf"
echo shared_buffers = 128MB>> "%PG_DATA%\postgresql.conf"

echo   PostgreSQL data directory initialized.
goto :start_pg

:skip_initdb
echo [1/5] PostgreSQL data directory already exists, skipping.

:: Step 2: Start PostgreSQL
:start_pg
echo [2/5] Starting PostgreSQL on port %PG_PORT%...

:: Check port availability
netstat -an 2>nul | findstr ":%PG_PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port %PG_PORT% already in use!
    exit /b 1
)

"%PG_BIN%\pg_ctl.exe" start -D "%PG_DATA%" -l "%LOGS_DIR%\pgsql-init.log" -w -t 30
if errorlevel 1 (
    echo ERROR: PostgreSQL failed to start. Check logs\pgsql-init.log
    type "%LOGS_DIR%\pgsql-init.log" 2>nul
    exit /b 1
)

:: Wait for ready
set RETRIES=0
:waitpg
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% >nul 2>&1
if not errorlevel 1 goto :pg_ready
set /a RETRIES+=1
if !RETRIES! gtr 30 (
    echo ERROR: PostgreSQL not ready in time
    "%PG_BIN%\pg_ctl.exe" stop -D "%PG_DATA%" -m fast -w >nul 2>&1
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto waitpg

:pg_ready
echo   PostgreSQL is ready.

:: Step 3: Create database
echo [3/5] Creating database 'fbautobot'...
"%PG_BIN%\createdb.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres fbautobot >nul 2>&1
echo   Database ready.

:: Step 4: Run migrations
echo [4/5] Running database migrations...
set DB_HOST=127.0.0.1
set DB_PORT=%PG_PORT%
set DB_NAME=fbautobot
set DB_USER=postgres
set DB_PASSWORD=

cd /d "%BACKEND_DIR%"
"%NODE%" database\migrate.js migrate
if errorlevel 1 (
    echo ERROR: Migration failed
    cd /d "%FAHUBX_HOME%"
    "%PG_BIN%\pg_ctl.exe" stop -D "%PG_DATA%" -m fast -w >nul 2>&1
    exit /b 1
)
echo   Migrations complete.

:: Step 5: Stop PostgreSQL
echo [5/5] Stopping PostgreSQL...
cd /d "%FAHUBX_HOME%"
"%PG_BIN%\pg_ctl.exe" stop -D "%PG_DATA%" -m fast -w >nul 2>&1
echo   PostgreSQL stopped.

echo.
echo ========================================
echo   Database initialization complete!
echo ========================================
exit /b 0
