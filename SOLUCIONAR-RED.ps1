# ══════════════════════════════════════════════════════════════════════
#  NeuroTurn — DIAGNÓSTICO Y SOLUCIÓN DE RED
#  Ejecutar como ADMINISTRADOR en el PC servidor
#  Click derecho → "Ejecutar con PowerShell"
# ══════════════════════════════════════════════════════════════════════

param([int]$Puerto = 3000)

$ErrorActionPreference = "SilentlyContinue"

function Titulo($txt) {
    Write-Host ""
    Write-Host "━━━ $txt ━━━" -ForegroundColor Cyan
}

function OK($txt)   { Write-Host "  ✅ $txt" -ForegroundColor Green }
function WARN($txt) { Write-Host "  ⚠️  $txt" -ForegroundColor Yellow }
function ERR($txt)  { Write-Host "  ❌ $txt" -ForegroundColor Red }
function INFO($txt) { Write-Host "     $txt" -ForegroundColor White }

# ── Verificar que corremos como Administrador ──────────────────────
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
    ERR "Debes ejecutar este script como ADMINISTRADOR."
    INFO "Click derecho → Ejecutar con PowerShell (como administrador)"
    Read-Host "`nPresiona Enter para salir"
    exit 1
}

Clear-Host
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   NeuroTurn — Diagnóstico y Configuración de Red            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ══════════════════════════════════════════════════════════════════════
# DIAGNÓSTICO 1 — ¿Node.js está escuchando en el puerto?
# ══════════════════════════════════════════════════════════════════════
Titulo "DIAGNÓSTICO 1 — Estado del servidor Node.js"

$netstat = netstat -ano | Select-String ":$Puerto "
if ($netstat) {
    OK "Node.js está escuchando en el puerto $Puerto"
    $netstat | ForEach-Object { INFO $_.Line.Trim() }
} else {
    ERR "Node.js NO está corriendo en el puerto $Puerto"
    WARN "Inicia el servidor primero con:  node server.js"
    WARN "Este script seguirá configurando el firewall de todos modos."
}

# ══════════════════════════════════════════════════════════════════════
# DIAGNÓSTICO 2 — IPs disponibles en este servidor
# ══════════════════════════════════════════════════════════════════════
Titulo "DIAGNÓSTICO 2 — Direcciones IP de este servidor"

$ips = Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }

if ($ips) {
    foreach ($ip in $ips) {
        OK "http://$($ip.IPAddress):$Puerto   ← usa esta en los clientes"
        INFO "  Adaptador: $($ip.InterfaceAlias)"
    }
} else {
    ERR "No se encontraron IPs de red. ¿Está conectado a la red?"
}

# ══════════════════════════════════════════════════════════════════════
# DIAGNÓSTICO 3 — Perfil de red actual
# ══════════════════════════════════════════════════════════════════════
Titulo "DIAGNÓSTICO 3 — Perfil de red (importante para el firewall)"

$perfiles = Get-NetConnectionProfile
foreach ($p in $perfiles) {
    $color = if ($p.NetworkCategory -eq "Private") { "Green" } else { "Yellow" }
    Write-Host "  Adaptador: $($p.InterfaceAlias)" -ForegroundColor $color
    Write-Host "  Perfil:    $($p.NetworkCategory)" -ForegroundColor $color
    if ($p.NetworkCategory -eq "Public") {
        WARN "¡Perfil PÚBLICO detectado! Las reglas de firewall privadas no aplican."
        INFO "Cambiando perfil a Privado..."
        Set-NetConnectionProfile -InterfaceAlias $p.InterfaceAlias -NetworkCategory Private
        OK "Perfil cambiado a Privado."
    } else {
        OK "Perfil Privado/Dominio — correcto."
    }
}

# ══════════════════════════════════════════════════════════════════════
# ACCIÓN 1 — Eliminar reglas viejas de NeuroTurn
# ══════════════════════════════════════════════════════════════════════
Titulo "ACCIÓN 1 — Limpiando reglas anteriores de NeuroTurn"

$reglasViejas = Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*NeuroTurn*" }
if ($reglasViejas) {
    $reglasViejas | Remove-NetFirewallRule
    OK "Reglas anteriores eliminadas ($($reglasViejas.Count))"
} else {
    INFO "No había reglas anteriores."
}

# ══════════════════════════════════════════════════════════════════════
# ACCIÓN 2 — Crear reglas nuevas (TCP entrada, TODOS los perfiles)
# ══════════════════════════════════════════════════════════════════════
Titulo "ACCIÓN 2 — Creando reglas de firewall"

# Regla para TODOS los perfiles (Privado + Dominio + Público)
try {
    New-NetFirewallRule `
        -DisplayName "NeuroTurn-TCP-$Puerto-Entrada" `
        -Description  "NeuroTurn: permite acceso al servidor Node.js en la red interna" `
        -Direction    Inbound `
        -Protocol     TCP `
        -LocalPort    $Puerto `
        -Action       Allow `
        -Profile      Any `
        -Enabled      True | Out-Null
    OK "Regla TCP entrada creada (puerto $Puerto, todos los perfiles)"
} catch {
    ERR "No se pudo crear la regla: $_"
}

# Regla de salida también (por si acaso)
try {
    New-NetFirewallRule `
        -DisplayName "NeuroTurn-TCP-$Puerto-Salida" `
        -Description  "NeuroTurn: permite respuestas del servidor Node.js" `
        -Direction    Outbound `
        -Protocol     TCP `
        -LocalPort    $Puerto `
        -Action       Allow `
        -Profile      Any `
        -Enabled      True | Out-Null
    OK "Regla TCP salida creada (puerto $Puerto, todos los perfiles)"
} catch {
    ERR "No se pudo crear la regla de salida: $_"
}

# ══════════════════════════════════════════════════════════════════════
# ACCIÓN 3 — Agregar excepción también con netsh (método alternativo)
# ══════════════════════════════════════════════════════════════════════
Titulo "ACCIÓN 3 — Excepción adicional con netsh"

# Eliminar si existe
netsh advfirewall firewall delete rule name="NeuroTurn-$Puerto" | Out-Null

# Agregar nueva
$resultado = netsh advfirewall firewall add rule `
    name="NeuroTurn-$Puerto" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=$Puerto `
    profile=any

if ($LASTEXITCODE -eq 0) {
    OK "Excepción netsh creada correctamente."
} else {
    WARN "netsh: $resultado"
}

# ══════════════════════════════════════════════════════════════════════
# ACCIÓN 4 — Verificar si hay antivirus/firewall de terceros
# ══════════════════════════════════════════════════════════════════════
Titulo "ACCIÓN 4 — Verificando software de seguridad adicional"

$avSoftware = Get-WmiObject -Namespace "root\SecurityCenter2" -Class AntiVirusProduct 2>$null
$fwSoftware = Get-WmiObject -Namespace "root\SecurityCenter2" -Class FirewallProduct 2>$null

if ($avSoftware) {
    foreach ($av in $avSoftware) {
        WARN "Antivirus detectado: $($av.displayName)"
        INFO "Si el problema persiste, agrega una excepción en $($av.displayName) para Node.js (puerto $Puerto)"
    }
} else {
    OK "No se detectó antivirus de terceros."
}

if ($fwSoftware) {
    foreach ($fw in $fwSoftware) {
        WARN "Firewall adicional detectado: $($fw.displayName)"
        INFO "Debes abrir el puerto $Puerto también en $($fw.displayName)"
    }
} else {
    OK "No se detectó firewall de terceros."
}

# ══════════════════════════════════════════════════════════════════════
# ACCIÓN 5 — Verificar que Node.js tiene permiso en el firewall de apps
# ══════════════════════════════════════════════════════════════════════
Titulo "ACCIÓN 5 — Excepción para Node.js ejecutable"

$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if ($nodePath) {
    OK "Node.js encontrado en: $nodePath"

    # Agregar excepción por ejecutable también
    try {
        New-NetFirewallRule `
            -DisplayName "NeuroTurn-NodeExe-$Puerto" `
            -Description  "NeuroTurn: permite conexiones entrantes a node.exe" `
            -Direction    Inbound `
            -Program      $nodePath `
            -Action       Allow `
            -Profile      Any `
            -Enabled      True | Out-Null
        OK "Excepción para node.exe creada."
    } catch {
        INFO "Excepción por ejecutable (no crítica): $_"
    }
} else {
    WARN "No se encontró node.exe en el PATH. ¿Está Node.js instalado?"
}

# ══════════════════════════════════════════════════════════════════════
# DIAGNÓSTICO FINAL — Verificar reglas activas
# ══════════════════════════════════════════════════════════════════════
Titulo "RESUMEN — Reglas activas de NeuroTurn"

Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*NeuroTurn*" } |
    ForEach-Object {
        $portFilter = $_ | Get-NetFirewallPortFilter
        OK "$($_.DisplayName)  →  Dir: $($_.Direction)  Puerto: $($portFilter.LocalPort)  Perfil: $($_.Profile)"
    }

# ══════════════════════════════════════════════════════════════════════
# INSTRUCCIONES FINALES
# ══════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                CONFIGURACIÓN COMPLETADA                     ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║                                                              ║"
Write-Host "║  Próximos pasos:                                             ║"
Write-Host "║                                                              ║"
Write-Host "║  1. Asegúrate de que node server.js está corriendo           ║"
Write-Host "║  2. En los PCs clientes, abre Chrome y escribe:              ║"

foreach ($ip in $ips) {
    $url = "http://$($ip.IPAddress):$Puerto"
    Write-Host "║     $($url.PadRight(56))║"
}

Write-Host "║                                                              ║"
Write-Host "║  3. Si aún no carga, ejecuta la prueba de diagnóstico:       ║"
Write-Host "║     Test-NetConnection -ComputerName <IP-servidor> -Port $Puerto  ║"
Write-Host "║     (ejecutar desde el PC cliente en PowerShell)            ║"
Write-Host "║                                                              ║"
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Read-Host "Presiona Enter para cerrar"
