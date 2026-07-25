#!/usr/bin/env bash
# Backup diario: SQLite + uploads + .env (sin secretos en logs).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_project_root

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/ccmgc-ticketing}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_ROOT}/${STAMP}"

mkdir -p "${DEST}"

log "Backup CCMGC → ${DEST}"

DB_PATH="$(resolve_sqlite_path)"
if [[ -n "${DB_PATH}" && -f "${DB_PATH}" ]]; then
  sqlite3 "${DB_PATH}" ".backup '${DEST}/database.db'" 2>/dev/null || cp -a "${DB_PATH}" "${DEST}/database.db"
  ok "Base de datos copiada"
else
  warn "No hay base SQLite en ${DB_PATH:-?}"
fi

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  cp -a "${PROJECT_ROOT}/.env" "${DEST}/.env"
  chmod 600 "${DEST}/.env"
fi

if [[ -d "${PROJECT_ROOT}/public/uploads" ]]; then
  tar -czf "${DEST}/uploads.tar.gz" -C "${PROJECT_ROOT}/public" uploads
  ok "Uploads empaquetados"
fi

if [[ -d "${PROJECT_ROOT}/certs" ]]; then
  tar -czf "${DEST}/certs.tar.gz" -C "${PROJECT_ROOT}" certs
fi

echo "${STAMP}" > "${DEST}/backup-stamp.txt"
tar -czf "${BACKUP_ROOT}/ccmgc-${STAMP}.tar.gz" -C "${BACKUP_ROOT}" "${STAMP}"
rm -rf "${DEST}"

find "${BACKUP_ROOT}" -maxdepth 1 -name 'ccmgc-*.tar.gz' -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true

ok "Backup: ${BACKUP_ROOT}/ccmgc-${STAMP}.tar.gz"
