<#
.SYNOPSIS
  Reconstruye y reinicia la aplicación CCMGC Ticketing en este equipo.

.DESCRIPTION
  Pensado para ejecutarse como SYSTEM desde una tarea programada (o, en su
  defecto, como administrador) para evitar que el servicio bloquee los DLL
  generados por Prisma durante la regeneración del cliente.

  Pasos:
    1. Para el servicio CCMGCTicketing.
    2. Ejecuta `prisma migrate deploy` para aplicar migraciones pendientes.
    3. Regenera el cliente Prisma (`prisma generate`).
    4. Hace `next build` (`npm run build`).
    5. Arranca el servicio de nuevo.

  Si alguno de los pasos 2-4 falla, NO arranca el servicio para no servir
  artefactos rotos. El log de cada paso queda en la carpeta `logs/`.

.NOTES
  El servicio del proyecto se llama "CCMGCTicketing".
  Asume que el repo está en `C:\Users\Incidencias\AppIncidencias` y que node está
  en `C:\Program Files\nodejs`. Ambos valores son parametrizables.
#>
[CmdletBinding()]
param(
  [string]$ServiceName = "CCMGCTicketing",
  [string]$RepoPath    = "C:\Users\Incidencias\AppIncidencias",
  [string]$NodePath    = "C:\Program Files\nodejs",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$null = New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "logs")
$logFile = Join-Path $RepoPath "logs\rebuild-$(Get-Date -Format yyyyMMdd-HHmmss).log"

function Log {
  param($Message, [string]$Color = "White")
  # Acepta cualquier objeto (string, ErrorRecord, etc.) y lo convierte a string
  # de forma robusta. Si llega un objeto multilínea, lo descompone por líneas
  # para que el log quede legible.
  $ts = Get-Date -Format "HH:mm:ss"
  $text = if ($null -eq $Message) { "" } else { ($Message | Out-String).TrimEnd() }
  foreach ($line in ($text -split "`r?`n")) {
    $out = "[$ts] $line"
    Write-Host $out -ForegroundColor $Color
    Add-Content -Path $logFile -Value $out
  }
}

function Invoke-External {
  param(
    [string]$Exe,
    # NO usar $Args: colisiona con la variable automática de PowerShell y el
    # binding se silenciaría → el comando recibiría 0 argumentos.
    [string[]]$Arguments,
    [string]$Label
  )
  # Ejecuta un comando externo (npx/npm/prisma/next) sin que PowerShell trate
  # stderr como un error terminante. Devuelve el código de salida real en
  # $LASTEXITCODE.
  Log "[i] $Label" "Cyan"
  $argDump = ($Arguments -join " ")
  Log "[i] CMD: `"$Exe`" $argDump" "DarkGray"
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Exe @Arguments 2>&1 | ForEach-Object { Log $_ }
  } finally {
    $ErrorActionPreference = $previous
  }
  return $LASTEXITCODE
}

Log "==== Rebuild CCMGC Ticketing ====" "Cyan"
Log "Repo: $RepoPath"
Log "Node: $NodePath"
Log "Log : $logFile"

$npmCmd    = Join-Path $NodePath "npm.cmd"
# Llamamos los binarios locales del proyecto directamente (no npx/npm exec)
# para evitar que se abra el "npm script environment" cuando se ejecuta como
# SYSTEM, donde no hay TTY ni perfil de usuario.
$prismaCmd = Join-Path $RepoPath "node_modules\.bin\prisma.cmd"
$nextCmd   = Join-Path $RepoPath "node_modules\.bin\next.cmd"
foreach ($exe in @($npmCmd, $prismaCmd, $nextCmd)) {
  if (-not (Test-Path $exe)) {
    Log "[X] No encuentro $exe. Aborto." "Red"
    exit 1
  }
}

Set-Location $RepoPath

# --- 1. Parar servicio ---
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne "Stopped") {
    Log "[i] Parando servicio $ServiceName (estado actual: $($svc.Status))..." "Yellow"
    try {
      Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    } catch {
      Log "[!] Stop-Service falló: $($_.Exception.Message). Intento con sc.exe..." "Yellow"
      & sc.exe stop $ServiceName | Out-Null
    }
    # Esperar a que el proceso libere los .dll de Prisma.
    $deadline = (Get-Date).AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 500
      $svc.Refresh()
    } while ($svc.Status -ne "Stopped" -and (Get-Date) -lt $deadline)
    if ($svc.Status -ne "Stopped") {
      Log "[X] No se pudo parar el servicio en 20s. Aborto." "Red"
      exit 1
    }
    # Margen extra para liberar los handles.
    Start-Sleep -Seconds 2
  } else {
    Log "[i] Servicio ya estaba parado."
  }
} else {
  Log "[!] Servicio $ServiceName no encontrado. Continúo con el build de todas formas." "Yellow"
}

# --- 1.b. Matar cualquier node.exe huérfano escuchando en el puerto ---
# Si un build anterior dejó un `next dev`/`next start` colgando (p. ej. por
# fallo del script), liberará el puerto 3000 y soltará los .dll de Prisma.
try {
  $listeners = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
               Where-Object { $_.State -eq "Listen" }
  foreach ($conn in $listeners) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
      Log "[i] Matando node huérfano en :3000 (PID=$($proc.Id))..." "Yellow"
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 1
} catch {
  Log "[!] No se pudo inspeccionar/cerrar procesos en :3000: $($_.Exception.Message)" "Yellow"
}

# --- 2. prisma migrate deploy ---
$code = Invoke-External -Exe $prismaCmd -Arguments @("migrate", "deploy") -Label "prisma migrate deploy"
if ($code -ne 0) {
  Log "[X] prisma migrate deploy falló con código $code. Aborto sin arrancar el servicio." "Red"
  exit $code
}

# --- 3. prisma generate ---
$code = Invoke-External -Exe $prismaCmd -Arguments @("generate") -Label "prisma generate"
if ($code -ne 0) {
  Log "[X] prisma generate falló con código $code. Aborto sin arrancar el servicio." "Red"
  exit $code
}

# --- 4. next build ---
if ($SkipBuild) {
  Log "[i] SkipBuild=1 → me salto next build" "Yellow"
} else {
  $code = Invoke-External -Exe $nextCmd -Arguments @("build") -Label "next build"
  if ($code -ne 0) {
    Log "[X] next build falló con código $code. Aborto sin arrancar el servicio." "Red"
    exit $code
  }
  # Verifica que el build dejó un BUILD_ID válido.
  if (-not (Test-Path (Join-Path $RepoPath ".next\BUILD_ID"))) {
    Log "[X] No existe .next\BUILD_ID. Build incompleto. Aborto." "Red"
    exit 1
  }
}

# --- 4.b. Asegurar configuracion del servicio (Application + Env vars) ---
# Reaplicamos en cada rebuild dos cosas:
#  (1) Application/AppParameters: deben apuntar al servidor custom server.js
#      (no a `next start` directo). El server.js incluye rate-limiting por IP
#      y proteccion anti-flood antes de delegar en Next.
#  (2) AppEnvironmentExtra con TZ=Atlantic/Canary: si el host esta en
#      Europe/Madrid (default Windows en territorio peninsular), `new Date(...)`
#      en Node interpreta horas literales como Madrid y al guardarlas en UTC
#      se desplazan -1h al pintarlas en el navegador canario. Forzando
#      TZ=Atlantic/Canary la conversion es consistente de extremo a extremo.
# Lo aplicamos aqui porque esta tarea corre como SYSTEM y tiene permisos
# suficientes (`nssm set` desde sesion no-admin devuelve "Acceso denegado").
$nssmExe = Join-Path $RepoPath "tools\nssm\nssm.exe"
$serverEntry = Join-Path $RepoPath "server.js"
$nodeExe = Join-Path $NodePath "node.exe"
if (Test-Path $nssmExe) {
  try {
    if ((Test-Path $serverEntry) -and (Test-Path $nodeExe)) {
      & $nssmExe set $ServiceName Application $nodeExe | Out-Null
      & $nssmExe set $ServiceName AppParameters "`"$serverEntry`"" | Out-Null
      Log "[i] NSSM Application apunta a node server.js (rate-limit activo)." "Cyan"
    } else {
      Log "[!] Falta node.exe o server.js. Dejo Application sin tocar." "Yellow"
    }
    & $nssmExe set $ServiceName AppEnvironmentExtra `
        "NODE_ENV=production" `
        "HOST=0.0.0.0" `
        "PORT=3000" `
        "TZ=Atlantic/Canary" | Out-Null
    Log "[i] AppEnvironmentExtra reaplicado (incluye TZ=Atlantic/Canary)." "Cyan"
  } catch {
    Log "[!] No se pudo actualizar la config del servicio via nssm: $($_.Exception.Message)" "Yellow"
  }
} else {
  Log "[!] No encuentro $nssmExe. Saltando reaplicacion de config del servicio." "Yellow"
}

# --- 5. Arrancar servicio ---
if ($svc) {
  Log "[i] Arrancando servicio $ServiceName..." "Cyan"
  try {
    Start-Service -Name $ServiceName -ErrorAction Stop
  } catch {
    Log "[!] Start-Service falló: $($_.Exception.Message). Intento con sc.exe..." "Yellow"
    & sc.exe start $ServiceName | Out-Null
  }
  Start-Sleep -Seconds 4
  $svc.Refresh()
  Log "[i] Estado final del servicio: $($svc.Status)" "Green"
}

Log "==== Rebuild OK ====" "Green"
exit 0
