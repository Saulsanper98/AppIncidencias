#!/usr/bin/env bash
# Instala dependencias del sistema para Debian 13 / Ubuntu (Node 20, build tools).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_root

log "==== Instalando dependencias del sistema ===="

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

PACKAGES=(
  ca-certificates
  curl
  git
  build-essential
  python3
  pkg-config
  libcairo2-dev
  libpango1.0-dev
  libjpeg-dev
  libgif-dev
  librsvg2-dev
  fontconfig
  fonts-dejavu-core
  tesseract-ocr
  tesseract-ocr-spa
)

apt-get install -y -qq "${PACKAGES[@]}"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]]; then
  log "Instalando Node.js 20 LTS (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

find_node
ok "Dependencias del sistema listas."
log "Node: $("${NODE_BIN}" --version) | npm: $("${NPM_BIN}" --version)"
