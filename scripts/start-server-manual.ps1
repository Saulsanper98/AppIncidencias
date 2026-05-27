<#
.SYNOPSIS
  Arranca el servidor de produccion manualmente (sin servicio), bindeando 0.0.0.0.
  Util para probar/depurar antes de instalar el servicio NSSM.

.EXAMPLE
  cd C:\Users\Incidencias\AppIncidencias
  .\scripts\start-server-manual.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 3000
)
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot ".next"))) {
  Write-Host "==> Compilando la app (npm run build)..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Fallo npm run build" }
}

$env:HOST      = "0.0.0.0"
$env:PORT      = "$Port"
$env:NODE_ENV  = "production"

Write-Host "==> Iniciando Next.js en http://0.0.0.0:$Port (Ctrl+C para parar)..." -ForegroundColor Cyan
npm run start:server
