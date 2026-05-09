@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Service Stopper
:: Stops NestJS backend, Redis, and PostgreSQL cleanly
:: ============================================================

for %%i in ("%~dp0.") do set FAHUBX_HOME=%%~fi

set PG_BIN=%FAHUBX_HOME%\pgsql\bin
set PG_DATA=%FAHUBX_HOME%\pgsql\data
set REDIS_DIR=%FAHUBX_HOME%\redis
set PID_FILE=%FAHUBX_HOME%\data\fahubx.pid
set BACKEND_DIR=%FAHUBX_HOME%\backend

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
echo   Stopping FAhubX Services
echo ========================================
echo.

:: ---- Stop Backend ----
echo [1/3] Stopping Backend...
if exist "%PID_FILE%" (
    set /p NODE_PID=<"%PID_FILE%"
    taskkill /PID !NODE_PID! /F >nul 2>&1
    if not errorlevel 1 (
        echo   Backend stopped (PID: !NODE_PID!^)
    ) else (
        echo   Backend process not found (may have already stopped^)
    )
    del "%PID_FILE%" >nul 2>&1
) else (
    :: Fallback: kill by command line match
    for /f "tokens=2" %%p in ('wmic process where "name='node.exe' and commandline like '%%dist/main.js%%'" get ProcessId /value 2^>nul ^| findstr "ProcessId"') do (
        taskkill /PID %%p /F >nul 2>&1
    )
    echo   Backend stopped.
)

:: ---- Stop Redis ----
echo [2/3] Stopping Redis...
"%REDIS_DIR%\redis-cli.exe" -p %REDIS_PORT% shutdown nosave >nul 2>&1
if not errorlevel 1 (
    echo   Redis stopped.
) else (
    :: Fallback: kill redis-server process
    taskkill /f /im redis-server.exe >nul 2>&1
    echo   Redis stopped (fallback^).
)

:: ---- Stop PostgreSQL ----
echo [3/3] Stopping PostgreSQL...
"%PG_BIN%\pg_ctl.exe" stop -D "%PG_DATA%" -m fast -w >nul 2>&1
if not errorlevel 1 (
    echo   PostgreSQL stopped.
) else (
    echo   PostgreSQL was not running.
)

echo.
echo ========================================
echo   All FAhubX services stopped.
echo ========================================

exit /b 0
