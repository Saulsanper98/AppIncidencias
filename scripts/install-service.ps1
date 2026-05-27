<#
.SYNOPSIS
  Instala "CCMGC Ticketing" como servicio de Windows persistente usando NSSM.

.DESCRIPTION
  Este script:
    1. Verifica que se ejecuta como Administrador.
    2. Verifica que Node.js (>=20) este instalado.
    3. Descarga NSSM si no esta presente y lo coloca en `tools\nssm\`.
    4. Instala dependencias (`npm install`) si falta `node_modules`.
    5. Aplica migraciones de Prisma (`npx prisma migrate deploy`).
    6. Construye la app (`npm run build`) si no existe `.next\`.
    7. Crea / reconfigura un servicio NSSM llamado "CCMGCTicketing":
         - Arranque automatico con Windows.
         - Reinicio automatico ante caidas o cierres inesperados.
         - Logs en `logs\service-out.log` y `logs\service-err.log`.
         - Variables HOST=0.0.0.0 / PORT=$Port / NODE_ENV=production.
    8. Abre el puerto en el firewall de Windows (regla "CCMGC Ticketing $Port/TCP").
    9. Arranca el servicio.

.PARAMETER Port
  Puerto TCP donde escuchara la app (por defecto 3000).

.PARAMETER ServiceName
  Nombre interno del servicio de Windows (por defecto "CCMGCTicketing").

.PARAMETER SkipBuild
  Si se pasa, no ejecuta `npm install` ni `npm run build` ni `prisma migrate deploy`.
  Util si ya lo hiciste manualmente.

.EXAMPLE
  # Desde una consola PowerShell ABIERTA COMO ADMINISTRADOR:
  cd C:\Users\Incidencias\AppIncidencias
  .\scripts\install-service.ps1

.EXAMPLE
  # Cambiar puerto:
  .\scripts\install-service.ps1 -Port 8080
#>

[CmdletBinding()]
param(
  [int]$Port = 3000,
  [string]$ServiceName = "CCMGCTicketing",
  [string]$DisplayName = "CCMGC Ticketing (App de Incidencias)",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    [X]  $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 0. Comprobaciones previas
# ---------------------------------------------------------------------------
Write-Step "Comprobando permisos de Administrador"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Err "Este script debe ejecutarse como ADMINISTRADOR."
  Write-Host "    Cierra esta ventana, abre 'Windows PowerShell' o 'Terminal' con boton derecho > 'Ejecutar como administrador' y vuelve a lanzarlo."
  exit 1
}
Write-Ok "Ejecutando con privilegios de Administrador."

# Carpeta raiz del proyecto = padre de la carpeta de este script.
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
Write-Ok "Raiz del proyecto: $ProjectRoot"

# ---------------------------------------------------------------------------
# 1. Localizar Node.js
# ---------------------------------------------------------------------------
Write-Step "Localizando Node.js"
$nodeExe = $null
$candidates = @(
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
)
foreach ($c in $candidates) {
  if ($c -and (Test-Path $c)) { $nodeExe = $c; break }
}
if (-not $nodeExe) {
  try {
    $cmd = Get-Command node.exe -ErrorAction Stop
    # Ignorar el node bundle de Cursor (no es un Node real para servicios).
    if ($cmd.Source -notmatch "cursor\\resources\\app\\resources\\helpers") {
      $nodeExe = $cmd.Source
    }
  } catch { }
}
if (-not $nodeExe) {
  Write-Err "No se encontro Node.js instalado en el sistema."
  Write-Host "    Instala Node.js 20 LTS o superior desde https://nodejs.org/ y vuelve a lanzar este script."
  Write-Host "    (El node.exe que incluye Cursor NO sirve para un servicio de Windows.)"
  exit 1
}
$nodeVersion = & $nodeExe --version
Write-Ok "Node encontrado: $nodeExe ($nodeVersion)"

# npm.cmd suele estar al lado de node.exe.
$nodeDir = Split-Path $nodeExe -Parent
$npmCmd  = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) {
  Write-Err "No se encontro npm.cmd junto a node.exe en $nodeDir."
  Write-Host "    Reinstala Node.js asegurandote de marcar 'Add to PATH' y 'npm package manager'."
  exit 1
}
Write-Ok "npm encontrado: $npmCmd"

# ---------------------------------------------------------------------------
# 2. Localizar / descargar NSSM
# ---------------------------------------------------------------------------
Write-Step "Localizando NSSM (Non-Sucking Service Manager)"
$toolsDir = Join-Path $ProjectRoot "tools\nssm"
$nssmExe  = $null

$systemNssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if ($systemNssm) {
  $nssmExe = $systemNssm.Source
  Write-Ok "NSSM en PATH: $nssmExe"
} elseif (Test-Path (Join-Path $toolsDir "nssm.exe")) {
  $nssmExe = Join-Path $toolsDir "nssm.exe"
  Write-Ok "NSSM ya descargado en: $nssmExe"
} else {
  Write-Host "    NSSM no esta instalado. Intentando descarga desde mirrors..."
  New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

  # Forzar TLS 1.2 (algunos PC Windows no lo negocian por defecto y dan handshake failure / 503).
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11
  } catch { }

  $is64 = [Environment]::Is64BitOperatingSystem
  $mirrors = @()
  if ($is64) {
    $mirrors += [PSCustomObject]@{ Url = "https://github.com/fawno/nssm.cc/releases/download/v2.24.1/nssm-v2.24.1-Win64.zip"; Inner = "nssm.exe" }
    $mirrors += [PSCustomObject]@{ Url = "https://nssm.cc/release/nssm-2.24.zip";                                            Inner = "nssm-2.24\win64\nssm.exe" }
    $mirrors += [PSCustomObject]@{ Url = "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip";                                    Inner = "nssm-2.24-101-g897c7ad\win64\nssm.exe" }
  } else {
    $mirrors += [PSCustomObject]@{ Url = "https://github.com/fawno/nssm.cc/releases/download/v2.24.1/nssm-v2.24.1-Win32.zip"; Inner = "nssm.exe" }
    $mirrors += [PSCustomObject]@{ Url = "https://nssm.cc/release/nssm-2.24.zip";                                            Inner = "nssm-2.24\win32\nssm.exe" }
    $mirrors += [PSCustomObject]@{ Url = "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip";                                    Inner = "nssm-2.24-101-g897c7ad\win32\nssm.exe" }
  }

  $zipPath = Join-Path $env:TEMP "nssm-download.zip"
  $extract = Join-Path $env:TEMP "nssm-download-extract"
  $downloaded = $false

  foreach ($m in $mirrors) {
    Write-Host "      - Intentando: $($m.Url)"
    if (Test-Path $zipPath)  { Remove-Item $zipPath -Force }
    if (Test-Path $extract)  { Remove-Item $extract -Recurse -Force }

    $attempts = 0
    while ($attempts -lt 3 -and -not $downloaded) {
      $attempts++
      try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $m.Url -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5
        if ((Get-Item $zipPath).Length -lt 100000) {
          throw "Archivo demasiado pequeno (probable error HTML)."
        }
        Expand-Archive -Path $zipPath -DestinationPath $extract -Force
        $src = Join-Path $extract $m.Inner
        if (-not (Test-Path $src)) {
          # Buscar nssm.exe en cualquier subcarpeta (robusto a cambios de layout).
          $found = Get-ChildItem -Path $extract -Filter "nssm.exe" -Recurse -ErrorAction SilentlyContinue |
                   Where-Object { $_.FullName -notmatch '\\win32\\' -or -not $is64 } |
                   Select-Object -First 1
          if ($found) { $src = $found.FullName }
        }
        if (-not (Test-Path $src)) {
          throw "No se encontro nssm.exe dentro del zip descargado."
        }
        Copy-Item $src (Join-Path $toolsDir "nssm.exe") -Force
        $nssmExe = Join-Path $toolsDir "nssm.exe"
        $downloaded = $true
        Write-Ok "NSSM instalado en: $nssmExe (mirror: $($m.Url))"
      } catch {
        $msg = $_.Exception.Message
        if ($attempts -lt 3) {
          Write-Host "        intento $attempts fallido ($msg). Reintentando en 3s..." -ForegroundColor Yellow
          Start-Sleep -Seconds 3
        } else {
          Write-Host "        intento $attempts fallido ($msg). Probando siguiente mirror." -ForegroundColor Yellow
        }
      }
    }
    if ($downloaded) { break }
  }

  if (-not $downloaded) {
    Write-Err "No se pudo descargar NSSM desde ninguno de los mirrors."
    Write-Host "    Posibles causas: red sin internet, proxy corporativo o firewall que bloquea github.com / nssm.cc."
    Write-Host ""
    Write-Host "    Solucion manual (rapido):"
    Write-Host "      1. Desde otro PC con internet, descarga:"
    Write-Host "         https://github.com/fawno/nssm.cc/releases/download/v2.24.1/nssm-v2.24.1-Win64.zip"
    Write-Host "      2. Descomprime el zip."
    Write-Host "      3. Copia el archivo 'nssm.exe' en:"
    Write-Host "         $toolsDir"
    Write-Host "      4. Vuelve a ejecutar este script."
    Write-Host ""
    Write-Host "    Si estas detras de un proxy corporativo, configuralo antes para PowerShell:"
    Write-Host "      [System.Net.WebRequest]::DefaultWebProxy = New-Object System.Net.WebProxy('http://proxy:puerto', `$true)"
    Write-Host "      [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials"
    exit 1
  }
}

# ---------------------------------------------------------------------------
# 3. Dependencias, migraciones y build
# ---------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Step "Instalando dependencias de Node (npm install)"
  if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { Write-Err "Fallo 'npm install'."; exit 1 }
  } else {
    Write-Ok "node_modules ya existe (se omite npm install). Usa -SkipBuild:`$false manualmente si quieres reinstalar."
  }

  Write-Step "Aplicando migraciones de Prisma (prisma migrate deploy)"
  & $npmCmd exec --yes -- prisma migrate deploy
  if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "Fallo 'prisma migrate deploy'. Si es la primera instalacion, revisa que .env tenga DATABASE_URL valido."
  } else {
    Write-Ok "Migraciones aplicadas."
  }

  Write-Step "Compilando la app para produccion (npm run build)"
  # Un build correcto deja `.next\BUILD_ID`. Si solo existe la carpeta sin BUILD_ID
  # significa que un build anterior fallo a mitad (p.ej. ESLint); hay que rehacerlo.
  $nextDir   = Join-Path $ProjectRoot ".next"
  $buildIdFile = Join-Path $nextDir "BUILD_ID"
  $needsBuild = (-not (Test-Path $buildIdFile))
  if ($needsBuild -and (Test-Path $nextDir)) {
    Write-Host "    .next existe pero esta INCOMPLETO (falta BUILD_ID). Limpiando y recompilando..."
    Remove-Item -Recurse -Force $nextDir
  }
  if ($needsBuild) {
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $buildIdFile)) {
      Write-Err "Fallo 'npm run build'. Revisa la salida de arriba."
      exit 1
    }
    Write-Ok "Build completado (BUILD_ID generado)."
  } else {
    Write-Ok ".next ya esta construido (BUILD_ID presente). Para reconstruir, borra .next y vuelve a lanzar."
  }
} else {
  Write-Warn2 "SkipBuild activo: no se ejecuta npm install / prisma migrate / npm run build."
}

# ---------------------------------------------------------------------------
# 4. Preparar logs
# ---------------------------------------------------------------------------
Write-Step "Preparando carpeta de logs"
$logsDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
$stdoutLog = Join-Path $logsDir "service-out.log"
$stderrLog = Join-Path $logsDir "service-err.log"
Write-Ok "Logs en: $logsDir"

# ---------------------------------------------------------------------------
# 5. Instalar / reconfigurar el servicio NSSM
# ---------------------------------------------------------------------------
Write-Step "Configurando el servicio '$ServiceName'"

$nextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) {
  Write-Err "No se encuentra el binario de Next en $nextBin. Ejecuta 'npm install' (o lanza este script sin -SkipBuild)."
  exit 1
}

# Si ya existe, lo paramos y borramos para reconfigurar limpio.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "    Servicio existente detectado (estado: $($existing.Status)). Reconfigurando..."
  # 'Paused' aparece cuando NSSM estrangula reinicios; tambien hay que pararlo.
  if ($existing.Status -in 'Running','Paused','PausePending','StartPending','ContinuePending') {
    & $nssmExe stop $ServiceName confirm | Out-Null
    Start-Sleep -Seconds 2
  }
  & $nssmExe remove $ServiceName confirm | Out-Null
  Start-Sleep -Seconds 1
}

# Instalar de cero.
$nextArgs = "`"$nextBin`" start -H 0.0.0.0 -p $Port"
& $nssmExe install $ServiceName $nodeExe $nextArgs | Out-Null
& $nssmExe set $ServiceName AppDirectory $ProjectRoot | Out-Null
& $nssmExe set $ServiceName DisplayName  $DisplayName | Out-Null
& $nssmExe set $ServiceName Description  "Servidor Next.js de la App de Incidencias CCMGC. Escucha en http://0.0.0.0:$Port y se reinicia automaticamente ante fallos." | Out-Null
& $nssmExe set $ServiceName Start         SERVICE_AUTO_START | Out-Null
& $nssmExe set $ServiceName ObjectName    LocalSystem | Out-Null
& $nssmExe set $ServiceName AppStdout     $stdoutLog | Out-Null
& $nssmExe set $ServiceName AppStderr     $stderrLog | Out-Null
& $nssmExe set $ServiceName AppRotateFiles 1 | Out-Null
& $nssmExe set $ServiceName AppRotateOnline 1 | Out-Null
& $nssmExe set $ServiceName AppRotateBytes 10485760 | Out-Null   # 10 MB

# Reinicio automatico ante caidas o cierres inesperados.
& $nssmExe set $ServiceName AppExit Default Restart | Out-Null
& $nssmExe set $ServiceName AppRestartDelay 5000 | Out-Null
& $nssmExe set $ServiceName AppThrottle 5000 | Out-Null

# Variables de entorno (NODE_ENV + HOST/PORT por si .env no se carga en algun flujo).
# TZ=Atlantic/Canary es CRITICA: los PDFs de Movilidad usan hora canaria. Si el
# servidor corriese en Europe/Madrid (default en muchas instalaciones de
# Windows en territorio peninsular), las fechas guardadas en SQLite saldrian
# desplazadas -1 hora al mostrarlas al cliente. Forzando la TZ del proceso a
# Atlantic/Canary, el `new Date(YYYY, M, D, hh, mm)` del parser interpreta las
# horas literalmente como horas canarias y la conversion a UTC para almacenar
# es consistente con la TZ del navegador del operador (que tambien esta en
# Canarias). Es la unica fuente de verdad para evitar dobles correcciones.
& $nssmExe set $ServiceName AppEnvironmentExtra `
    "NODE_ENV=production" `
    "HOST=0.0.0.0" `
    "PORT=$Port" `
    "TZ=Atlantic/Canary" | Out-Null

Write-Ok "Servicio '$ServiceName' configurado."

# Recuperacion del Service Control Manager (capa extra encima de NSSM):
# si el proceso se cae 3 veces, Windows tambien intenta levantarlo.
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/15000 | Out-Null

# ---------------------------------------------------------------------------
# 6. Firewall
# ---------------------------------------------------------------------------
Write-Step "Configurando regla de firewall (TCP $Port)"
$ruleName = "CCMGC Ticketing $Port/TCP"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
  Write-Ok "Regla de firewall ya existia: $ruleName"
} else {
  New-NetFirewallRule -DisplayName $ruleName `
    -Description "Permite trafico entrante TCP $Port para la App de Incidencias CCMGC." `
    -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Domain,Private,Public | Out-Null
  Write-Ok "Regla de firewall creada: $ruleName"
}

# ---------------------------------------------------------------------------
# 7. Arrancar
# ---------------------------------------------------------------------------
Write-Step "Arrancando el servicio"
& $nssmExe start $ServiceName | Out-Null
# Damos hasta 15s a Next para estar listo (sobre todo en primer arranque).
$svc = $null
for ($i=0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  $svc = Get-Service -Name $ServiceName
  if ($svc.Status -eq 'Running') { break }
}
if ($svc.Status -eq 'Running') {
  Write-Ok "Servicio '$ServiceName' arrancado correctamente."
} else {
  Write-Warn2 "El servicio no esta Running (estado: $($svc.Status))."
  if ($svc.Status -eq 'Paused') {
    Write-Warn2 "El estado 'Paused' indica que NSSM esta estrangulando reinicios: el proceso esta cayendo nada mas arrancar."
  }
  Write-Host "    Ultimas lineas de service-err.log:" -ForegroundColor Yellow
  if (Test-Path $stderrLog) { Get-Content $stderrLog -Tail 20 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray } }
}

# ---------------------------------------------------------------------------
# 8. Resumen
# ---------------------------------------------------------------------------
$ipLocal = "192.168.12.67"
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "  Instalacion completada"                                   -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "  Servicio       : $ServiceName ($DisplayName)"
Write-Host "  Estado         : $($svc.Status)"
Write-Host "  URL local      : http://localhost:$Port"
Write-Host "  URL en la red  : http://$ipLocal`:$Port"
Write-Host "  Logs           : $logsDir"
Write-Host ""
Write-Host "  Comandos utiles:"
Write-Host "    Detener   :  Stop-Service  $ServiceName"
Write-Host "    Iniciar   :  Start-Service $ServiceName"
Write-Host "    Reiniciar :  Restart-Service $ServiceName"
Write-Host "    Estado    :  Get-Service $ServiceName"
Write-Host "    Logs vivo :  Get-Content '$stdoutLog' -Wait -Tail 40"
Write-Host ""
