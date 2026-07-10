<#
.SYNOPSIS
  Empaqueta los datos de producción para migrar la app a Linux (Debian).

.DESCRIPTION
  Crea un zip con:
    - .env
    - Base SQLite (según DATABASE_URL en .env)
    - public/uploads/
    - certs/ (si existe)

  Copia el zip a la VM Debian y descomprímelo sobre el clon del repo
  antes de ejecutar scripts/linux/bootstrap.sh

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\export-migration-bundle.ps1
#>
[CmdletBinding()]
param(
  [string]$OutputDir = ".\migration-bundle"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Get-DatabasePath {
  $envFile = Join-Path $ProjectRoot ".env"
  if (-not (Test-Path $envFile)) { return $null }
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
  if (-not $line) { return $null }
  $url = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if ($url -notmatch '^file:') { return $null }
  $rel = $url -replace '^file:\.?/?', ''
  if ($rel -match '^[a-zA-Z]:\\' -or $rel.StartsWith('/')) {
    return $rel
  }
  return Join-Path (Join-Path $ProjectRoot "prisma") ($rel -replace '^prisma/', '')
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleRoot = Join-Path $OutputDir "ccmgc-migration-$stamp"
New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null

Write-Host "[i] Empaquetando migración en $bundleRoot" -ForegroundColor Cyan

if (Test-Path ".\.env") {
  Copy-Item ".\.env" (Join-Path $bundleRoot ".env")
  Write-Host "    .env" -ForegroundColor Green
} else {
  Write-Warning "No hay .env en el proyecto."
}

$db = Get-DatabasePath
if ($db -and (Test-Path $db)) {
  $dbDest = Join-Path $bundleRoot "prisma"
  New-Item -ItemType Directory -Path $dbDest -Force | Out-Null
  Copy-Item $db (Join-Path $dbDest (Split-Path $db -Leaf))
  Write-Host "    BD: $db" -ForegroundColor Green
} else {
  Write-Warning "No se encontró la base SQLite ($db)."
}

if (Test-Path ".\public\uploads") {
  $upDest = Join-Path $bundleRoot "public\uploads"
  New-Item -ItemType Directory -Path (Split-Path $upDest -Parent) -Force | Out-Null
  Copy-Item ".\public\uploads" $upDest -Recurse
  Write-Host "    public\uploads\" -ForegroundColor Green
}

if (Test-Path ".\certs") {
  Copy-Item ".\certs" (Join-Path $bundleRoot "certs") -Recurse
  Write-Host "    certs\" -ForegroundColor Green
}

$readme = @"
CCMGC Ticketing — paquete de migración Windows → Linux / Docker
Generado: $stamp

En la VM Debian (con el repo clonado en /opt/ccmgc-ticketing):

  sudo mkdir -p /opt/ccmgc-ticketing
  sudo tar -xf ccmgc-migration-$stamp.tar.gz -C /opt/ccmgc-ticketing --strip-components=1
  # o copia manualmente .env, prisma/*.db y public/uploads/ sobre el repo

  cd /opt/ccmgc-ticketing
  sudo chmod +x scripts/linux/*.sh
  sudo bash scripts/linux/bootstrap.sh

En el host Docker / Portainer (node-prod):

  scp el zip al host Docker
  sudo bash scripts/docker/import-migration-bundle.sh /tmp/ccmgc-migration-$stamp.zip
  cd /opt/app-incidencias/prod/src && sudo docker build -t ccmgc-ticketing:prod .
  Ver docs/DEPLOY-DOCKER-PORTAINER.md

Ver docs/DEPLOY-DEBIAN.md y AGENTS-LINUX.md
"@
Set-Content -Path (Join-Path $bundleRoot "LEEME.txt") -Value $readme -Encoding UTF8

$zipPath = Join-Path $OutputDir "ccmgc-migration-$stamp.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleRoot "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "[OK] Bundle: $zipPath" -ForegroundColor Green
Write-Host "     Linux: docs/DEPLOY-DEBIAN.md" -ForegroundColor Cyan
Write-Host "     Docker/Portainer: docs/DEPLOY-DOCKER-PORTAINER.md" -ForegroundColor Cyan
