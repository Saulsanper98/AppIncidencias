<#
.SYNOPSIS
  Dispara la tarea programada CCMGCTicketing-Rebuild, que reconstruye y
  reinicia la app (prisma migrate/generate + next build + restart service).

.DESCRIPTION
  Pensado para llamarse desde una sesión NO administrativa (por ejemplo el
  agente IDE). Requiere que `scripts/setup-restart-task.ps1` haya creado la
  tarea `CCMGCTicketing-Rebuild` con permisos para el grupo Users.

  La tarea corre como SYSTEM y por tanto puede parar/arrancar servicios y
  reemplazar los DLL generados por Prisma. Aquí solamente la disparamos y
  esperamos a que termine para informar.
#>
[CmdletBinding()]
param(
  [string]$TaskName       = "CCMGCTicketing-Rebuild",
  [string]$ServiceName    = "CCMGCTicketing",
  [int]   $TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

# Comprobaciones rápidas.
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "[X] La tarea programada '$TaskName' no existe." -ForegroundColor Red
  Write-Host "    Ejecuta una vez como administrador: powershell -ExecutionPolicy Bypass -File .\scripts\setup-restart-task.ps1" -ForegroundColor Yellow
  exit 1
}

Write-Host "[i] Disparando tarea '$TaskName' (rebuild + restart). Puede tardar varios minutos..." -ForegroundColor Cyan
$start = Get-Date
try {
  Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
} catch {
  Write-Host "[X] No se pudo iniciar la tarea: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Esperar a que la tarea pase de Running a Ready.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { break }
  if ($t.State -eq "Ready") { break }
  Write-Host "[i] Tarea en ejecución... ($($t.State))" -ForegroundColor DarkGray
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
if ($info) {
  $exit = $info.LastTaskResult
  $elapsed = ([int]((Get-Date) - $start).TotalSeconds)
  if ($exit -eq 0) {
    Write-Host "[OK] Rebuild completado en ${elapsed}s (LastTaskResult=0)." -ForegroundColor Green
  } else {
    Write-Host "[X] La tarea terminó con LastTaskResult=$exit tras ${elapsed}s. Revisa logs\rebuild-*.log" -ForegroundColor Red
    exit $exit
  }
}

# Estado actual del servicio.
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host "[i] Estado del servicio $ServiceName -> $($svc.Status)" -ForegroundColor Cyan
} else {
  Write-Host "[!] Servicio $ServiceName no encontrado." -ForegroundColor Yellow
}

exit 0
