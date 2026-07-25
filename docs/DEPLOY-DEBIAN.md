# CCMGC Ticketing — despliegue en Debian/Linux

Guía para dejar la app en producción en una VM Debian 13 (o Ubuntu 22.04+), sustituyendo el Windows Server con NSSM.

**Para el agente de Cursor en la VM:** lee primero [`AGENTS-LINUX.md`](../AGENTS-LINUX.md) en la raíz del repo.

---

## 1. Requisitos de la VM

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 6 GB |
| Disco | 40 GB | 60–80 GB |
| SO | Debian 13 netinst (sin GUI) | Misma red VLAN que el Windows antiguo |

Instalación Debian: solo sistema base + SSH server + utilidades estándar.

---

## 2. Migrar datos desde Windows (en el PC actual)

En **PowerShell** en el Windows de producción:

```powershell
cd C:\Users\Incidencias\AppIncidencias
powershell -ExecutionPolicy Bypass -File .\scripts\export-migration-bundle.ps1
```

Se genera `migration-bundle\ccmgc-migration-YYYYMMDD-HHMMSS.zip` con:

- `.env`
- Base SQLite (`prisma/*.db` según `DATABASE_URL`)
- `public/uploads/`
- `certs/` (si usáis HTTPS con PFX)

Copia el zip a la VM (SCP, USB, red compartida).

---

## 3. Preparar la VM Debian

### 3.1 Clonar el repositorio

```bash
sudo mkdir -p /opt/ccmgc-ticketing
sudo chown "$USER":"$USER" /opt/ccmgc-ticketing
git clone <URL_DEL_REPO> /opt/ccmgc-ticketing
cd /opt/ccmgc-ticketing
```

Si no hay git remoto, copia la carpeta del proyecto entera por SCP/rsync.

### 3.2 Descomprimir el bundle de migración

```bash
cd /opt/ccmgc-ticketing
unzip ~/ccmgc-migration-*.zip -d /tmp/ccmgc-mig
cp /tmp/ccmgc-mig/.env .
mkdir -p prisma public/uploads
cp /tmp/ccmgc-mig/prisma/* prisma/ 2>/dev/null || true
cp -a /tmp/ccmgc-mig/public/uploads/. public/uploads/ 2>/dev/null || true
cp -a /tmp/ccmgc-mig/certs . 2>/dev/null || true
```

### 3.3 Un solo comando para dejar la app lista

```bash
cd /opt/ccmgc-ticketing
chmod +x scripts/linux/*.sh
sudo bash scripts/linux/bootstrap.sh
```

`bootstrap.sh` hace:

1. `setup-deps.sh` — Node 20, build-essential, librerías para canvas/OCR
2. `migrate-data-check.sh` — comprueba `.env`, SQLite y uploads
3. `install-service.sh` — `npm ci`, migraciones, build, servicio systemd

---

## 4. Comprobar que funciona

```bash
systemctl status ccmgc-ticketing
curl -I http://127.0.0.1:3000/login
journalctl -u ccmgc-ticketing -n 40 --no-pager
```

Desde otro PC en la LAN: `http://<IP-VM>:3000`

---

## 5. Operaciones del día a día

| Acción | Comando |
|--------|---------|
| Estado | `sudo systemctl status ccmgc-ticketing` |
| Reiniciar (sin build) | `sudo bash scripts/linux/restart-service.sh` |
| Actualizar código + rebuild | `git pull && sudo bash scripts/linux/rebuild.sh` |
| Logs en vivo | `journalctl -u ccmgc-ticketing -f` |
| Logs a fichero | `tail -f logs/service-err.log` |

---

## 6. Servicio systemd

- Unidad: `/etc/systemd/system/ccmgc-ticketing.service`
- Usuario: `ccmgc` (creado automáticamente)
- Arranque: `node server.js` (rate limiting incluido)
- TZ: `Atlantic/Canary` (crítico para fechas canarias en desvíos)
- Variables: `.env` + `Environment=` en la unidad

---

## 7. HTTPS (opcional)

Opción recomendada en Linux: **Caddy o Nginx** delante con certificado interno o Let's Encrypt.

Si migráis el PFX de Windows:

```env
TLS_PFX_PATH="certs/server.pfx"
TLS_PFX_PASSPHRASE="..."
HTTPS_PORT=3443
SESSION_COOKIE_SECURE=1
```

La app escuchará también en `:3443` vía `server.js`.

---

## 8. Cortar el Windows antiguo

1. Comprobar que la VM Linux tiene los mismos datos (tickets, usuarios, uploads).
2. Cambiar IP/DNS o proxy para apuntar a la VM nueva.
3. `Stop-Service CCMGCTicketing` en Windows.
4. Mantener backup del zip de migración y de `prisma/*.db`.

---

## 9. Solución de problemas

| Síntoma | Qué revisar |
|---------|-------------|
| `npm ci` falla | `sudo bash scripts/linux/setup-deps.sh` |
| Servicio cae al arrancar | `journalctl -u ccmgc-ticketing -n 80` |
| BD vacía | ¿Copiaste `prisma/*.db`? `DATABASE_URL` en `.env` |
| Build sin RAM | VM con menos de 4 GB; añade swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Puerto ocupado | `sudo ss -ltnp \| grep 3000` |

---

## 10. Estructura de scripts Linux

```
scripts/linux/
  bootstrap.sh           ← entrada única (usar esto)
  setup-deps.sh          ← dependencias del SO
  install-service.sh     ← systemd + build inicial
  rebuild.sh             ← migrate + generate + build + restart
  restart-service.sh     ← reinicio rápido
  migrate-data-check.sh  ← verifica datos de Windows
  common.sh              ← funciones compartidas

deploy/linux/
  ccmgc-ticketing.service  ← plantilla systemd
```
