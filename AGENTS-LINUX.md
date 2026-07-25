# Instrucciones para Cursor — VM Debian (producción)

Cuando el usuario pida **dejar la app lista**, **migrar a Linux** o **arrancar producción en Debian**, sigue este flujo exacto.

## Contexto

- App: **CCMGC Ticketing** (Next.js 15 + Prisma SQLite + `server.js`)
- Producción Linux: servicio systemd `ccmgc-ticketing`
- Equivalente Windows (obsoleto): NSSM `CCMGCTicketing`
- TZ crítica: `Atlantic/Canary`

## Prerrequisitos en la VM

1. Repo en `/opt/ccmgc-ticketing` (clone o copia)
2. Datos migrados desde Windows:
   - `.env`
   - `prisma/*.db` (según `DATABASE_URL`)
   - `public/uploads/`
   - `certs/` (opcional)
3. Acceso `sudo`

Si faltan datos, indica al usuario que en Windows ejecute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-migration-bundle.ps1
```

## Comando principal (ejecutar tú mismo)

```bash
cd /opt/ccmgc-ticketing
chmod +x scripts/linux/*.sh
sudo bash scripts/linux/bootstrap.sh
```

No pidas al usuario que lo haga manualmente si tienes terminal: **ejecútalo**.

## Verificación obligatoria tras bootstrap

```bash
systemctl is-active ccmgc-ticketing
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/login
journalctl -u ccmgc-ticketing -n 30 --no-pager
```

Éxito = servicio `active` + HTTP 200/307 en `/login`.

## Si falla

1. `sudo bash scripts/linux/setup-deps.sh` — Node 20 y libs nativas
2. `sudo bash scripts/linux/migrate-data-check.sh` — ¿falta `.env` o la BD?
3. Logs: `journalctl -u ccmgc-ticketing -n 80 --no-pager`
4. Build sin memoria → sugerir swap 2 GB o VM 6 GB RAM

## Actualizar código (tras git pull)

```bash
cd /opt/ccmgc-ticketing
sudo bash scripts/linux/rebuild.sh
```

## Reinicio rápido (sin build)

```bash
sudo bash scripts/linux/restart-service.sh
```

## No usar en Linux

- Scripts `*.ps1` de Windows (NSSM, rebuild-service.ps1)
- `tools/nssm/`

## Documentación completa

Ver `docs/DEPLOY-DEBIAN.md`
