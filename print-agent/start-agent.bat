@echo off
title PFM CampusPrint Local Agent
cd /d "%~dp0"
cls
echo ==========================================
echo    PFM CAMPUSPRINT LOCAL AGENT LAUNCHER   
echo ==========================================
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed! Please download and install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo 📦 Initializing print agent dependencies...
    call npm install --no-audit --no-fund
)

node agent.js
pause
