#!/usr/bin/env bash
# Construye la imagen de producción (Ubuntu 22.04 + Node 20 + app).
set -euo pipefail

TAG="${1:-ccmgc-ticketing:prod}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "${ROOT}"
echo "[build] Imagen: ${TAG} (base ubuntu:22.04)"
docker build -t "${TAG}" .
echo "[OK] docker images ${TAG%%:*}"
