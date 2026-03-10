@echo off
title NeuroTurn v2.0 - Servidor de Produccion
color 0A
cls

echo.
echo  ================================================
echo    NeuroTurn v2.0 — Iniciando servidor...
echo  ================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  ERROR: Node.js no esta instalado.
    echo  Descarga la version LTS desde: https://nodejs.org
    pause & exit /b 1
)

cd /d "%~dp0"

:: Instalar dependencias si no existen
if not exist "node_modules" (
    echo  Instalando dependencias (primer inicio)...
    npm install
    echo.
)

:: Copiar .env.example a .env si no existe
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo  Archivo .env creado. Edita la conexion a SQL Server si es necesario.
    echo.
)

echo  Iniciando servidor en puerto 3000...
echo  La direccion IP de red aparecera en pantalla al iniciar.
echo.
echo  ================================================
echo  Ctrl+C para detener el servidor
echo  ================================================
echo.

node server.js

pause
