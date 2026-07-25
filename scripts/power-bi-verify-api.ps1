<#
.SYNOPSIS
  Verifica Fase 1 del plan Power BI: API /api/bi/* con POWER_BI_API_KEY.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\power-bi-verify-api.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\power-bi-verify-api.ps1 -BaseUrl http://192.168.12.67:3000
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$EnvFile = ".\.env"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Read-EnvKey([string]$path, [string]$name) {
  if (-not (Test-Path $path)) { return $null }
  $line = Get-Content $path | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  $val = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
  return $val
}

function Test-BiEndpoint {
  param(
    [string]$Label,
    [string]$Path,
    [scriptblock]$Assert
  )
  $uri = "$BaseUrl$Path"
  try {
    $resp = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 30
    & $Assert $resp
    Write-Host "[OK] $Label" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "[X] $Label - $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host ""
Write-Host "=== Verificacion API Power BI (Fase 1) ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl"
Write-Host ""

$apiKey = Read-EnvKey $EnvFile "POWER_BI_API_KEY"
if (-not $apiKey) {
  Write-Host "[X] POWER_BI_API_KEY no encontrada en $EnvFile" -ForegroundColor Red
  exit 1
}
Write-Host "[i] Clave API leida de .env ($($apiKey.Length) chars)" -ForegroundColor Gray

$headers = @{ Authorization = "Bearer $apiKey" }
$passed = 0
$total = 0

$total++
try {
  Invoke-RestMethod -Uri "$BaseUrl/api/bi/health" -TimeoutSec 10 | Out-Null
  Write-Host "[X] /health sin clave deberia fallar" -ForegroundColor Red
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Write-Host "[OK] Sin clave -> 401" -ForegroundColor Green
    $passed++
  } else {
    Write-Host "[X] Sin clave - $($_.Exception.Message)" -ForegroundColor Red
  }
}

$total++
if (Test-BiEndpoint "GET /api/bi/health" "/api/bi/health" {
    param($r)
    if (-not $r.ok) { throw "ok=false" }
  }) { $passed++ }

$total++
if (Test-BiEndpoint "GET /api/bi/flota" "/api/bi/flota" {
    param($r)
    if ($null -eq $r.items) { throw "sin items" }
    if ($r.total -lt 0) { throw "total invalido" }
    Write-Host "     buses en catalogo: $($r.total)" -ForegroundColor Gray
  }) { $passed++ }

$ticketsPath = '/api/bi/tickets?range=last30&pageSize=10'
$total++
if (Test-BiEndpoint "GET /api/bi/tickets" $ticketsPath {
    param($r)
    if ($null -eq $r.items) { throw "sin items" }
    Write-Host "     incidencias pagina: $($r.items.Count) / total $($r.total)" -ForegroundColor Gray
    if ($r.items.Count -gt 0) {
      $sample = $r.items[0]
      $required = @("vehiculo", "operadora", "tipologia", "impacto", "criticidad", "linea", "servicio", "servicio_detenido", "horas_gestion")
      foreach ($f in $required) {
        if ($null -eq $sample.PSObject.Properties[$f]) { throw "falta campo $f" }
      }
    }
  }) { $passed++ }

$total++
if (Test-BiEndpoint "GET /api/bi/kpis" "/api/bi/kpis?range=last30" {
    param($r)
    if ($null -eq $r.totales) { throw "sin totales" }
    if ($null -eq $r.evolucion_mensual) { throw "sin evolucion_mensual" }
    Write-Host "     incidencias periodo: $($r.totales.incidencias)" -ForegroundColor Gray
  }) { $passed++ }

$color = "Yellow"
if ($passed -eq $total) { $color = "Green" }
Write-Host ""
Write-Host "Resultado: $passed / $total comprobaciones OK" -ForegroundColor $color
if ($passed -ne $total) { exit 1 }
exit 0
