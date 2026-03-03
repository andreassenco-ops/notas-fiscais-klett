@echo off
title Klett Bot - WhatsApp Playwright
echo ==========================================
echo   Klett WhatsApp Bot - Playwright
echo ==========================================
echo.

cd /d "%~dp0..\worker"

:: Verificar se node está instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado! Instale em https://nodejs.org/
    pause
    exit /b 1
)

echo Iniciando Bot WhatsApp...
echo.
node bot/index.js

pause
