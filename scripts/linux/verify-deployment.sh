#!/usr/bin/env bash
# Verificación post-despliegue (Fase 0).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

PORT="${PORT:-3000}"
FAIL=0

check() {
  if eval "$2"; then
    ok "$1"
  else
    err "$1"
    FAIL=$((FAIL + 1))
  fi
}

log "==== Verificación despliegue CCMGC ===="

check "Servicio systemd activo" "systemctl is-active --quiet ${SERVICE_NAME}.service"
check "HTTP /login responde" "curl -fsS -o /dev/null -m 10 http://127.0.0.1:${PORT}/login"
check "Archivo .env presente" "test -f '${PROJECT_ROOT}/.env'"
check "Build .next presente" "test -f '${PROJECT_ROOT}/.next/BUILD_ID'"

DB_PATH="$(resolve_sqlite_path)"
if [[ -n "${DB_PATH}" ]]; then
  check "Base SQLite accesible" "test -f '${DB_PATH}'"
fi

if curl -kfsS -o /dev/null -m 5 https://127.0.0.1/login 2>/dev/null; then
  ok "HTTPS (Caddy) responde"
else
  warn "HTTPS no responde (Caddy opcional)"
fi

if [[ -d /var/backups/ccmgc-ticketing ]]; then
  COUNT="$(find /var/backups/ccmgc-ticketing -name 'ccmgc-*.tar.gz' 2>/dev/null | wc -l | tr -d ' ')"
  log "Backups en disco: ${COUNT}"
fi

if [[ "${FAIL}" -eq 0 ]]; then
  ok "Verificación OK"
  exit 0
fi

err "${FAIL} comprobación(es) fallaron"
exit 1
