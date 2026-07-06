#!/usr/bin/env bash
# Instala o reconfigura el servicio systemd de CCMGC Ticketing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

PORT="${PORT:-${DEFAULT_PORT}}"
SKIP_BUILD="${SKIP_BUILD:-0}"

require_root
require_project_root
find_node
ensure_app_user
ensure_logs_dir

# El usuario del servicio debe poder leer/escribir el proyecto
chown -R "${APP_USER}:${APP_GROUP}" "${PROJECT_ROOT}"

log "==== Instalando servicio ${SERVICE_NAME} ===="

if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
  warn "No existe .env. Copia .env desde Windows o: cp .env.example .env"
  if [[ -f "${PROJECT_ROOT}/.env.example" ]]; then
    cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
    warn "Creado .env desde .env.example — REVISA DATABASE_URL y secretos antes de producción."
  else
    err "Falta .env y .env.example"
    exit 1
  fi
fi

if [[ "${SKIP_BUILD}" != "1" ]]; then
  log "npm ci..."
  cd "${PROJECT_ROOT}"
  sudo -u "${APP_USER}" env HOME="${PROJECT_ROOT}" npm ci

  log "prisma migrate deploy..."
  sudo -u "${APP_USER}" env HOME="${PROJECT_ROOT}" npx prisma migrate deploy

  if [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
    log "npm run build..."
    sudo -u "${APP_USER}" env HOME="${PROJECT_ROOT}" NODE_ENV=production npm run build
  else
    ok ".next/BUILD_ID ya existe."
  fi

  if [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
    err "Build incompleto: falta .next/BUILD_ID"
    exit 1
  fi
else
  warn "SKIP_BUILD=1: no ejecuto npm ci / migrate / build."
fi

# Permisos: BD SQLite, uploads
chmod -R u+rwX,g+rwX "${PROJECT_ROOT}/prisma" "${PROJECT_ROOT}/public/uploads" "${PROJECT_ROOT}/logs" 2>/dev/null || true
mkdir -p "${PROJECT_ROOT}/public/uploads"

DB_PATH="$(resolve_sqlite_path)"
if [[ -n "${DB_PATH}" && -f "${DB_PATH}" ]]; then
  chown "${APP_USER}:${APP_GROUP}" "${DB_PATH}"
  chmod 660 "${DB_PATH}"
  ok "Base de datos: ${DB_PATH}"
else
  warn "No encuentro fichero SQLite (${DB_PATH:-sin DATABASE_URL}). Si migras desde Windows, cópialo antes de arrancar."
fi

UNIT_SRC="${PROJECT_ROOT}/deploy/linux/ccmgc-ticketing.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -f "${UNIT_SRC}" ]]; then
  err "Falta plantilla systemd: ${UNIT_SRC}"
  exit 1
fi

sed \
  -e "s|@APP_ROOT@|${PROJECT_ROOT}|g" \
  -e "s|@APP_USER@|${APP_USER}|g" \
  -e "s|@APP_GROUP@|${APP_GROUP}|g" \
  -e "s|@PORT@|${PORT}|g" \
  "${UNIT_SRC}" > "${UNIT_DST}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"

log "Arrancando servicio..."
systemctl restart "${SERVICE_NAME}.service"
sleep 3

if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  ok "Servicio activo."
else
  err "El servicio no arrancó. Revisa: journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
  exit 1
fi

# Firewall opcional (ufw)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow "${PORT}/tcp" comment "CCMGC Ticketing HTTP" || true
  HTTPS_PORT="$(load_dotenv_key HTTPS_PORT || echo 3443)"
  if [[ -n "${HTTPS_PORT}" ]]; then
    ufw allow "${HTTPS_PORT}/tcp" comment "CCMGC Ticketing HTTPS" || true
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "==========================================================="
echo "  Instalación Linux completada"
echo "==========================================================="
echo "  Servicio : ${SERVICE_NAME}"
echo "  URL local: http://127.0.0.1:${PORT}"
if [[ -n "${IP}" ]]; then
  echo "  URL LAN  : http://${IP}:${PORT}"
fi
echo "  Logs     : journalctl -u ${SERVICE_NAME} -f"
echo "  Reinicio : sudo bash scripts/linux/restart-service.sh"
echo "  Rebuild  : sudo bash scripts/linux/rebuild.sh"
echo ""
