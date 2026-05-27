<#
.SYNOPSIS
  Desinstala el servicio NSSM "CCMGCTicketing" y opcionalmente la regla de firewall.

.EXAMPLE
  # Ejecutar como Administrador
  .\scripts\uninstall-service.ps1
#>
[CmdletBinding()]
param(
  [string]$ServiceName = "CCMGCTicketing",
  [int]$Port = 3000,
  [switch]$KeepFirewallRule
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "[X] Ejecuta este script como Administrador." -ForegroundColor Red
  exit 1
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$nssmExe = Join-Path $ProjectRoot "tools\nssm\nssm.exe"
if (-not (Test-Path $nssmExe)) {
  $sys = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($sys) { $nssmExe = $sys.Source }
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "==> Parando y eliminando servicio '$ServiceName'..." -ForegroundColor Cyan
  if ($nssmExe -and (Test-Path $nssmExe)) {
    if ($svc.Status -ne 'Stopped') { & $nssmExe stop $ServiceName confirm | Out-Null; Start-Sleep -Seconds 2 }
    & $nssmExe remove $ServiceName confirm | Out-Null
  } else {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
  }
  Write-Host "    [OK] Servicio eliminado." -ForegroundColor Green
} else {
  Write-Host "==> Servicio '$ServiceName' no estaba instalado." -ForegroundColor Yellow
}

if (-not $KeepFirewallRule) {
  $ruleName = "CCMGC Ticketing $Port/TCP"
  $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($rule) {
    Remove-NetFirewallRule -DisplayName $ruleName
    Write-Host "    [OK] Regla de firewall eliminada: $ruleName" -ForegroundColor Green
  }
}

Write-Host "==> Desinstalacion completada." -ForegroundColor Green
