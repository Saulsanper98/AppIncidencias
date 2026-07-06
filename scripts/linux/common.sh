#!/usr/bin/env bash
# Funciones compartidas para despliegue Linux (Debian/Ubuntu).
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-ccmgc-ticketing}"
APP_USER="${APP_USER:-ccmgc}"
APP_GROUP="${APP_GROUP:-ccmgc}"
DEFAULT_PORT="${DEFAULT_PORT:-3000}"

# Raíz del repo: scripts/linux -> ../..
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { log "[OK] $*"; }
warn() { log "[!] $*"; }
err()  { log "[X] $*" >&2; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    err "Este script requiere root. Ejecuta: sudo bash $0"
    exit 1
  fi
}

require_project_root() {
  if [[ ! -f "${PROJECT_ROOT}/package.json" ]] || [[ ! -f "${PROJECT_ROOT}/server.js" ]]; then
    err "No encuentro package.json o server.js en ${PROJECT_ROOT}"
    exit 1
  fi
  ok "Raíz del proyecto: ${PROJECT_ROOT}"
}

find_node() {
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  else
    err "Node.js no está instalado. Ejecuta primero: sudo bash scripts/linux/setup-deps.sh"
    exit 1
  fi
  NODE_MAJOR="$("${NODE_BIN}" -p "process.versions.node.split('.')[0]")"
  if [[ "${NODE_MAJOR}" -lt 20 ]]; then
    err "Se requiere Node.js 20+. Versión actual: $("${NODE_BIN}" --version)"
    exit 1
  fi
  NPM_BIN="$(command -v npm || true)"
  if [[ -z "${NPM_BIN}" ]]; then
    err "npm no encontrado junto a node."
    exit 1
  fi
  ok "Node: ${NODE_BIN} ($("${NODE_BIN}" --version))"
}

ensure_app_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --home-dir "${PROJECT_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
    ok "Usuario de sistema creado: ${APP_USER}"
  else
    ok "Usuario de sistema ya existe: ${APP_USER}"
  fi
}

ensure_logs_dir() {
  mkdir -p "${PROJECT_ROOT}/logs"
  chown -R "${APP_USER}:${APP_GROUP}" "${PROJECT_ROOT}/logs"
}

load_dotenv_key() {
  local key="$1"
  local env_file="${PROJECT_ROOT}/.env"
  [[ -f "${env_file}" ]] || return 1
  grep -E "^[[:space:]]*${key}=" "${env_file}" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//" | tr -d '\r' | sed -E 's/^["'\''](.*)["'\'']$/\1/'
}

resolve_sqlite_path() {
  local url="${1:-$(load_dotenv_key DATABASE_URL || true)}"
  if [[ -z "${url}" ]]; then
    echo ""
    return
  fi
  local rel="${url#file:}"
  rel="${rel#./}"
  if [[ "${rel}" = /* ]]; then
    echo "${rel}"
  else
    echo "${PROJECT_ROOT}/prisma/${rel#prisma/}"
  fi
}

wait_for_port_free() {
  local port="$1"
  local deadline=$((SECONDS + 25))
  while (( SECONDS < deadline )); do
    if ! ss -ltn "sport = :${port}" 2>/dev/null | grep -q LISTEN; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

service_cmd() {
  systemctl "$@" "${SERVICE_NAME}.service"
}
