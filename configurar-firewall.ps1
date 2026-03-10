# ══════════════════════════════════════════════════════
#  NeuroTurn — Configuración de Firewall Windows
#  Ejecutar como Administrador
# ══════════════════════════════════════════════════════
#
#  Uso:
#    1. Click derecho sobre este archivo
#    2. Seleccionar "Ejecutar con PowerShell"
#    3. Si pide permiso de administrador, aceptar

param(
    [int]$Puerto = 3000
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  NeuroTurn — Configurando Firewall...     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar privilegios de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ ERROR: Debes ejecutar este script como Administrador." -ForegroundColor Red
    Write-Host "   Click derecho → Ejecutar con PowerShell (como Administrador)" -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 1
}

$ruleName = "NeuroTurn-Puerto-$Puerto"

# Eliminar regla anterior si existe
$existente = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existente) {
    Remove-NetFirewallRule -DisplayName $ruleName
    Write-Host "🔄 Regla anterior eliminada." -ForegroundColor Yellow
}

# Crear regla de entrada para TCP puerto 3000
try {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Puerto `
        -Action Allow `
        -Profile Any `
        -Description "Permite acceso a NeuroTurn desde la red interna (puerto $Puerto)" | Out-Null

    Write-Host "✅ Regla de firewall creada exitosamente:" -ForegroundColor Green
    Write-Host "   Nombre:    $ruleName" -ForegroundColor White
    Write-Host "   Puerto:    $Puerto (TCP)" -ForegroundColor White
    Write-Host "   Dirección: Entrada" -ForegroundColor White
    Write-Host "   Acción:    Permitir" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Error al crear la regla: $_" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# Mostrar IP local del servidor
Write-Host "── Dirección IP de este servidor ──────────" -ForegroundColor Cyan
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }
foreach ($ip in $ips) {
    Write-Host "   http://$($ip.IPAddress):$Puerto" -ForegroundColor Green
}

Write-Host ""
Write-Host "──────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "Comparte una de las direcciones de arriba" -ForegroundColor White
Write-Host "con los otros equipos de la red." -ForegroundColor White
Write-Host ""

# Verificar que Node.js esté instalado
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "✅ Node.js detectado: $($node.Source)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Node.js NO encontrado." -ForegroundColor Yellow
    Write-Host "   Descárgalo desde: https://nodejs.org (versión LTS)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Configuración completada. Puedes iniciar el servidor con:" -ForegroundColor White
Write-Host "   node server.js" -ForegroundColor Cyan
Write-Host ""
Read-Host "Presiona Enter para cerrar"
