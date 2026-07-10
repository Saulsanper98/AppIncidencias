#!/usr/bin/env bash
# Instala Caddy y configura HTTPS interno delante de node :3000
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_root

apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

cp "${PROJECT_ROOT}/deploy/linux/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

ok "Caddy activo. HTTPS en :443 → proxy a :3000"
log "Ajusta RATE_LIMIT_TRUST_PROXY=1 en .env si usas Caddy"
