#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Configura DOS tareas programadas para gestionar el servicio CCMGCTicketing
  sin requerir privilegios elevados para dispararlas:

    - CCMGCTicketing-Restart : reinicia el servicio (corto, ~5s).
    - CCMGCTicketing-Rebuild : detiene servicio → prisma migrate/generate →
      next build → arranca servicio. Usado tras cambios en el esquema.

.DESCRIPTION
  - Ambas tareas corren como NT AUTHORITY\SYSTEM.
  - Se concede permiso de ejecución al grupo local "Users", para que cualquier
    sesión interactiva pueda lanzarlas con Start-ScheduledTask sin UAC.
  - Ejecuta este script UNA VEZ desde una shell de PowerShell elevada.
  - Después, usa:
      * scripts/restart-service.ps1  → reinicio rápido (build ya hecho)
      * scripts/rebuild-service.ps1  → reconstrucción completa

.NOTES
  Sólo se permite operar sobre el servicio "CCMGCTicketing", así que el
  riesgo de privilegios queda muy acotado.
#>
[CmdletBinding()]
param(
  [string]$RestartTaskName = "CCMGCTicketing-Restart",
  [string]$RebuildTaskName = "CCMGCTicketing-Rebuild",
  [string]$ServiceName     = "CCMGCTicketing",
  [string]$RepoPath        = "C:\Users\Incidencias\AppIncidencias"
)

$ErrorActionPreference = "Stop"

function Set-UsersExecutePermission {
  param([string]$TaskName)
  # Concede al grupo local Users (BU = SID S-1-5-32-545) permisos Read+Execute
  # en la SDDL de la tarea, sin tocar el resto.
  try {
    $scheduler = New-Object -ComObject "Schedule.Service"
    $scheduler.Connect()
    $folder = $scheduler.GetFolder("\")
    $task = $folder.GetTask($TaskName)
    $sddl = $task.GetSecurityDescriptor(0xF)
    if ($sddl -notmatch "\(A;;[A-Z]*GR[A-Z]*GX[A-Z]*;;;BU\)" -and $sddl -notmatch "\(A;;[A-Z]*GX[A-Z]*GR[A-Z]*;;;BU\)") {
      $sddl += "(A;;GRGX;;;BU)"
      $task.SetSecurityDescriptor($sddl, 0)
      Write-Host "[OK] [$TaskName] SDDL actualizada (acceso para Users)." -ForegroundColor Green
    } else {
      Write-Host "[i] [$TaskName] Grupo Users ya tenía permisos." -ForegroundColor Yellow
    }
  } catch {
    Write-Warning "[$TaskName] No se pudo actualizar la SDDL: $($_.Exception.Message)"
  }
}

function Register-CcmgcTask {
  param(
    [string]$TaskName,
    [string]$Argument,
    [string]$Description,
    [int]   $TimeoutMinutes
  )
  Write-Host "[i] Creando/actualizando tarea '$TaskName'..." -ForegroundColor Cyan
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Argument
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes $TimeoutMinutes)
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "[i] [$TaskName] Existía. Sobrescribiendo..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Principal $principal `
    -Settings $settings `
    -Description $Description | Out-Null
  Write-Host "[OK] [$TaskName] Creada." -ForegroundColor Green
  Set-UsersExecutePermission -TaskName $TaskName
}

# ---- Restart: comando inline (rápido) ----
$restartArg = "-NoProfile -ExecutionPolicy Bypass -Command `"Restart-Service -Name '$ServiceName' -Force`""
Register-CcmgcTask `
  -TaskName $RestartTaskName `
  -Argument $restartArg `
  -Description "Reinicia el servicio $ServiceName. Configurada por scripts/setup-restart-task.ps1." `
  -TimeoutMinutes 5

# ---- Rebuild: invoca scripts/rebuild.ps1 (largo) ----
$rebuildScript = Join-Path $RepoPath "scripts\rebuild.ps1"
if (-not (Test-Path $rebuildScript)) {
  Write-Warning "No encuentro $rebuildScript. La tarea Rebuild apuntará a él de todas formas; asegúrate de que exista cuando vayas a usarla."
}
$rebuildArg = "-NoProfile -ExecutionPolicy Bypass -File `"$rebuildScript`""
Register-CcmgcTask `
  -TaskName $RebuildTaskName `
  -Argument $rebuildArg `
  -Description "Reconstruye y reinicia $ServiceName tras cambios de esquema/código. Llama a scripts/rebuild.ps1 como SYSTEM." `
  -TimeoutMinutes 20

Write-Host ""
Write-Host "[OK] Tareas listas. Para usarlas sin UAC desde sesión normal:" -ForegroundColor Green
Write-Host "  - Reinicio rápido         : powershell -ExecutionPolicy Bypass -File .\scripts\restart-service.ps1" -ForegroundColor Cyan
Write-Host "  - Rebuild completo        : powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-service.ps1" -ForegroundColor Cyan
