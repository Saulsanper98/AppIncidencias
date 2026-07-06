<#
.SYNOPSIS
  Activa HTTPS local para dictado por voz (micrófono) en la LAN.

.DESCRIPTION
  Los navegadores bloquean el micrófono en http://192.168.x.x (solo permiten
  HTTPS o localhost). Este script:
    1. Genera un certificado autofirmado (PFX) en certs/server.pfx
    2. Añade TLS_* y HTTPS_PORT al .env
    3. Abre el puerto HTTPS en el firewall
    4. Configura NSSM con las variables TLS
    5. Dispara rebuild del servicio

  Ejecutar UNA VEZ como Administrador en el PC servidor (192.168.12.67).

  Tras instalarlo, los usuarios deben abrir:
    https://192.168.12.67:3443
  y aceptar el certificado interno (o importar certs/server.cer en Equipos de confianza).
#>
[CmdletBinding()]
param(
  [string]$RepoPath    = "C:\Users\Incidencias\AppIncidencias",
  [string]$ServiceName = "CCMGCTicketing",
  [string]$ServerIp    = "192.168.12.67",
  [int]   $HttpsPort   = 3443,
  [int]   $HttpPort    = 3000
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "[i] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "[X] Ejecuta este script como Administrador." -ForegroundColor Red
  exit 1
}

$certDir = Join-Path $RepoPath "certs"
$pfxPath = Join-Path $certDir "server.pfx"
$cerPath = Join-Path $certDir "server.cer"
$envPath = Join-Path $RepoPath ".env"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

# Contraseña aleatoria para el PFX (solo la usa Node en el servidor).
$passChars = (48..57) + (65..90) + (97..122)
$pass = -join ($passChars | Get-Random -Count 32 | ForEach-Object { [char]$_ })

Write-Step "Generando certificado autofirmado para localhost y $ServerIp..."
$existing = Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -eq "CCMGC Ticketing HTTPS" }
foreach ($old in $existing) {
  Remove-Item "Cert:\LocalMachine\My\$($old.Thumbprint)" -Force
}

$cert = New-SelfSignedCertificate `
  -Subject "CN=CCMGC Ticketing" `
  -DnsName @("localhost", "127.0.0.1", $ServerIp) `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(5) `
  -CertStoreLocation "Cert:\LocalMachine\My" `
  -FriendlyName "CCMGC Ticketing HTTPS" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

$pwd = ConvertTo-SecureString -String $pass -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd -Force | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Ok "Certificado guardado en $pfxPath"

# Actualizar .env (reemplaza líneas TLS existentes o las añade al final).
$tlsLines = @(
  "TLS_PFX_PATH=`"certs/server.pfx`""
  "TLS_PFX_PASSPHRASE=`"$pass`""
  "HTTPS_PORT=$HttpsPort"
  "NEXT_PUBLIC_HTTPS_PORT=$HttpsPort"
  "SESSION_COOKIE_SECURE=1"
)

if (Test-Path $envPath) {
  $envContent = Get-Content $envPath -Raw
  foreach ($line in $tlsLines) {
    $key = ($line -split "=", 2)[0]
    if ($envContent -match "(?m)^$([regex]::Escape($key))=") {
      $envContent = $envContent -replace "(?m)^$([regex]::Escape($key))=.*$", $line
    } else {
      $envContent = $envContent.TrimEnd() + "`r`n" + $line + "`r`n"
    }
  }
  Set-Content -Path $envPath -Value $envContent -Encoding UTF8
} else {
  Set-Content -Path $envPath -Value ($tlsLines -join "`r`n") -Encoding UTF8
}
Write-Ok ".env actualizado con TLS_PFX_PATH, HTTPS_PORT=$HttpsPort"

# Firewall HTTPS
$ruleName = "CCMGC Ticketing HTTPS $HttpsPort/TCP"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule -DisplayName $ruleName `
    -Description "HTTPS para App Incidencias (dictado por voz en LAN)." `
    -Direction Inbound -Protocol TCP -LocalPort $HttpsPort `
    -Action Allow -Profile Domain,Private,Public | Out-Null
  Write-Ok "Regla firewall: $ruleName"
} else {
  Write-Warn "Regla firewall ya existía: $ruleName"
}

# NSSM: inyectar variables TLS (el servicio no lee .env directamente para TLS).
$nssmExe = Join-Path $RepoPath "tools\nssm\nssm.exe"
if (Test-Path $nssmExe) {
  $pfxAbs = $pfxPath
  & $nssmExe set $ServiceName AppEnvironmentExtra `
    "NODE_ENV=production" `
    "HOST=0.0.0.0" `
    "PORT=$HttpPort" `
    "HTTPS_PORT=$HttpsPort" `
    "TLS_PFX_PATH=$pfxAbs" `
    "TLS_PFX_PASSPHRASE=$pass" `
    "TZ=Atlantic/Canary" | Out-Null
  Write-Ok "NSSM AppEnvironmentExtra actualizado con TLS"
} else {
  Write-Warn "No se encontró NSSM. Añade manualmente TLS_PFX_PATH al servicio."
}

Write-Host ""
Write-Host "==== HTTPS listo ====" -ForegroundColor Green
Write-Host "  URL con micrófono: https://${ServerIp}:${HttpsPort}" -ForegroundColor Cyan
Write-Host "  HTTP sigue en:     http://${ServerIp}:${HttpPort} (sin dictado)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  En cada PC del equipo:" -ForegroundColor Yellow
Write-Host "    1. Abre la URL HTTPS de arriba" -ForegroundColor Yellow
Write-Host "    2. Acepta el certificado interno (o instala certs\server.cer en Equipos de confianza)" -ForegroundColor Yellow
Write-Host "    3. Candado → Configuración del sitio → Micrófono → Permitir" -ForegroundColor Yellow
Write-Host ""

Write-Step "Disparando rebuild del servicio..."
& powershell -ExecutionPolicy Bypass -File (Join-Path $RepoPath "scripts\rebuild-service.ps1")
exit $LASTEXITCODE
