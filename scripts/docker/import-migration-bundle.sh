#!/usr/bin/env bash
# Importa el zip generado en Windows (export-migration-bundle.ps1) al host Docker.
set -euo pipefail

ZIP="${1:?Uso: $0 /ruta/ccmgc-migration-YYYYMMDD-HHMMSS.zip}"
BASE="${2:-/opt/app-incidencias/prod/data}"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Descomprimiendo ${ZIP}..."
unzip -q "${ZIP}" -d "${TMP}"

sudo mkdir -p "${BASE}/prisma" "${BASE}/uploads" "${BASE}/certs" "${BASE}/logs"

if [[ -f "${TMP}/.env" ]]; then
  sudo cp "${TMP}/.env" "${BASE}/.env"
  log ".env copiado"
fi

if compgen -G "${TMP}/prisma/*" >/dev/null; then
  sudo cp -a "${TMP}/prisma/"* "${BASE}/prisma/"
  log "Base SQLite copiada"
fi

if [[ -d "${TMP}/public/uploads" ]]; then
  sudo cp -a "${TMP}/public/uploads/." "${BASE}/uploads/"
  log "uploads/ copiado"
fi

if [[ -d "${TMP}/certs" ]]; then
  sudo cp -a "${TMP}/certs/." "${BASE}/certs/"
  log "certs/ copiado"
fi

sudo chown -R 1000:1000 "${BASE}/prisma" "${BASE}/uploads" "${BASE}/certs" "${BASE}/logs"
sudo chmod 660 "${BASE}/prisma/"*.db 2>/dev/null || true

log "Ajusta ${BASE}/.env para Docker:"
log "  PORT=8080"
log "  NEXT_PUBLIC_APP_URL=http://192.168.12.67:8080"
log "Importación terminada."
