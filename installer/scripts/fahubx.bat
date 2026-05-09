@echo off
:: ============================================================
:: FAhubX Launcher
:: Starts all services and opens the browser
:: ============================================================

for %%i in ("%~dp0.") do set FAHUBX_HOME=%%~fi

:: Load app port from .env
set APP_PORT=9600
for /f "usebackq tokens=1,2 delims==" %%a in ("%FAHUBX_HOME%\backend\.env") do (
    if "%%a"=="PORT" set APP_PORT=%%b
)

:: Start services
call "%FAHUBX_HOME%\start.bat"
if errorlevel 1 (
    echo.
    echo Failed to start FAhubX services. Check the logs directory.
    pause
    exit /b 1
)

:: Wait for backend to be ready
echo Waiting for FAhubX to be ready...
set RETRIES=0
:waitapp
timeout /t 1 /nobreak >nul
curl -s -o nul -w "" "http://localhost:%APP_PORT%/api/v1/license/status" >nul 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if %RETRIES% gtr 60 (
        echo.
        echo WARNING: Backend may not be fully ready yet.
        echo Opening browser anyway...
        goto :openbrowser
    )
    goto waitapp
)

:openbrowser
echo.
echo Opening FAhubX in browser...
start "" "http://localhost:%APP_PORT%"

echo.
echo FAhubX is running at http://localhost:%APP_PORT%
echo.
echo To stop, run stop.bat or close this window.
echo ========================================
echo.

:: Keep window open so user knows services are running
echo Press any key to stop all services and exit...
pause >nul

:: Stop services when user presses a key
call "%FAHUBX_HOME%\stop.bat"
