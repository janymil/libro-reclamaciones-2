# syntax=docker/dockerfile:1
#
# LibroDigital — production image.
#
# One image, two stages that matter: the client + server are built with the
# dev dependencies, and only `dist/` plus the production `node_modules` reach the
# runtime layer. The application reads its configuration from environment
# variables, which in production are supplied by **Docker secrets** (see
# docker-compose.yml and deploy/entrypoint.sh) — no `.env` file is copied into
# the image, and `.dockerignore` keeps any local one out of the build context.
#
# Build:  docker compose build --build-arg VITE_ADMIN_PATH=/acceso/...
# Run:    docker compose up -d

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# Build tools are needed by native modules (bcrypt). They exist only in the
# build stages; the runtime image carries the compiled result and nothing else.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*


# --- 1. Dependencies (dev, needed to build the client) -----------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


# --- 2. Build the client bundle and the server bundle ------------------------
FROM deps AS build
# Baked into the client at build time (`import.meta.env.VITE_ADMIN_PATH`).
# Changing it requires a rebuild, not a restart.
ARG VITE_ADMIN_PATH=/acceso/operaciones-7f31
ENV VITE_ADMIN_PATH=$VITE_ADMIN_PATH
COPY . .
RUN npm run build


# --- 3. Production dependencies only ----------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force


# --- 4. Runtime -------------------------------------------------------------
FROM base AS runtime

# tini reaps zombies and forwards SIGTERM, so `docker compose stop` drains
# in-flight requests instead of killing the process.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=5000 \
    ATTACHMENTS_DIR=/data/uploads

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
# Kept in the image so the operator can run migrations inside the container:
#   docker compose exec app node scripts/apply-sql.mjs migrations/0013_....sql
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

# CRLF would break the shebang on Linux; normalise before making it executable.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
 && chmod 0755 /usr/local/bin/entrypoint.sh \
 && mkdir -p /data/uploads \
 && chown -R node:node /data /app/dist /app/migrations /app/scripts /app/package.json

USER node

EXPOSE 5000

# `/api/health` is a liveness probe and does not touch the database, the AI
# provider or SMTP. Those dependencies are reported by `/api/status` (the public
# page); probing them every 30s kept the serverless database awake 24/7.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
