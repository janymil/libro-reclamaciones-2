#!/usr/bin/env bash
# ============================================================================
# set-secrets.sh — write the VPS deployment secrets without echoing them.
#
#   sudo ./vps/set-secrets.sh
#   sudo ./vps/set-secrets.sh --check
#
# Secrets live in $SECRETS_DIR (default: ../secrets relative to this script).
# On the live VPS they are outside the repository:
#
#   sudo SECRETS_DIR=/opt/libro-de-reclamaciones/secrets ./vps/set-secrets.sh
#
# * values are read with `read -s` (no echo), never passed as command-line
#   arguments and never written to shell history;
# * files are written with printf (no trailing newline), root:root, mode 600;
# * --check prints names, modes and byte counts only — never values.
# ============================================================================
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS_DIR="${SECRETS_DIR:-$SCRIPT_DIR/../secrets}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [ "$(id -u)" -eq 0 ] || die "run as root: sudo $0"
}

names=(DATABASE_URL SESSION_SECRET SMTP_PASSWORD AI_API_KEY MERCADOPAGO_ACCESS_TOKEN DECOLECTA_API_TOKEN)

show_status() {
  printf '%-30s %-6s %s\n' "FILE" "MODE" "BYTES"
  local name file mode bytes
  for name in "${names[@]}"; do
    file="$SECRETS_DIR/$name.txt"
    if [ ! -f "$file" ]; then
      printf '%-30s %-6s %s\n' "$name.txt" "-" "MISSING"
      continue
    fi
    mode="$(stat -c '%a' "$file")"
    bytes="$(stat -c '%s' "$file")"
    if [ "$bytes" -eq 0 ]; then
      printf '%-30s %-6s %s\n' "$name.txt" "$mode" "EMPTY (not configured)"
    else
      printf '%-30s %-6s %s\n' "$name.txt" "$mode" "$bytes"
    fi
  done
}

if [ "${1:-}" = "--check" ]; then
  require_root
  show_status
  exit 0
fi

[ "$#" -eq 0 ] || die "unknown argument: $1 (only --check is supported)"

require_root
install -d -m 700 -o root -g root "$SECRETS_DIR"

VALUE=""

prompt_secret() {
  local label=$1 hint=$2
  printf '\n%s\n  %s\n  > ' "$label" "$hint"
  IFS= read -rs VALUE || die "aborted"
  printf '\n'
  [ -n "$VALUE" ] || die "value cannot be empty"
}

write_secret() {
  local name=$1
  local file="$SECRETS_DIR/$name.txt"
  printf '%s' "$VALUE" > "$file"
  chmod 600 "$file"
  chown root:root "$file"
  printf 'wrote %s.txt (%s bytes)\n' "$name" "$(stat -c '%s' "$file")"
  VALUE=""
}

ensure_session_secret() {
  local file="$SECRETS_DIR/SESSION_SECRET.txt"
  if [ -s "$file" ]; then
    printf 'keeping existing SESSION_SECRET.txt (%s bytes)\n' "$(stat -c '%s' "$file")"
    return
  fi
  openssl rand -hex 32 | tr -d '\n' > "$file"
  chmod 600 "$file"
  chown root:root "$file"
  printf 'generated SESSION_SECRET.txt (32 random bytes, hex)\n'
}

printf 'LibroDigital — secret entry\n'
printf 'Files: %s\n' "$SECRETS_DIR"
printf 'Nothing typed here is echoed or saved to shell history.\n'

ensure_session_secret

prompt_secret "Neon DATABASE_URL" \
  "postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
case "$VALUE" in
  postgresql://* | postgres://*) ;;
  *) die "DATABASE_URL must start with postgresql:// (nothing was written)" ;;
esac
case "$VALUE" in
  *neon.tech* | *neon.build*) ;;
  *) printf 'warning: this does not look like a Neon host; the app uses the Neon WebSocket driver.\n' ;;
esac
write_secret DATABASE_URL

prompt_secret "SMTP password" \
  "Zoho app-specific password (or the mailbox password when 2FA is off)"
write_secret SMTP_PASSWORD

prompt_secret "AI API key" \
  "Groq / OpenAI-compatible key (gsk_...)"
write_secret AI_API_KEY

prompt_secret "Mercado Pago access token" \
  "Production credentials: APP_USR-... (TEST- only for sandbox)"
case "$VALUE" in
  APP_USR-* | TEST-*) ;;
  *) printf 'warning: expected APP_USR-... (production) or TEST-... (sandbox).\n' ;;
esac
write_secret MERCADOPAGO_ACCESS_TOKEN

if [ ! -s "$SECRETS_DIR/DECOLECTA_API_TOKEN.txt" ]; then
  printf '\nOptional: DECOLECTA_API_TOKEN is not set (RUC lookup falls back to apisnet).\n'
  printf 'Add it by writing the token to %s/DECOLECTA_API_TOKEN.txt\n' "$SECRETS_DIR"
fi

printf '\nDone. Status:\n\n'
show_status
printf '\nNext: cd vps && docker compose up -d\n'
