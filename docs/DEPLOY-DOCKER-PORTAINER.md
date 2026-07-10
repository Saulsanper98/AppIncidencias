# CCMGC Ticketing — migración Windows → Docker Ubuntu (node-prod / Portainer)

Guía para mover la app del **servicio Windows** (`192.168.12.67:3000`) al contenedor **`node-prod`** del stack `app-incidencias`.

> **Importante:** en Portainer **no** uses la imagen `ubuntu:22.04` vacía de Docker Hub. Eso es solo el sistema base. Hay que **construir** la imagen de la app (`ccmgc-ticketing:prod`) con el `Dockerfile` del repo, que parte de `ubuntu:22.04` e instala Node 20, dependencias y la aplicación.

La app sigue usando **SQLite** (no MySQL del stack). Los contenedores `mysql-*` y `phpmyadmin-*` no intervienen en esta migración.

---

## Imagen Docker

| Concepto | Valor |
|----------|-------|
| Base | `ubuntu:22.04` (Docker Hub, LTS amd64) |
| Node.js | 20 LTS (NodeSource) |
| Tag local | `ccmgc-ticketing:prod` |
| Dockerfile | raíz del repo |
| Build | `sudo bash scripts/docker/build-prod.sh` |

---

## Arquitectura objetivo

```
192.168.12.67:8080  →  node-prod (CCMGC Ticketing, Ubuntu 22.04)
192.168.12.68:3000  →  git-prod (Gitea)
192.168.12.69:3001  →  git-test (Gitea)
192.168.12.70:8082  →  node-test (entorno pruebas, opcional)
```

Tras el cutover puedes volver a **`:3000`** en `.67` (ver sección 7).

---

## Fase 0 — Requisitos

| Recurso | Valor |
|---------|-------|
| Host Docker | Misma VLAN, red `lan_ipvlan` |
| IP node-prod | `192.168.12.67` |
| Datos persistentes | `/opt/app-incidencias/prod/data/` |
| Imagen | `ccmgc-ticketing:prod` (build desde este repo) |

En el host Docker:

```bash
sudo bash scripts/docker/prepare-prod-data.sh
```

---

## Fase 1 — Exportar desde Windows

En el PC **`192.168.12.67`** (PowerShell como admin **no** es necesario):

```powershell
cd C:\Users\Incidencias\AppIncidencias
powershell -ExecutionPolicy Bypass -File .\scripts\export-migration-bundle.ps1
```

Se genera `migration-bundle\ccmgc-migration-YYYYMMDD-HHMMSS.zip` con:

- `.env` (secretos, SESSION_SECRET, POWER_BI_API_KEY…)
- `prisma/dev.db`
- `public/uploads/`
- `certs/` (si existe)

Copia el zip al host Docker (SCP, SMB, USB):

```powershell
scp .\migration-bundle\ccmgc-migration-*.zip usuario@HOST-DOCKER:/tmp/
```

---

## Fase 2 — Importar datos en el host Docker

```bash
chmod +x scripts/docker/*.sh
sudo bash scripts/docker/import-migration-bundle.sh /tmp/ccmgc-migration-*.zip
```

Edita el `.env` de producción Docker:

```bash
sudo nano /opt/app-incidencias/prod/data/.env
```

Cambios **obligatorios**:

```env
HOST=0.0.0.0
PORT=8080
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_APP_URL="http://192.168.12.67:8080"
DATAWALL_FRAME_ANCESTOR_ORIGINS="http://192.168.12.67:8080,http://192.168.12.67:5174"
```

Plantilla completa: [`deploy/docker/env.prod.example`](env.prod.example)

---

## Fase 3 — Construir la imagen (Ubuntu 22.04)

Clona o actualiza el repo en el host (desde Gitea prod `.68`):

```bash
sudo git clone http://192.168.12.68:3000/... /opt/app-incidencias/prod/src
cd /opt/app-incidencias/prod/src
git pull
sudo bash scripts/docker/build-prod.sh
```

El build tarda **10–20 minutos** la primera vez (apt + npm + Next.js). La imagen resultante **no** es `ubuntu:22.04` cruda: es `ccmgc-ticketing:prod`.

Comprueba:

```bash
docker images ccmgc-ticketing:prod
docker run --rm ccmgc-ticketing:prod node --version   # debe mostrar v20.x
```

---

## Fase 4 — Actualizar Portainer (node-prod)

En el stack **`app-incidencias`**, servicio **`node-prod`**:

| Campo | Valor |
|-------|-------|
| **Image** | `ccmgc-ticketing:prod` |
| ~~Image~~ | ~~`ubuntu:22.04`~~ / ~~`node:20-alpine`~~ |

Referencia completa: [`deploy/docker/docker-compose.node-prod.yml`](docker-compose.node-prod.yml)

Puntos clave:

- **Image:** `ccmgc-ticketing:prod` (no `node:20-alpine`)
- **env_file:** `/opt/app-incidencias/prod/data/.env`
- **Volúmenes:** prisma, uploads, certs, logs
- **Red:** `lan_ipvlan` → `192.168.12.67`
- **Sin** `ports:` si usas ipvlan (acceso directo por IP)

Redeploy del stack `app-incidencias`.

---

## Fase 5 — Probar en paralelo (Windows sigue en :3000)

Mientras el servicio Windows **sigue activo** en `:3000`, Docker escucha en **`:8080`** (misma IP, otro puerto).

Desde un PC de la LAN:

```powershell
# Docker (nuevo)
Invoke-WebRequest -Uri "http://192.168.12.67:8080/login" -UseBasicParsing | Select StatusCode

# Power BI
Invoke-RestMethod -Uri "http://192.168.12.67:8080/api/bi/health" `
  -Headers @{ Authorization = "Bearer TU_POWER_BI_API_KEY" }
```

Comprueba:

- [ ] Login funciona
- [ ] Tickets e incidencias visibles
- [ ] Adjuntos / uploads
- [ ] Desvíos / poller (variables EMAIL_* en `.env`)
- [ ] Power BI `/api/bi/tickets`

---

## Fase 6 — Cutover (parar Windows)

Ventana de mantenimiento recomendada.

### 6.1 Parar el servicio Windows

En `192.168.12.67`:

```powershell
Stop-Service CCMGCTicketing -Force
# o: .\scripts\restart-service.ps1 -Stop  (según vuestro script)
Set-Service CCMGCTicketing -StartupType Disabled
```

### 6.2 Opción A — Mantener puerto 8080

Actualiza bookmarks, DataWall y Power BI a `http://192.168.12.67:8080`.

### 6.3 Opción B — Volver a puerto 3000 (recomendado para no cambiar URLs)

1. En `/opt/app-incidencias/prod/data/.env`:

   ```env
   PORT=3000
   NEXT_PUBLIC_APP_URL="http://192.168.12.67:3000"
   ```

2. Redeploy `node-prod` (reinicio del contenedor).

3. Comprobar: `http://192.168.12.67:3000/login`

Power BI y firewall deben apuntar otra vez a `:3000`.

---

## Fase 7 — Operación diaria

| Acción | Comando |
|--------|---------|
| Logs | `docker logs -f node-prod` |
| Reiniciar | Portainer → Restart, o `docker restart node-prod` |
| Actualizar versión | `git pull` en `/opt/app-incidencias/prod/src` → `docker build -t ccmgc-ticketing:prod .` → redeploy |
| Backup BD | Copiar `/opt/app-incidencias/prod/data/prisma/dev.db` |
| Backup uploads | Copiar `/opt/app-incidencias/prod/data/uploads/` |

Las migraciones Prisma se aplican solas al arrancar el contenedor (`entrypoint.sh`).

---

## Rollback

Si algo falla:

1. `docker stop node-prod`
2. `Set-Service CCMGCTicketing -StartupType Automatic`
3. `Start-Service CCMGCTicketing`
4. Los usuarios vuelven a `:3000` en Windows (datos intactos si no tocaste `C:\Users\Incidencias\AppIncidencias\prisma`).

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| 502 / sin respuesta | Contenedor caído o build incompleto | `docker logs node-prod` |
| Login no guarda sesión | `SESSION_COOKIE_SECURE=1` sin HTTPS | Pon `0` en LAN HTTP |
| BD vacía | Volumen prisma mal montado | Verifica `dev.db` en host |
| Permiso denegado SQLite | UID distinto | `chown 1000:1000` en data/prisma |
| Puerto ocupado en cutover | Windows aún en 3000 | Para el servicio NSSM primero |
| Power BI 401 | Falta `POWER_BI_API_KEY` en `.env` del contenedor | Añádela y redeploy |

---

## Qué NO migrar al contenedor

- **MySQL / phpMyAdmin** — la app no los usa (SQLite).
- **pgAdmin** — no hay Postgres en el stack; eliminable si no lo usáis.
- El servicio **NSSM Windows** — deshabilitarlo tras cutover exitoso.

---

## Referencias

- Linux nativo (sin Docker): [`docs/DEPLOY-DEBIAN.md`](../DEPLOY-DEBIAN.md)
- Power BI: [`docs/power-bi-dax.md`](../power-bi-dax.md)
- Export Windows: `scripts/export-migration-bundle.ps1`
