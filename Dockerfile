# syntax=docker/dockerfile:1
# CCMGC Ticketing — imagen de producción sobre Ubuntu 22.04 LTS (Docker Hub: ubuntu:22.04).
#
# Build:
#   docker build -t ccmgc-ticketing:prod .
# Run:
#   deploy/docker/docker-compose.node-prod.yml

ARG UBUNTU_VERSION=22.04

# ── Runtime Ubuntu + Node 20 ────────────────────────────────────────────────
FROM ubuntu:${UBUNTU_VERSION} AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Atlantic/Canary

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    openssl \
    tesseract-ocr \
    tesseract-ocr-spa \
    fontconfig \
    fonts-dejavu-core \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg-turbo8 \
    libgif7 \
    librsvg2-2 \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node --version \
  && npm --version

WORKDIR /app

# ── Dependencias npm (incluye toolchain para módulos nativos) ───────────────
FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# ── Build Next.js ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate \
  && npm run build

# ── Imagen final (solo runtime, sin gcc) ────────────────────────────────────
FROM base AS runner

LABEL org.opencontainers.image.base="ubuntu:22.04"
LABEL org.opencontainers.image.title="ccmgc-ticketing"
LABEL org.opencontainers.image.description="App de incidencias CCMGC (Next.js + SQLite)"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV PORT=8080

RUN groupadd --gid 1000 ccmgc \
  && useradd --uid 1000 --gid ccmgc --create-home --shell /usr/sbin/nologin ccmgc

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY scripts/docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
  && mkdir -p public/uploads logs \
  && chown -R ccmgc:ccmgc /app

USER ccmgc

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/login',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
