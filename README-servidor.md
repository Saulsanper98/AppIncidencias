# Servidor de Incidencias – Despliegue en el PC `192.168.12.67`

Esta guía explica cómo dejar la **App de Incidencias** (CCMGC Ticketing, Next.js 15) corriendo de forma **persistente** en el PC con IP `192.168.12.67`, de modo que:

- Arranque **automáticamente** al encender Windows.
- Se **reinicie sola** si la app falla o se cierra inesperadamente.
- Funcione **sin que ningún usuario esté logueado** en el equipo.
- Sea accesible para el resto del equipo en `http://192.168.12.67:3000`.

Para conseguirlo se usa **[NSSM](https://nssm.cc/)** (Non‑Sucking Service Manager), que envuelve `node.exe` como un servicio nativo de Windows.

---

## 1. Requisitos previos (una sola vez en el PC `192.168.12.67`)

| Requisito | Cómo verificarlo | Si falta |
|-----------|------------------|----------|
| **Node.js 20 LTS o superior** | `node -v` en PowerShell | Instalar desde https://nodejs.org (marca *Add to PATH*). El `node.exe` que trae Cursor **no sirve** para un servicio. |
| **Permisos de Administrador** | Abrir PowerShell con botón derecho → *Ejecutar como administrador* | Imprescindible para crear servicios y reglas de firewall. |
| **Conexión a internet** durante la instalación | – | Necesaria solo la primera vez: para `npm install`, para construir la app y para descargar NSSM. |
| **NSSM** | – | El script lo descarga **solo** si no lo encuentra. No hace falta instalarlo a mano. |

> El archivo `.env` de producción ya está creado en la raíz del proyecto con `HOST=0.0.0.0`, `PORT=3000` y `NODE_ENV=production`.

---

## 2. Instalación del servicio (paso único)

1. Abre **PowerShell como Administrador**.
2. Ve a la raíz del proyecto y ejecuta el script:

   ```powershell
   cd C:\Users\Incidencias\AppIncidencias
   .\scripts\install-service.ps1
   ```

   Si Windows bloquea la ejecución por la política de scripts, lánzalo así:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
   ```

3. El script, en orden, hace lo siguiente:
   1. Comprueba que eres Administrador.
   2. Localiza `node.exe` y `npm.cmd`.
   3. Descarga **NSSM 2.24** en `tools\nssm\nssm.exe` (si no estaba ya).
   4. Ejecuta `npm install` (si falta `node_modules`).
   5. Aplica las migraciones de Prisma (`prisma migrate deploy`).
   6. Construye la app (`npm run build`, si falta `.next\`).
   7. Crea el servicio **`CCMGCTicketing`** con:
      - Arranque automático con Windows.
      - **Reinicio automático** en cualquier caída (NSSM + `sc failure`).
      - Logs rotativos en `logs\service-out.log` y `logs\service-err.log`.
      - Variables `HOST=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`.
   8. Abre el puerto `3000/TCP` en el firewall (regla *CCMGC Ticketing 3000/TCP*).
   9. Arranca el servicio.

   Al finalizar verás un resumen con la URL de acceso.

### Cambiar el puerto

Si el `3000` está ocupado o quieres otro:

```powershell
.\scripts\install-service.ps1 -Port 8080
```

Si vuelves a lanzar el script con otro puerto, **reconfigura** el servicio y la regla de firewall (no hace falta desinstalarlo antes).

### Reinstalar sin reconstruir (ya hiciste `npm install`/`build` a mano)

```powershell
.\scripts\install-service.ps1 -SkipBuild
```

---

## 3. Acceso desde otros equipos

Una vez instalado y arrancado, los compañeros deben abrir en el navegador:

> **http://192.168.12.67:3000**

Si cambiaste el puerto al instalar, sustitúyelo. La aplicación escucha en `0.0.0.0`, por lo que responderá a cualquier IP de la red local (LAN/VPN) que pueda alcanzar al equipo `192.168.12.67`.

> Solo HTTP, no HTTPS. Si necesitáis cifrado en la red corporativa, lo más limpio es ponerle delante un reverse‑proxy (IIS, Caddy, nginx) con certificado; queda fuera del alcance de este script.

---

## 4. Operaciones del día a día

Todas las órdenes se ejecutan en **PowerShell** (las de cambiar estado del servicio requieren *Administrador*).

| Acción | Comando |
|--------|---------|
| Ver estado | `Get-Service CCMGCTicketing` |
| Iniciar | `Start-Service CCMGCTicketing` |
| Detener | `Stop-Service CCMGCTicketing` |
| **Reiniciar** (tras actualizar código) | `Restart-Service CCMGCTicketing` |
| Ver logs en vivo (stdout) | `Get-Content .\logs\service-out.log -Wait -Tail 40` |
| Ver logs de error en vivo | `Get-Content .\logs\service-err.log -Wait -Tail 40` |
| Editar configuración del servicio | `.\tools\nssm\nssm.exe edit CCMGCTicketing` |
| Abrir consola gráfica de servicios | `services.msc` (busca *CCMGC Ticketing*) |

### Verificar que está corriendo

Desde el propio servidor:

```powershell
Get-Service CCMGCTicketing
Test-NetConnection -ComputerName localhost -Port 3000
Invoke-WebRequest http://localhost:3000 -UseBasicParsing -MaximumRedirection 0
```

Desde otro PC de la red:

```powershell
Test-NetConnection -ComputerName 192.168.12.67 -Port 3000
```

`TcpTestSucceeded : True` significa que el firewall está abierto y el servicio escuchando.

---

## 5. Actualizar la aplicación (`git pull` + rebuild)

Cuando bajes cambios nuevos del repositorio:

```powershell
cd C:\Users\Incidencias\AppIncidencias
git pull
npm install
npx prisma migrate deploy
npm run build
Restart-Service CCMGCTicketing
```

> No hace falta volver a ejecutar `install-service.ps1` para una simple actualización: con `Restart-Service` basta. El script `install-service.ps1` solo se vuelve a usar si quieres cambiar el puerto o reconfigurar el servicio.

---

## 6. Desinstalar el servicio

Como Administrador:

```powershell
.\scripts\uninstall-service.ps1
```

Esto detiene el servicio, lo elimina y borra la regla de firewall. Si quieres conservar la regla:

```powershell
.\scripts\uninstall-service.ps1 -KeepFirewallRule
```

---

## 7. Arranque manual sin servicio (para depurar)

Si necesitas ejecutar el servidor en primer plano (por ejemplo, para ver errores de arranque en una consola), usa:

```powershell
.\scripts\start-server-manual.ps1
```

Equivale a `npm run start:server`, exporta `HOST=0.0.0.0`, `PORT=3000`, `NODE_ENV=production` y construye la app si no estaba construida. Detén con `Ctrl+C`. **Importante**: si el servicio NSSM está corriendo a la vez, el puerto estará ocupado; detenlo antes con `Stop-Service CCMGCTicketing`.

---

## 8. Solución de problemas

| Síntoma | Qué mirar |
|---------|-----------|
| El servicio aparece *Stopped* justo después de instalarlo | Revisa `logs\service-err.log`. Lo más típico es que falte `.next\` (no se hizo el build) o que `DATABASE_URL` en `.env` apunte a una ruta no escribible. |
| `Get-Service CCMGCTicketing` da *Running* pero la web no responde | Comprueba el firewall: `Get-NetFirewallRule -DisplayName "CCMGC Ticketing 3000/TCP"`. Si no existe, vuelve a lanzar `install-service.ps1`. |
| Otro PC no entra pero `localhost:3000` sí | El firewall del **router/red corporativa** podría bloquear el puerto. Pide a IT que abra TCP 3000 en la VLAN, o cambia a un puerto permitido con `-Port`. |
| Bucle de reinicios cada pocos segundos | Hay un error fatal de Node. Mira `logs\service-err.log`. Para parar el bucle: `Stop-Service CCMGCTicketing`. |
| "Cannot find module 'next'" en los logs | Faltan dependencias. Ejecuta `npm install` en la raíz del proyecto y `Restart-Service CCMGCTicketing`. |
| Tras actualizar Windows el puerto cambia o se cierra | Vuelve a lanzar `install-service.ps1` (es idempotente y restaura la regla de firewall y la config del servicio). |

---

## 9. Ficheros que crea / modifica este despliegue

| Ruta | Función |
|------|---------|
| `.env` | Variables de producción (`HOST`, `PORT`, `NODE_ENV`, `DATABASE_URL`, etc.). |
| `package.json` → script `start:server` | `next start -H 0.0.0.0 -p 3000`. |
| `scripts\install-service.ps1` | Instalador del servicio (NSSM + firewall + build). |
| `scripts\uninstall-service.ps1` | Quita el servicio y la regla de firewall. |
| `scripts\start-server-manual.ps1` | Arranque manual en primer plano para depuración. |
| `tools\nssm\nssm.exe` | NSSM descargado automáticamente. |
| `logs\service-out.log` / `service-err.log` | Salida del servicio. |
| Servicio Windows `CCMGCTicketing` | Servicio gestionado por NSSM. |
| Regla de firewall `CCMGC Ticketing 3000/TCP` | Permite tráfico entrante TCP al puerto del servidor. |

Ningún fichero de la lógica de negocio de la aplicación ha sido modificado.
