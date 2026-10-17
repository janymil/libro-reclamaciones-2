#!/bin/sh
set -eu

# ============================================================================
# Docker secrets -> environment
# ============================================================================
# In production there is no `.env` file: every password lives in a file under
# /run/secrets, mounted read-only by Docker (see docker-compose.yml). This script
# exports each of those files under the file's own name, so the application keeps
# reading `process.env.DATABASE_URL`, `process.env.SMTP_PASSWORD`, ... with no
# code change and no secret ever being written to disk inside the image.
#
# Files are named after the variable they carry:
#
#   /run/secrets/DATABASE_URL             postgresql://...neon.tech/...?sslmode=require
#   /run/secrets/SESSION_SECRET           openssl rand -hex 32
#   /run/secrets/SMTP_PASSWORD            mailbox / app-specific password
#   /run/secrets/AI_API_KEY               provider key
#   /run/secrets/MERCADOPAGO_ACCESS_TOKEN APP_USR-...
#
# (A trailing newline, which every editor adds, is stripped by `$(cat ...)`.)
# ============================================================================

if [ -d /run/secrets ]; then
  for file in /run/secrets/*; do
    [ -f "$file" ] || continue
    name=$(basename "$file")
    # Only export names that can be environment variables (skip key material
    # such as tls.key that a future secret might mount).
    case "$name" in
      *[!A-Za-z0-9_]*|[0-9]*) continue ;;
    esac
    value=$(cat "$file")
    export "$name=$value"
  done
fi

# Fail fast. A container that boots without these would either serve a broken
# deployment (no database) or, worse, run with a known development session secret
# that lets anybody forge an authenticated cookie.
: "${DATABASE_URL:?missing secret: /run/secrets/DATABASE_URL}"
: "${SESSION_SECRET:?missing secret: /run/secrets/SESSION_SECRET}"
: "${APP_URL:?APP_URL is not set (docker-compose.yml -> app.environment)}"

case "$APP_URL" in
  https://*) ;;
  *)
    echo "[entrypoint] APP_URL must be the public HTTPS address (got: $APP_URL)." >&2
    echo "[entrypoint] Mercado Pago only delivers webhooks over HTTPS." >&2
    exit 1
    ;;
esac

if [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "[entrypoint] SESSION_SECRET is too short: generate it with 'openssl rand -hex 32'." >&2
  exit 1
fi

exec "$@"
