<#
.SYNOPSIS
  Reinicia el servicio CCMGCTicketing disparando la tarea programada
  configurada por `setup-restart-task.ps1`. NO requiere privilegios
  elevados si la tarea está bien configurada.

.DESCRIPTION
  Llama a `Start-ScheduledTask -TaskName CCMGCTicketing-Restart`, espera a
  que termine y reporta el estado final del servicio. Si la tarea no
  existe avisa para que ejecutes `setup-restart-task.ps1` primero.
#>
[CmdletBinding()]
param(
  [string]$TaskName = "CCMGCTicketing-Restart",
  [string]$ServiceName = "CCMGCTicketing",
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Error "La tarea '$TaskName' no existe. Ejecuta primero (como admin): .\scripts\setup-restart-task.ps1"
  exit 2
}

Write-Host "[i] Disparando tarea '$TaskName'..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $TaskName

# Esperar a que termine la ejecución.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$state = (Get-ScheduledTask -TaskName $TaskName).State
while ($state -eq "Running" -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  $state = (Get-ScheduledTask -TaskName $TaskName).State
}

if ($state -eq "Running") {
  Write-Warning "La tarea sigue ejecutándose tras $TimeoutSeconds s. Comprueba manualmente con Get-ScheduledTaskInfo."
}

Start-Sleep -Seconds 2
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Error "El servicio '$ServiceName' no existe."
  exit 3
}

Write-Host "[i] Estado actual del servicio: $($service.Status)" -ForegroundColor $( if ($service.Status -eq "Running") { "Green" } else { "Yellow" } )

# Validamos que el proceso ha sido reiniciado de verdad: el StartTime debe ser reciente.
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
if ($procs) {
  $procs | Select-Object ProcessId, @{n='StartedAt';e={$_.CreationDate}} | Format-Table -AutoSize | Out-String | Write-Host
}

if ($service.Status -ne "Running") {
  exit 1
}
exit 0
