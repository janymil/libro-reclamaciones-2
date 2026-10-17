#!/usr/bin/env bash
# ============================================================================
# Publish the client bundle that is baked into the app image.
#
#   ./vps/sync-static.sh [image]
#
# Copies <image>:/app/dist/public/ to /var/www/libro-de-reclamaciones, which the
# host Caddy serves. Run it after every `docker compose build`.
#
# The destination is replaced, not merged: Vite emits hashed filenames, so old
# files would otherwise accumulate forever.
# ============================================================================
set -euo pipefail

IMAGE="${1:-librodigital/app:latest}"
DEST="${DEST:-/var/www/libro-de-reclamaciones}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed" >&2
  exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "image not found: $IMAGE (run: docker compose build)" >&2
  exit 1
fi

container="$(docker create "$IMAGE")"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

install -d -m 755 "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
docker cp "$container:/app/dist/public/." "$DEST/"

if [ ! -f "$DEST/index.html" ]; then
  echo "index.html was not copied - aborting" >&2
  exit 1
fi

echo "Synced $(find "$DEST" -type f | wc -l) files from $IMAGE to $DEST"
