<#
.SYNOPSIS
  Limpia procesos Node huerfanos que consumen CPU/RAM sin afectar produccion (puerto 3000).
#>
[CmdletBinding()]
param(
  [int]$ProductionPort = 3000,
  [int[]]$DevPorts = @(3001, 3010)
)

$ErrorActionPreference = "SilentlyContinue"

function Stop-Tree {
  param([int]$ProcessId, [string]$Reason)
  if (-not $ProcessId) { return }
  $onProd = Get-NetTCPConnection -LocalPort $ProductionPort -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -eq $ProcessId }
  if ($onProd) {
    Write-Host "[skip] PID $ProcessId escucha en :$ProductionPort (produccion)" -ForegroundColor Yellow
    return
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "[ok] PID $ProcessId - $Reason" -ForegroundColor Green
}

Write-Host "[i] Produccion en :$ProductionPort" -ForegroundColor Cyan
$prod = Get-NetTCPConnection -LocalPort $ProductionPort -State Listen -ErrorAction SilentlyContinue
if ($prod) {
  Write-Host "    PID $($prod.OwningProcess)" -ForegroundColor Cyan
}

foreach ($port in $DevPorts) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($l in $listeners) {
    Stop-Tree -ProcessId $l.OwningProcess -Reason "next dev huerfano en :$port"
  }
}

Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $cmd = if ($_.CommandLine) { $_.CommandLine } else { "" }
  $processId = $_.ProcessId
  if ($cmd -match "mongodb-mcp-server") {
    Stop-Tree -ProcessId $processId -Reason "mongodb-mcp-server zombie"
  } elseif ($cmd -match "next.*build" -or $cmd -match "jest-worker/processChild") {
    Stop-Tree -ProcessId $processId -Reason "build/worker atascado"
  } elseif ($cmd -match "prisma.*studio") {
    Stop-Tree -ProcessId $processId -Reason "Prisma Studio"
  } elseif ($cmd -match "next dev" -and $cmd -notmatch "start-server") {
    Stop-Tree -ProcessId $processId -Reason "next dev residual"
  }
}

$remaining = (Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "[i] Procesos node restantes: $remaining" -ForegroundColor Cyan
