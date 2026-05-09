@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FAhubX Frontend Build Script
:: Builds React/Vite frontend and stages output
:: ============================================================

set PROJECT_ROOT=%~dp0..
set FRONTEND_DIR=%PROJECT_ROOT%\frontend
set STAGING_DIR=%~dp0staging\frontend
set INSTALLER_DIR=%~dp0

echo ========================================
echo   Building FAhubX Frontend
echo ========================================
echo.

:: Step 1: Install dependencies
echo [1/3] Installing frontend dependencies...
cd /d "%FRONTEND_DIR%"
call npm ci
if errorlevel 1 (
    echo ERROR: npm ci failed
    exit /b 1
)

:: Step 2: Build
echo [2/3] Building with Vite...
:: Frontend api.ts defaults to http://localhost:3000, no override needed
call npx vite build
if errorlevel 1 (
    echo ERROR: vite build failed
    exit /b 1
)
echo   Build complete: frontend\dist\

:: Step 3: Stage
echo [3/3] Staging frontend files...
if exist "%STAGING_DIR%" rmdir /s /q "%STAGING_DIR%"
mkdir "%STAGING_DIR%"
xcopy /E /I /Q /Y "%FRONTEND_DIR%\dist" "%STAGING_DIR%\dist" >nul

echo.
echo   Frontend build complete!
echo   Staged at: %STAGING_DIR%
echo.
cd /d "%INSTALLER_DIR%"
exit /b 0
