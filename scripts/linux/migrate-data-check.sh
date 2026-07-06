#!/usr/bin/env bash
# Verifica que los datos migrados desde Windows estén presentes antes de arrancar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_project_root

log "==== Comprobando datos de migración ===="

MISSING=0

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  warn "Falta .env — cópialo desde el Windows (C:\\Users\\Incidencias\\AppIncidencias\\.env)"
  MISSING=1
else
  ok ".env presente"
fi

DB_PATH="$(resolve_sqlite_path)"
if [[ -z "${DB_PATH}" ]]; then
  warn "DATABASE_URL no definido en .env"
  MISSING=1
elif [[ ! -f "${DB_PATH}" ]]; then
  warn "Base SQLite no encontrada: ${DB_PATH}"
  warn "Cópiala desde Windows (prisma/dev.db o la ruta de DATABASE_URL en .env)"
  MISSING=1
else
  SIZE="$(du -h "${DB_PATH}" | awk '{print $1}')"
  ok "Base SQLite: ${DB_PATH} (${SIZE})"
fi

UPLOADS="${PROJECT_ROOT}/public/uploads"
if [[ -d "${UPLOADS}" ]]; then
  COUNT="$(find "${UPLOADS}" -type f 2>/dev/null | wc -l | tr -d ' ')"
  ok "Uploads: ${UPLOADS} (${COUNT} ficheros)"
else
  warn "No existe ${UPLOADS} — créala o copia desde Windows si hay adjuntos"
  mkdir -p "${UPLOADS}"
fi

if [[ -d "${PROJECT_ROOT}/certs" ]]; then
  ok "Carpeta certs/ presente (HTTPS opcional)"
fi

if [[ "${MISSING}" -eq 1 ]]; then
  warn "Hay elementos pendientes. Puedes continuar (se creará BD vacía) o copiar datos y relanzar bootstrap."
  exit 1
fi

ok "Datos de migración OK."
