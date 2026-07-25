#!/usr/bin/env bash
# Reconstruye la app y reinicia el servicio (equivalente a rebuild.ps1 en Windows).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

SKIP_BUILD="${SKIP_BUILD:-0}"

require_root
require_project_root
find_node
ensure_app_user
ensure_logs_dir

LOG_FILE="${PROJECT_ROOT}/logs/rebuild-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "${LOG_FILE}") 2>&1

log "==== Rebuild CCMGC Ticketing (Linux) ===="
log "Repo: ${PROJECT_ROOT}"
log "Log : ${LOG_FILE}"

cd "${PROJECT_ROOT}"

if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  log "Parando servicio ${SERVICE_NAME}..."
  systemctl stop "${SERVICE_NAME}.service" || true
  wait_for_port_free "${DEFAULT_PORT}" || warn "Puerto ${DEFAULT_PORT} sigue ocupado tras parar el servicio."
  sleep 2
else
  warn "Servicio ${SERVICE_NAME} no instalado. Continúo con el build."
fi

# Matar node huérfano en :3000 que no sea el servicio
if ss -ltn "sport = :${DEFAULT_PORT}" 2>/dev/null | grep -q LISTEN; then
  ORPHAN_PID="$(ss -ltnp "sport = :${DEFAULT_PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)"
  if [[ -n "${ORPHAN_PID}" ]]; then
    warn "Matando node huérfano en :${DEFAULT_PORT} (PID=${ORPHAN_PID})"
    kill -9 "${ORPHAN_PID}" 2>/dev/null || true
    sleep 1
  fi
fi

run_as_app() {
  sudo -u "${APP_USER}" env HOME="${PROJECT_ROOT}" NODE_ENV=production "$@"
}

log "prisma migrate deploy..."
run_as_app npx prisma migrate deploy

log "prisma generate..."
run_as_app npx prisma generate

if [[ -x "${PROJECT_ROOT}/node_modules/.bin/tsx" ]] || [[ -f "${PROJECT_ROOT}/node_modules/.bin/tsx" ]]; then
  log "sync tipologia..."
  run_as_app npx tsx scripts/sync-tipologia.ts
else
  warn "tsx no encontrado; omito sync-tipologia."
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "next build..."
  run_as_app npm run build
  if [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
    err "Build incompleto: falta .next/BUILD_ID"
    exit 1
  fi
else
  warn "SKIP_BUILD=1: omito next build."
fi

chown -R "${APP_USER}:${APP_GROUP}" "${PROJECT_ROOT}/.next" "${PROJECT_ROOT}/node_modules/.prisma" 2>/dev/null || true

if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  log "Arrancando servicio..."
  systemctl start "${SERVICE_NAME}.service"
  sleep 4
  systemctl is-active --quiet "${SERVICE_NAME}.service" && ok "Servicio activo." || err "Servicio no arrancó."
fi

log "==== Rebuild OK ===="
