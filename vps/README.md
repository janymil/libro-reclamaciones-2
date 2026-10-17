# VPS deployment (host Caddy)

This folder is the deployment used on the VPS where **Caddy already runs as a
system service** on `:80/:443` for other sites. It is intentionally different
from the repository's root `docker-compose.yml`, which starts its own Caddy
container and expects to own those ports.

```
browser ──► host Caddy :443
              ├── /api/*  ──► 127.0.0.1:5001 (app container)
              └── /*      ──► /var/www/libro-de-reclamaciones (SPA + assets)
```

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | app only, loopback `127.0.0.1:5001`, Docker secrets |
| `Caddyfile.site.template` | site block to append to the host `/etc/caddy/Caddyfile` |
| `set-secrets.sh` | interactive secret writer / `--check` (no echo, no history) |
| `sync-static.sh` | copies the built client from the image to `/var/www/libro-de-reclamaciones` |

## Prerequisites

- Docker Engine + Compose plugin.
- Host Caddy active on `:80/:443` (not the container from the root compose file).
- DNS for `librodigital.pe` / `www.librodigital.pe` pointing at the VPS.
- Neon database (the app uses `@neondatabase/serverless` over WebSockets; a
  plain local PostgreSQL will not work).

## Secrets

Secrets are **one value per file** under `$SECRETS_DIR` (default: `../secrets`,
the repository's `secrets/` directory). They are never committed; the
pre-commit hook blocks that path.

```bash
sudo SECRETS_DIR=../secrets ./set-secrets.sh
sudo SECRETS_DIR=../secrets ./set-secrets.sh --check
```

Files: `DATABASE_URL.txt`, `SESSION_SECRET.txt`, `SMTP_PASSWORD.txt`,
`AI_API_KEY.txt`, `MERCADOPAGO_ACCESS_TOKEN.txt`, and optionally
`DECOLECTA_API_TOKEN.txt` (used by `RUC_API_PROVIDER=auto`).

The compose file starts the container as root **only for the entrypoint**: the
image runs as `node` (UID 1000), but Compose bind-mounts secret files with their
host mode (`0600 root`), which `node` cannot read. `deploy/entrypoint.sh`
exports the files and then `setpriv` drops to UID/GID 1000 before
`node dist/index.js`. `cap_drop: ALL` is kept; only `SETUID` and `SETGID` are
added for the switch.

## Build and start

```bash
cd vps
docker compose build

# Publish the client bundle to the host Caddy root.
./sync-static.sh

SECRETS_DIR=../secrets docker compose up -d
```

On the live VPS the secrets are outside the clone, so use their absolute path:

```bash
SECRETS_DIR=/opt/libro-de-reclamaciones/secrets docker compose up -d
```

Verify:

```bash
curl -fsS http://127.0.0.1:5001/api/status
curl -fsS http://127.0.0.1:5001/ready
```

## Caddy

Append `Caddyfile.site.template` to `/etc/caddy/Caddyfile`, then:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Do not start the root `docker-compose.yml` on this host: its Caddy service would
conflict with the system Caddy on ports 80/443.

## Update

```bash
git pull
cd vps
docker compose build
./sync-static.sh
SECRETS_DIR=/opt/libro-de-reclamaciones/secrets docker compose up -d
```

## Repository safety

- `secrets/` and `vps/secrets/` are git-ignored.
- `.githooks/pre-commit` blocks secret paths and credential-shaped content.
  Enable it once per clone:

  ```bash
  git config core.hooksPath .githooks
  ```

- Never paste credentials into an issue, a commit or a chat. Rotate anything
  that was exposed.
