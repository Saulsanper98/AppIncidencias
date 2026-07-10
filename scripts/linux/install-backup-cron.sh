#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_root
require_project_root

chmod +x "${SCRIPT_DIR}/backup.sh"

CRON_LINE="15 2 * * * root cd ${PROJECT_ROOT} && ${SCRIPT_DIR}/backup.sh >> ${PROJECT_ROOT}/logs/backup.log 2>&1"
CRON_FILE="/etc/cron.d/ccmgc-ticketing-backup"

cat > "${CRON_FILE}" << EOF
# Backup diario CCMGC Ticketing (02:15)
${CRON_LINE}
EOF

chmod 644 "${CRON_FILE}"
mkdir -p "${PROJECT_ROOT}/logs"
chown "${APP_USER}:${APP_GROUP}" "${PROJECT_ROOT}/logs" 2>/dev/null || true

ok "Cron instalado: ${CRON_FILE} (diario 02:15)"
