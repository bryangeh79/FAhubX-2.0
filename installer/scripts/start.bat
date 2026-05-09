@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Service Starter
:: Starts PostgreSQL, Redis, and NestJS backend in order
:: ============================================================

for %%i in ("%~dp0.") do set FAHUBX_HOME=%%~fi

set PG_BIN=%FAHUBX_HOME%\pgsql\bin
set PG_DATA=%FAHUBX_HOME%\pgsql\data
set REDIS_DIR=%FAHUBX_HOME%\redis
set NODE=%FAHUBX_HOME%\node\node.exe
set BACKEND_DIR=%FAHUBX_HOME%\backend
set PID_FILE=%FAHUBX_HOME%\data\fahubx.pid
set LOGS_DIR=%FAHUBX_HOME%\logs

:: Ensure directories exist
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
if not exist "%FAHUBX_HOME%\data" mkdir "%FAHUBX_HOME%\data"

:: Load ports from .env
set PG_PORT=5433
set REDIS_PORT=6380
set APP_PORT=9600
for /f "usebackq tokens=1,2 delims==" %%a in ("%BACKEND_DIR%\.env") do (
    if "%%a"=="DB_PORT" set PG_PORT=%%b
    if "%%a"=="REDIS_PORT" set REDIS_PORT=%%b
    if "%%a"=="PORT" set APP_PORT=%%b
)

echo ========================================
echo   Starting FAhubX Services
echo ========================================
echo.

:: ---- Check if already running ----
if exist "%PID_FILE%" (
    set /p OLD_PID=<"%PID_FILE%"
    tasklist /fi "PID eq !OLD_PID!" 2>nul | findstr /i "node.exe" >nul 2>&1
    if not errorlevel 1 (
        echo FAhubX is already running (PID: !OLD_PID!^)
        echo Use stop.bat to stop first, or open http://localhost:%APP_PORT%
        exit /b 0
    )
    del "%PID_FILE%" >nul 2>&1
)

:: ---- [1/3] Start PostgreSQL ----
echo [1/3] Starting PostgreSQL on port %PG_PORT%...

:: Check if already running
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% >nul 2>&1
if not errorlevel 1 (
    echo   PostgreSQL already running.
    goto :start_redis
)

"%PG_BIN%\pg_ctl.exe" start -D "%PG_DATA%" -l "%LOGS_DIR%\pgsql.log" -w -t 30 >nul 2>&1
if errorlevel 1 (
    echo ERROR: PostgreSQL failed to start!
    echo Check %LOGS_DIR%\pgsql.log for details.
    pause
    exit /b 1
)

:: Wait for ready
set RETRIES=0
:waitpg
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% >nul 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! gtr 30 (
        echo ERROR: PostgreSQL did not start in time
        pause
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
    goto waitpg
)
echo   PostgreSQL: RUNNING

:: ---- [2/3] Start Redis ----
:start_redis
echo [2/3] Starting Redis on port %REDIS_PORT%...

:: Check if already running
"%REDIS_DIR%\redis-cli.exe" -p %REDIS_PORT% ping >nul 2>&1
if not errorlevel 1 (
    echo   Redis already running.
    goto :start_backend
)

start "FAhubX-Redis" /min "%REDIS_DIR%\redis-server.exe" "%REDIS_DIR%\redis.conf" --port %REDIS_PORT% --dir "%FAHUBX_HOME%\data" --logfile "%LOGS_DIR%\redis.log"

:: Wait for Redis
set RETRIES=0
:waitredis
timeout /t 1 /nobreak >nul
"%REDIS_DIR%\redis-cli.exe" -p %REDIS_PORT% ping >nul 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! gtr 30 (
        echo ERROR: Redis did not start in time
        pause
        exit /b 1
    )
    goto waitredis
)
echo   Redis: RUNNING

:: ---- [3/3] Start Backend (NestJS) ----
:start_backend
echo [3/3] Starting FAhubX Backend on port %APP_PORT%...

cd /d "%BACKEND_DIR%"
start "FAhubX-Backend" /min "%NODE%" dist/main.js

:: Wait briefly and capture PID
timeout /t 2 /nobreak >nul

:: Find the node process running dist/main.js
for /f "tokens=2" %%p in ('wmic process where "name='node.exe' and commandline like '%%dist/main.js%%'" get ProcessId /value 2^>nul ^| findstr "ProcessId"') do (
    set NODE_PID=%%p
)

if defined NODE_PID (
    :: Clean PID value (remove CR/LF)
    for /f "tokens=* delims= " %%a in ("!NODE_PID!") do set NODE_PID=%%a
    echo !NODE_PID!> "%PID_FILE%"
    echo   Backend: RUNNING (PID: !NODE_PID!^)
) else (
    echo   Backend: STARTED (PID tracking unavailable^)
)

cd /d "%FAHUBX_HOME%"

echo.
echo ========================================
echo   All services started!
echo.
echo   Open: http://localhost:%APP_PORT%
echo.
echo   Logs: %LOGS_DIR%\
echo   Stop: run stop.bat
echo ========================================
echo.

exit /b 0
