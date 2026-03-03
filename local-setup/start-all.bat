@echo off
title Klett - Iniciar Sistema Completo
echo ==========================================
echo   Klett - Iniciando Sistema Completo
echo ==========================================
echo.

:: Verificar se node esta instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado! Instale em https://nodejs.org/
    pause
    exit /b 1
)

:: Verificar se ngrok esta na pasta local-setup
if not exist "%~dp0ngrok.exe" (
    echo ERRO: ngrok.exe nao encontrado em %~dp0
    echo Coloque o ngrok.exe na pasta local-setup
    pause
    exit /b 1
)

:: Caminhos
set "WORKER_DIR=C:\klett-robo\worker"
set "SCRIPT_DIR=%~dp0"

:: 1. Iniciar Worker (API + Sync)
echo [1/3] Iniciando Worker...
start "Klett Worker" /d "%WORKER_DIR%" cmd /k "node dist\index.js"

:: Aguardar Worker subir
timeout /t 3 /nobreak >nul

:: 2. Iniciar ngrok Tunnel (dominio estatico)
echo [2/3] Iniciando ngrok Tunnel...
start "Klett Tunnel" cmd /k ""%SCRIPT_DIR%ngrok.exe" http 3000 --domain=absorptive-piebaldly-cordell.ngrok-free.dev"

:: Aguardar tunnel estabilizar
timeout /t 5 /nobreak >nul

:: 3. Iniciar Bot (Playwright WhatsApp)
echo [3/3] Iniciando Bot WhatsApp...
start "Klett Bot" /d "%WORKER_DIR%" cmd /k "node bot\index.js"

:: Aguardar janelas abrirem
timeout /t 5 /nobreak >nul

:: 4. Posicionar janelas no layout 2x2
echo [4/4] Posicionando janelas...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%position-windows.ps1"

echo.
echo ==========================================
echo   Sistema iniciado com sucesso!
echo ==========================================
echo.
echo   Worker:  http://localhost:3000
echo   Tunnel:  https://absorptive-piebaldly-cordell.ngrok-free.dev
echo   Bot:     Verifique a janela do WhatsApp
echo.
echo Pressione qualquer tecla para ENCERRAR TUDO.
pause >nul

:: Encerrar todos os processos
echo.
echo Encerrando processos...
taskkill /fi "WINDOWTITLE eq Klett Worker*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Klett Tunnel*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Klett Bot*" /f >nul 2>&1
echo Todos os processos foram encerrados.
pause
