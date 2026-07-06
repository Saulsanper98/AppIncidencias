#!/usr/bin/env bash
# Punto de entrada único: deja la app lista en Debian (deps + datos + servicio).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_root
require_project_root

log "==== Bootstrap CCMGC Ticketing (Debian/Linux) ===="

bash "${SCRIPT_DIR}/setup-deps.sh"
bash "${SCRIPT_DIR}/migrate-data-check.sh" || true
bash "${SCRIPT_DIR}/install-service.sh"

log "Comprobando HTTP en :${DEFAULT_PORT}..."
sleep 2
if curl -fsS -o /dev/null -m 10 "http://127.0.0.1:${DEFAULT_PORT}/login" 2>/dev/null; then
  ok "La app responde en http://127.0.0.1:${DEFAULT_PORT}/login"
else
  warn "No obtuve respuesta HTTP todavía. Revisa: journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi

log "==== Bootstrap terminado ===="
