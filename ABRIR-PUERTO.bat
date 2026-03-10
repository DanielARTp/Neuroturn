@echo off
:: ══════════════════════════════════════════════════════════════════
::  NeuroTurn — DIAGNÓSTICO DE RED (CMD)
::  Ejecutar como ADMINISTRADOR
::  Muestra el estado y abre el puerto manualmente
:: ══════════════════════════════════════════════════════════════════
title NeuroTurn — Diagnóstico de Red
color 0A
cls

echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║     NeuroTurn — Diagnóstico y Apertura de Puertos    ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.

:: ── Verificar privilegios ─────────────────────────────────────────
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Debes ejecutar como Administrador.
    echo  Click derecho en el archivo → "Ejecutar como administrador"
    pause & exit /b 1
)

:: ── Ver IP local del servidor ─────────────────────────────────────
echo  [1] Direcciones IP de este servidor:
echo  ─────────────────────────────────────────────────────────
ipconfig | findstr /i "IPv4"
echo.

:: ── Ver si Node.js está corriendo ────────────────────────────────
echo  [2] ¿Node.js está corriendo en el puerto 3000?
echo  ─────────────────────────────────────────────────────────
netstat -ano | findstr ":3000 "
if %ERRORLEVEL% NEQ 0 (
    echo  [!] No se detectó nada en el puerto 3000.
    echo  [!] Inicia primero el servidor: node server.js
) else (
    echo  [OK] Node.js está escuchando en el puerto 3000.
)
echo.

:: ── Verificar perfil de red ───────────────────────────────────────
echo  [3] Perfil de red activo:
echo  ─────────────────────────────────────────────────────────
powershell -Command "Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory | Format-Table -AutoSize"
echo.

:: ── Eliminar reglas viejas ────────────────────────────────────────
echo  [4] Eliminando reglas anteriores de NeuroTurn...
netsh advfirewall firewall delete rule name="NeuroTurn-3000" >nul 2>&1
netsh advfirewall firewall delete rule name="NeuroTurn-Puerto-3000" >nul 2>&1
echo  [OK] Reglas anteriores eliminadas (si existían).
echo.

:: ── Abrir puerto 3000 TCP entrada ────────────────────────────────
echo  [5] Abriendo puerto 3000 (TCP, entrada, todos los perfiles)...
netsh advfirewall firewall add rule ^
    name="NeuroTurn-3000" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3000 ^
    profile=any

if %ERRORLEVEL% EQU 0 (
    echo  [OK] Puerto 3000 abierto correctamente.
) else (
    echo  [ERROR] No se pudo abrir el puerto. Intenta el script PowerShell.
)
echo.

:: ── Agregar excepción para node.exe ──────────────────────────────
echo  [6] Agregando excepción para node.exe...
for /f "tokens=*" %%i in ('where node 2^>nul') do (
    netsh advfirewall firewall add rule ^
        name="NeuroTurn-Node-EXE" ^
        dir=in ^
        action=allow ^
        program="%%i" ^
        profile=any >nul 2>&1
    echo  [OK] Excepción agregada para: %%i
)
echo.

:: ── Verificar reglas creadas ──────────────────────────────────────
echo  [7] Reglas activas de NeuroTurn:
echo  ─────────────────────────────────────────────────────────
netsh advfirewall firewall show rule name="NeuroTurn-3000"
echo.

:: ── Resumen ───────────────────────────────────────────────────────
echo  ════════════════════════════════════════════════════════
echo  LISTO. Ahora en los PCs clientes abre Chrome y escribe:
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set ip=%%a
    setlocal enabledelayedexpansion
    set ip=!ip: =!
    echo     http://!ip!:3000
    endlocal
)
echo.
echo  Si sigue sin funcionar, ejecuta SOLUCIONAR-RED.ps1
echo  (click derecho → Ejecutar con PowerShell como admin)
echo  ════════════════════════════════════════════════════════
echo.
pause
