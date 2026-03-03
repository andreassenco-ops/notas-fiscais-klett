@echo off
title Klett Worker - WhatsApp Sender
echo ==========================================
echo   Klett WhatsApp Sender - Worker Local
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

:: Verificar se dist existe
if not exist "dist\index.js" (
    echo Compilando o Worker...
    call npm run build
    if %errorlevel% neq 0 (
        echo ERRO: Falha na compilacao!
        pause
        exit /b 1
    )
)

echo Iniciando Worker na porta 3000...
echo.
node dist/index.js

pause
