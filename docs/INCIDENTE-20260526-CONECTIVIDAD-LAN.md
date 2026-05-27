# Incidente 2026-05-26: la app no era accesible desde la LAN en `192.168.12.67:3000`

> **TL;DR**: Windows Firewall del servidor ten�a **dos reglas Block autom�ticas** dirigidas a `node.exe` en perfil Public que pisaban la regla Allow del puerto 3000. Las reglas Block se generaron porque alguien cerr� el cuadro de di�logo de Windows "?Permitir que `node.exe` se comunique en las siguientes redes?" en perfil Public. Las reglas Block en Windows Firewall siempre ganan a las Allow, as� que daba igual cu�ntas veces se recreara la regla `CCMGC Ticketing 3000/TCP`. La soluci�n fue eliminar las reglas Block de `node.exe` y a?adir una regla Allow expl�cita y persistente para el ejecutable.

## Cronolog�a

| Hora  | Evento |
|---|---|
| 10:26 | �ltimo reinicio limpio del servicio `CCMGCTicketing` antes del incidente. App `Ready` en `http://0.0.0.0:3000`. |
| 11:14 | Se crea la carpeta `C:\Users\Incidencias\Launcher` en el servidor (instalaci�n inicial del Dev Launcher). |
| 11:56 | Arranca el Dev Launcher (`node server.js` en `0.0.0.0:9000`). |
| 12:01 | �ltima modificaci�n de `server.js` y `config.json` del launcher. |
| 12:03 | Modificaci�n masiva de archivos del repo principal (`.env`, `next.config.ts`, `package.json`, scripts). El servicio a�n corre con el build de las 10:26. |
| 12:03 | Se reporta: "la app no es accesible en `192.168.12.67:3000`". |
| 12:44 | Se restart-Service de `CCMGCTicketing`. En ese momento Windows pide confirmaci�n de firewall para `node.exe` y se cierra el di�logo ? se crean dos reglas **Block** autom�ticas para `node.exe` en perfil Public. |
| 12:49 | Activaci�n del log de drops del firewall. Se observa: `DROP TCP 192.168.12.45 ? 192.168.12.67:3000 ... RECEIVE 7380` (tambi�n del 12.44). |
| 12:53 | Se identifican las dos reglas `Node.js JavaScript Runtime` con Action **Block** en el firewall del servidor. |
| 12:54 | Se eliminan las reglas Block. Se a?ade Allow persistente para `node.exe`. Confirmado `TcpTestSucceeded: True` desde el cliente. |
| 14:00 | Rebuild completo de la app (`prisma migrate deploy` + `prisma generate` + `next build` + restart) v�a `scripts\rebuild-service.ps1` para aplicar los cambios del repo de las 12:03. |

## Causa ra�z

**Windows Firewall del servidor** ten�a dos reglas Block habilitadas para `node.exe` que ten�an prioridad sobre la regla Allow del puerto 3000:

```
DisplayName: Node.js JavaScript Runtime
Action:     Block
Direction:  Inbound
Profile:    Public
Program:    C:\Program Files\nodejs\node.exe
```

(Una para TCP y otra para UDP. Suelen crearse en pareja.)

En Windows Firewall las reglas con **Action = Block ganan siempre a las Allow**, sin importar el orden, la prioridad o si la regla Allow es m�s espec�fica (salvo que la Allow sea estrictamente m�s espec�fica en programa + IP + puerto, lo cual no era el caso). Por eso la regla `CCMGC Ticketing 3000/TCP` (Allow, TCP, LocalPort 3000) no serv�a: la Block era m�s espec�fica (apuntaba al ejecutable concreto `node.exe`) y bloqueaba todo el tr�fico Inbound a ese binario en perfil Public.

### De d�nde salieron las reglas Block

Cuando un ejecutable abre por primera vez un socket en escucha y la interfaz est� catalogada como "P�blica" (caso de `Ethernet0` en este servidor), Windows muestra el cuadro de di�logo:

> **?Quieres permitir que `node.exe` se comunique en las siguientes redes?**
> Redes privadas | Redes p�blicas
> [Permitir acceso] [Cancelar]

Si alguien pulsa **Cancelar** (o cierra el di�logo con la X), Windows crea autom�ticamente **dos reglas Block** (TCP y UDP) para ese ejecutable en el perfil de la red activa. Las Block quedan persistentes y, mientras la interfaz siga en ese perfil, **todo tr�fico entrante a `node.exe` queda bloqueado en silencio**, sin notificaci�n al usuario.

Este es un comportamiento muy desafortunado de Windows Firewall: la regla gen�rica `Allow TCP 3000` no detecta ni avisa de la regla Block m�s espec�fica, por lo que el operador puede tener perfectamente configurado el puerto y aun as� no funciona.

## Por qu� pareci� relacionado con "meter el launcher"

El launcher (`C:\Users\Incidencias\Launcher`) NO fue responsable. La coincidencia temporal fue:

1. Hasta esa ma?ana los usuarios acced�an a la app **mayormente por RDP al servidor** (loopback, no se ve afectado por reglas de firewall externo).
2. Al instalar el launcher, los usuarios empezaron a abrir la URL **desde su propio navegador local**, atravesando el firewall del servidor por primera vez de forma masiva. Ah� salieron a la luz las reglas Block que ya exist�an (o se crearon con el primer reinicio del servicio tras instalar el launcher).
3. El primer `Restart-Service CCMGCTicketing -Force` durante el diagn�stico hizo que Windows volviera a evaluar `node.exe` y, al cerrarse el popup, **se crearon (o se reactivaron) las reglas Block autom�ticas**. Esto explica tambi�n por qu� tras activar de nuevo el firewall (despu�s de la prueba con el firewall apagado), la app dej� de ser accesible inmediatamente.

## Cosas que NO fueron la causa (descartadas con evidencia)

- ? **La app Next.js**. Listener correcto en `0.0.0.0:3000`, log `Ready in 627ms`, sin errores en `service-err.log`, HTTP `200 OK` en `/`, `/login`, `/tickets`.
- ? **El servicio NSSM `CCMGCTicketing`**. `Running`, configurado con `HOST=0.0.0.0 PORT=3000 TZ=Atlantic/Canary`.
- ? **El launcher**. Solo es un `node + express` que escucha en `localhost:9000` con un bot�n que ejecuta `window.open("http://192.168.12.67:3000")`. La app `incidencias` est� marcada `"remote": true` y los endpoints de start/stop la ignoran (`ignored: "remote_app"`). El launcher **NO toca el servicio, ni el firewall, ni la red del servidor**.
- ? **La red corporativa / VLAN / switch**. Cliente y servidor est�n en la misma subred `/24`, el ARP resolv�a correctamente y el ping inverso desde el servidor s� funcionaba.
- ? **El navegador (Chrome / Edge)**. El problema era a nivel TCP, anterior a HTTP. `Test-NetConnection` fallaba igual.
- ? **El adaptador `vEthernet (WSL (Hyper-V firewall))` en el cliente**. Esto s� estaba activo en el PC cliente, pero NO era la causa del bloqueo (lo demostramos: el firewall del servidor S� dropeaba los SYN del cliente ? `DROP TCP 192.168.12.45 ? 192.168.12.67:3000 ... RECEIVE 7380`).
- ? **Windows Defender Network Protection**. `EnableNetworkProtection = 0`. Sin ASR rules.
- ? **EDR / AV de terceros**. Solo Microsoft Defender est�ndar.

## C�mo se arregl�

En el servidor, como Administrador:

```powershell
# 1. Eliminar las dos reglas Block autom�ticas de node.exe
Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" |
  Where-Object { $_.Action -eq 'Block' -and $_.Direction -eq 'Inbound' } |
  Remove-NetFirewallRule

# 2. A?adir una regla Allow EXPL�CITA y persistente para el ejecutable node.exe.
#    Esto evita que el di�logo de Windows vuelva a aparecer en futuros reinicios
#    del servicio o tras actualizaciones de Node, y por tanto evita que se
#    vuelvan a crear reglas Block accidentales.
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { $nodePath = "C:\Program Files\nodejs\node.exe" }
New-NetFirewallRule `
  -DisplayName "Node.js Runtime (allow all, persistent)" `
  -Description "Evita que Windows cree reglas Block automaticas para node.exe al cerrar el dialogo del firewall." `
  -Direction Inbound `
  -Program $nodePath `
  -Action Allow `
  -Profile Any `
  -Enabled True | Out-Null

# 3. Rebuild de la app para aplicar los cambios de config (sin admin):
powershell -ExecutionPolicy Bypass -File .\scripts\rebuild-service.ps1
```

Posteriormente, en el navegador del usuario afectado:

- `Ctrl+Shift+R` para forzar recarga.
- Si no carga la nueva build: `F12 ? Application ? Service Workers ? Unregister` y `Storage ? Clear site data`. Recargar.

## C�mo diagnosticar este mismo problema en el futuro (CHECKLIST CORRECTO)

Si vuelve a ocurrir que un PC cliente no llega a `192.168.12.67:3000`, **estos son los pasos en el orden correcto**. La regla n�mero uno: **mira los drops del firewall del servidor desde el minuto cero**. Esto era lo que falt� en el diagn�stico original y la causa de que el problema tardara m�s de una hora en cerrarse.

### Paso 1 (servidor, Admin) ? activar log de drops y mirar en directo

```powershell
Set-NetFirewallProfile -Profile Domain,Private,Public -LogBlocked True -LogMaxSizeKilobytes 4096
$log = "$env:SystemRoot\System32\LogFiles\Firewall\pfirewall.log"
if (Test-Path $log) { Clear-Content $log -ErrorAction SilentlyContinue }
"Log vaciado. Ahora pide al cliente que pruebe Test-NetConnection 192.168.12.67 -Port 3000"
```

A continuaci�n pedir al cliente que intente conectar 2-3 veces. Luego en el servidor:

```powershell
Get-Content "$env:SystemRoot\System32\LogFiles\Firewall\pfirewall.log" -Tail 40
```

- Si aparecen l�neas `DROP TCP <cliente> 192.168.12.67 ... 3000 ... RECEIVE <pid>` ? **el firewall del servidor est� dropeando**. Ir al paso 2.
- Si NO aparecen drops del 3000 ni del cliente ? el paquete ni siquiera llega al servidor. Investigar lado cliente o red.

### Paso 2 (servidor, Admin) ? buscar reglas Block escondidas

```powershell
# Reglas Block Inbound habilitadas (la causa t�pica)
Get-NetFirewallRule -Direction Inbound -Enabled True |
  Where-Object { $_.Action -eq 'Block' } |
  Select-Object DisplayName,Profile,@{n='Store';e={$_.PolicyStoreSourceType}}

# Reglas Block con node.exe (caso concreto de esta incidencia)
Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" |
  Select-Object DisplayName,Action,Direction,Profile,Enabled
```

Si aparecen reglas Block dirigidas a `node.exe` o al puerto 3000 ? eliminarlas con `Remove-NetFirewallRule` y volver al paso 1 para confirmar que dejan de aparecer drops.

### Paso 3 (servidor) ? verificar el resto

```powershell
Get-Service CCMGCTicketing | Select Name,Status
netstat -ano | findstr ":3000 " | findstr LISTENING
Invoke-WebRequest -Uri "http://192.168.12.67:3000/" -UseBasicParsing -TimeoutSec 5 | Select StatusCode
Get-Content .\logs\service-out.log -Tail 10
Get-Content .\logs\service-err.log -Tail 30
```

Si todo esto es correcto y el cliente sigue sin conectar tras el paso 2, entonces s� investigar el lado del cliente.

### Paso 4 (cliente) ? descartar problemas del PC

```powershell
Test-NetConnection 192.168.12.67 -Port 3000
ipconfig | findstr IPv4
arp -a | findstr 12.67
Get-NetAdapter | Where-Object {$_.Name -like "vEthernet*"} | Select Name,Status
```

Si `TcpTestSucceeded` es `False` y los drops del paso 1 NO aparecen en el servidor, el problema est� aguas arriba del servidor. Mirar:
- Adaptador `vEthernet` de Hyper-V/WSL en el cliente.
- Antivirus/EDR en el cliente.
- Rutas, m�scara de subred.

## Estado final del servidor (debe quedar as�)

- Servicio `CCMGCTicketing`: `Running`, `Automatic`.
- Listener: `0.0.0.0:3000 LISTENING` (PID variable seg�n �ltimo reinicio).
- Firewall: **HABILITADO** en los tres perfiles (Domain, Private, Public).
- Reglas relevantes en el firewall:
  - `CCMGC Ticketing 3000/TCP`: Inbound, Allow, TCP, LocalPort 3000, perfiles Any, RemoteIP Any.
  - `Node.js Runtime (allow all, persistent)`: Inbound, Allow, Program `C:\Program Files\nodejs\node.exe`, perfiles Any.
  - **NO debe existir** ninguna regla `Node.js JavaScript Runtime` con Action Block.
- `service-err.log` debe estar vac�o o solo con warnings (no errores fatales).
- �ltima build aplicada: `.next\BUILD_ID` actualizado tras la �ltima modificaci�n del repo.

## Acciones preventivas

1. **No hacer clic en "Cancelar" en el di�logo del Firewall** que pregunta si permitir `node.exe`. Si por accidente se cierra, ejecutar el bloque del paso 2 anterior y eliminar las reglas Block creadas. La regla "Node.js Runtime (allow all, persistent)" a?adida evita que vuelva a aparecer el di�logo en el futuro.
2. **Considerar mover la interfaz `Ethernet0` del perfil Public al perfil Private**. En entornos LAN corporativos no tiene sentido que est� en Public:
   ```powershell
   Set-NetConnectionProfile -InterfaceAlias Ethernet0 -NetworkCategory Private
   ```
   Esto reduce el riesgo de reglas Block autom�ticas (Windows pone reglas Block solo en perfil Public por defecto).
3. **Tras cualquier cambio en `.env`, `next.config.ts`, `package.json` o c�digo fuente**, ejecutar `scripts\rebuild-service.ps1` para que el build refleje los cambios. `Restart-Service` solo no rebuildea.
4. **Tras cualquier reinicio del servicio**, comprobar en 30 segundos:
   ```powershell
   Get-Service CCMGCTicketing | Select Name,Status
   Get-Content .\logs\service-err.log -Tail 5
   Test-NetConnection 192.168.12.67 -Port 3000 -InformationLevel Quiet
   ```
   desde alg�n PC cliente, no solo desde RDP al propio servidor.
5. **Documentar las reglas de firewall esperadas** (este documento) para que un t�cnico pueda revisar el estado en menos de un minuto.

## Lecciones aprendidas (post-mortem)

- **Mirar el log de drops del firewall fue la prueba que zanj� el caso en 2 minutos.** Llegamos a ella tras m�s de una hora de teorizar sobre el cliente y la red. La regla nueva: ante cualquier "no llega TCP", primer paso es activar log de drops del firewall del servidor y observar.
- **"La regla Allow est� puesta" NO significa que el firewall permita el tr�fico.** Una regla Block m�s espec�fica puede pisarla. Hay que listar tambi�n las Block habilitadas, no solo las Allow.
- **El comportamiento de Windows con `node.exe` y el di�logo de firewall es propenso a este fallo silencioso.** Siempre que se instale un nuevo servicio Node en un Windows con perfil Public, hay que crear una regla Allow expl�cita para el ejecutable (no solo para el puerto).
- **`netsh advfirewall firewall show rule` parsea peor que `Get-NetFirewallRule`** para detectar reglas Block existentes. Usar la API moderna desde el principio.
