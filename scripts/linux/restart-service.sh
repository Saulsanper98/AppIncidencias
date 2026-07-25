#!/usr/bin/env bash
# Reinicia el servicio sin recompilar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_root
require_project_root

if ! systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  err "Servicio no instalado. Ejecuta: sudo bash scripts/linux/install-service.sh"
  exit 1
fi

log "Reiniciando ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}.service"
sleep 2
systemctl is-active --quiet "${SERVICE_NAME}.service" && ok "Servicio activo." || {
  err "Fallo al reiniciar. journalctl -u ${SERVICE_NAME} -n 30 --no-pager"
  exit 1
}
