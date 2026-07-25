#!/bin/sh
set -e

cd /app

echo "[entrypoint] Aplicando migraciones Prisma..."
npx prisma migrate deploy

echo "[entrypoint] Arrancando server.js en :${PORT:-8080}..."
exec node server.js
