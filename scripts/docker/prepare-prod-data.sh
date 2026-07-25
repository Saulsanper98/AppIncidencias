#!/usr/bin/env bash
# Prepara carpetas de datos persistentes para node-prod en el host Docker.
set -euo pipefail

BASE="${1:-/opt/app-incidencias/prod/data}"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Creando estructura en ${BASE}..."
sudo mkdir -p \
  "${BASE}/prisma" \
  "${BASE}/uploads" \
  "${BASE}/certs" \
  "${BASE}/logs" \
  "${BASE}/src"

sudo chown -R 1000:1000 "${BASE}/prisma" "${BASE}/uploads" "${BASE}/certs" "${BASE}/logs"
sudo chmod 770 "${BASE}/prisma" "${BASE}/uploads" "${BASE}/logs"

if [[ ! -f "${BASE}/.env" ]]; then
  log "Copia deploy/docker/env.prod.example → ${BASE}/.env y edítalo."
fi

log "Listo. Siguiente:"
log "  1. Copia el bundle de migración (prisma/dev.db, uploads, .env)"
log "  2. Clona el repo en ${BASE}/src"
log "  3. sudo bash scripts/docker/build-prod.sh   # Ubuntu 22.04 + app"
log "  4. Portainer: node-prod → image ccmgc-ticketing:prod (NO ubuntu:22.04 vacío)"
