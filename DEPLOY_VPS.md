# Deploying LibroDigital on a VPS

> **Audience:** whoever sets up / operates the production server (including an
> automated agent following this file top to bottom). Every command is copy-paste
> ready and assumes a **fresh Ubuntu 24.04 LTS VPS** with root access.
>
> **Goal:** the app running at `https://<domain>` in Docker, with **no `.env`
> file** — every password lives in a Docker secret mounted from
> `/opt/librodigital/secrets` (section 5).

---

## 1. What runs where

```
            Internet
               │  80/443
        ┌──────▼───────┐
        │    Caddy     │  automatic HTTPS (Let's Encrypt)
        │  (container) │  reverse proxy → app:5000
        └──────┬───────┘
               │ private docker network (web)
        ┌──────▼───────┐        secrets: /run/secrets/*  (tmpfs, read-only)
        │     app      │◄────── /opt/librodigital/secrets/*.txt  (mode 600, host)
        │  Node 22     │
        └──────┬───────┘
               │ TLS (WebSocket, sslmode=require)
        ┌──────▼───────┐
        │ Neon Postgres│  managed: backups + PITR
        └──────────────┘
```

| Component | Where it lives | Notes |
|---|---|---|
| Application | this repository, `Dockerfile` | `NODE_ENV=production`, `node dist/index.js` |
| Reverse proxy / TLS | `caddy:2-alpine` | ports 80/443 are the only ones exposed |
| Database | **Neon** (managed PostgreSQL) | the app uses `@neondatabase/serverless` over WebSockets — see §7 |
| Uploads (evidence) | Docker volume `uploads` → `/data/uploads` | must be backed up |
| Passwords | Docker secrets → `/run/secrets` | see §5, never a `.env` |
| Mercado Pago | external | webhook must reach `https://<domain>/api/payments/webhook/mercadopago` |

Files that matter:

- `Dockerfile`, `.dockerignore`
- `docker-compose.yml` (app + caddy + secrets)
- `deploy/entrypoint.sh` (exports `/run/secrets/*` as env vars, fails fast)
- `deploy/Caddyfile` (domain + TLS)
- `secrets/README.md` (secret layout and rotation)

---

## 2. Server requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU / RAM | 2 vCPU / 2 GB | 2 vCPU / 4 GB (PDF + AI traffic) |
| Disk | 25 GB SSD | 50 GB SSD |
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| Network | public IPv4, ports 80/443 open | + IPv6 (nice to have) |

The VPS does **not** run PostgreSQL: the database is Neon. That keeps the server
stateless (only the `uploads` volume holds data) and removes a whole class of
backup/HA problems.

---

## 3. Harden the server first

Run all of this before installing the app.

```bash
# --- Packages and time -------------------------------------------------------
apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git
timedatectl set-timezone UTC

# --- Automatic security updates ---------------------------------------------
dpkg-reconfigure -plow unattended-upgrades      # choose "Yes"

# --- SSH: keys only (do this AFTER your key works in a second terminal!) -----
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

# --- Firewall: only SSH, HTTP, HTTPS. Port 5000 stays closed forever. --------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# --- fail2ban for SSH --------------------------------------------------------
systemctl enable --now fail2ban
fail2ban-client status sshd

# --- Swap (protects the build step on a 2 GB machine) ------------------------
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Docker Engine + compose plugin

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker version && docker compose version

# Log rotation for the daemon itself (container logs are limited in the compose file).
cat >/etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker
```

---

## 4. DNS and domain

1. Create an `A` record: `<domain>` → VPS public IPv4 (and `AAAA` if you have IPv6).
2. Wait for propagation: `dig +short <domain>` must return the VPS IP.
3. **If Cloudflare proxies the domain (orange cloud):** that is fine, but then
   the app sees two proxies in front of it — set `TRUST_PROXY: "2"` in
   `docker-compose.yml` (see §6) and restrict the firewall to Cloudflare ranges if
   you want the origin unreachable directly. With DNS-only (grey cloud), keep
   `TRUST_PROXY: "1"`.

Caddy will only be able to issue the certificate once DNS points at the server and
ports 80/443 are open.

## 5. Secrets: no `.env`, ever

The application reads `process.env`. In this deployment those variables come from
**Docker secrets**, not from a file inside the project:

```
/opt/librodigital/secrets/DATABASE_URL.txt        (mode 600, root)
        │  docker compose mounts it as a secret
        ▼
/run/secrets/DATABASE_URL                         (tmpfs, read-only, in the container)
        │  deploy/entrypoint.sh
        ▼
DATABASE_URL=...  →  node dist/index.js
```

Why this and not `.env`:

- a `.env` sits in the project directory, where every editor, backup, tarball and
  coding agent that can read the repo can also read the passwords;
- `.env` is easy to commit by accident (one `git add -f`);
- Docker secrets never appear in `docker inspect`, in image layers, or in
  `docker compose config`, and they are not written to the container's disk.

### 5.1 Create them

```bash
install -d -m 700 -o root -g root /opt/librodigital/secrets
cd /opt/librodigital/secrets

# 1) Neon connection string (pooled endpoint, keep ?sslmode=require)
printf '%s' 'postgresql://USER:PASSWORD@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require' \
  > DATABASE_URL.txt

# 2) Session signing key — 64 hex chars
openssl rand -hex 32 > SESSION_SECRET.txt

# 3) SMTP password (Zoho app-specific password if 2FA is on)
printf '%s' 'la-clave-smtp' > SMTP_PASSWORD.txt

# 4) AI provider key
printf '%s' 'gsk_xxx' > AI_API_KEY.txt

# 5) Mercado Pago PRODUCTION access token (Tus integraciones → Credenciales)
printf '%s' 'APP_USR-xxx' > MERCADOPAGO_ACCESS_TOKEN.txt

chmod 600 ./*.txt && chown root:root ./*.txt
```

Rules that prevent the classic "works in dev, 401 in production" bugs:

- **no quotes, no `export`, no spaces** in the files — the bytes are the value;
- **one value per file**, no comments;
- `printf '%s'` (not `echo`) so no trailing newline sneaks into a password;
- the file name **is** the variable name. Adding
  `WHATSAPP_ACCESS_TOKEN.txt` only works after listing it under `secrets:` in
  `docker-compose.yml`.

Optional secrets (WhatsApp, RUC lookup, Culqi): create the file, add the name to
the `secrets:` list of the `app` service, then `docker compose up -d`.

### 5.2 What is a secret and what is not

| Secret (file in `/run/secrets`) | Plain setting (compose `environment:`) |
|---|---|
| `DATABASE_URL` | `APP_URL`, `PORT`, `TRUST_PROXY`, `NODE_ENV` |
| `SESSION_SECRET` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM_*` |
| `SMTP_PASSWORD` | `AI_BASE_URL`, `AI_MODEL*` |
| `AI_API_KEY` | `MERCADOPAGO_SANDBOX`, `PLATFORM_ADMIN_EMAILS` |
| `MERCADOPAGO_ACCESS_TOKEN` | `ATTACHMENTS_DIR`, `RUC_API_PROVIDER` |

Nothing in the right column is sensitive; if you prefer, it can also be a secret —
the entrypoint exports **every** file it finds.

### 5.3 Verify the container received them

```bash
docker compose exec app sh -c 'ls -l /run/secrets; test -n "$DATABASE_URL" && echo DATABASE_URL=ok'
docker compose exec app sh -c 'echo "${#SESSION_SECRET}"'    # 64
```

If any of `DATABASE_URL`, `SESSION_SECRET` or `APP_URL` is missing, the container
**refuses to start** with a clear message (see `deploy/entrypoint.sh`). That is
deliberate: a production boot with a known development session secret would let
anyone forge a session cookie.

---

## 6. Get the code, point it at the domain, build, start

```bash
install -d -m 755 /opt/librodigital
git clone https://github.com/janymil/libro-reclamaciones-2 /opt/librodigital/app
cd /opt/librodigital/app

# --- Set the real domain in the two places that need it ----------------------
export DOMAIN=app.tudominio.pe                 # <- change
sed -i "s|app.example.com|$DOMAIN|g" docker-compose.yml deploy/Caddyfile

# --- Confirm the two settings that bite when wrong ---------------------------
grep -n 'APP_URL' docker-compose.yml           # https://app.tudominio.pe
grep -n 'TRUST_PROXY' docker-compose.yml       # "1" (Caddy only) or "2" (+ Cloudflare)
```

Build and start:

```bash
cd /opt/librodigital/app
docker compose build            # ~2-4 min; bakes the client bundle
docker compose up -d
docker compose ps               # app healthy, caddy running
docker compose logs -f caddy    # watch the certificate being issued (Ctrl+C to exit)
```

The **admin console path** is baked into the client at build time. The default is
`/acceso/operaciones-7f31`; to use another one:

```bash
VITE_ADMIN_PATH=/acceso/mi-ruta-secreta docker compose build
docker compose up -d
```

It must be set for **both** the build (client) and the running container (server
header). `docker-compose.yml` already passes the build arg; add the same value to
the `environment:` block if you change it.

```bash
VITE_ADMIN_PATH=/acceso/mi-ruta-secreta docker compose build
VITE_ADMIN_PATH=/acceso/mi-ruta-secreta docker compose up -d
```

The variable is used twice: the client bakes the path into the bundle (build arg)
and the server reads it for the `X-Robots-Tag: noindex` header and the platform
self-check (`environment:`). Supplying it to both commands keeps them in sync.

---

## 7. Database (Neon) and migrations

### 7.1 Why Neon and not a local PostgreSQL

`server/db.ts` uses `@neondatabase/serverless` over **WebSockets**. That driver
speaks Neon's protocol; a plain PostgreSQL on the VPS would need a WebSocket proxy
or a code change. Keep the database on Neon (managed backups, PITR, pooling) —
the VPS stays stateless.

Get the pooled connection string from the Neon dashboard and put it in
`secrets/DATABASE_URL.txt`. Keep `?sslmode=require`.

### 7.2 Apply migrations

The application does **not** migrate on boot. Migrations are plain SQL files in
`migrations/`, applied with the script that ships inside the image:

```bash
cd /opt/librodigital/app

# --- Fresh database: apply everything, in order -----------------------------
for f in migrations/0*.sql; do
  echo "== $f"
  docker compose exec -T app node scripts/apply-sql.mjs "$f" || break
done

# --- Existing database (the current production one): apply only what is new --
# Check first whether the column already exists:
docker compose exec -T app node --input-type=module -e "
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(\"select column_name from information_schema.columns where table_name='payments' and column_name like 'recovery%'\");
console.log(r.rows);
await pool.end();
"
# If the list is empty, apply the pending one:
docker compose exec -T app node scripts/apply-sql.mjs migrations/0013_payment_recovery.sql
```

Notes:

- every script is idempotent (`IF NOT EXISTS`), so re-running is safe;
- the **session table is created automatically** by `connect-pg-simple` on boot;
- `npm run db:push` (drizzle-kit) also works inside the container if you prefer
  schema diffing, but it is not needed for a normal deploy.

### 7.3 Create the platform (operator) account

```bash
docker compose exec app node scripts/setup-platform-admin.mjs --email hola@librodigital.pe
```

It prints a generated password once; store it in the password manager and change
it at first login. `PLATFORM_ADMIN_EMAILS` (compose) is the allow-list that decides
which accounts are operators.

---

## 8. Verify the deployment

```bash
# 1. Inside the container (bypasses TLS; port 5000 is not published)
docker compose exec app node -e "fetch('http://127.0.0.1:5000/api/status').then(r=>r.text()).then(console.log)"

# 2. Through Caddy/TLS — this is the one that matters
curl -fsS https://<domain>/api/status
# {"status":"operational", ..., "components":{"api":...,"database":...,"email":...,"ai":...}}

curl -fsS https://<domain>/ready

# 3. The public page loads
curl -fsS -o /dev/null -w '%{http_code}\n' https://<domain>/

# 4. The payment webhook is reachable (Mercado Pago will POST here)
curl -fsS -X POST https://<domain>/api/payments/webhook/mercadopago \
  -H 'Content-Type: application/json' \
  -d '{"type":"merchant_order","data":{"id":"1"}}'
# {"received":true,"handled":false}     <- 200 means the whole chain works

# 5. Container health
docker compose ps
docker compose logs --tail=100 app
```

`"handled": false` in step 4 is correct: a merchant_order is not a payment, it just
proves the request reached the app and was answered.

## 9. Mercado Pago in production

1. **Credentials:** *Tus integraciones → tu aplicación → Credenciales de producción*.
   The token starts with `APP_USR-`; it goes into
   `secrets/MERCADOPAGO_ACCESS_TOKEN.txt`. Keep `MERCADOPAGO_SANDBOX: "false"`.
2. **Webhook URL:** the app prints the exact address at boot:

   ```bash
   docker compose logs app | grep 'webhook to register'
   # [payments] Mercado Pago webhook to register: https://<domain>/api/payments/webhook/mercadopago
   ```

   Register it in *Tus integraciones → Webhooks* with the events `payment`,
   `subscription_preapproval` and `subscription_authorized_payment`. The app also
   sends `notification_url` inside every preference/preapproval, so the panel
   entry is a safety net, not the only path.
3. **`APP_URL` must be the public domain.** Every return URL after paying and
   every webhook is built from it; a `localhost` or `http://` value silently
   breaks plan activation.
4. **Verify the chain before blaming the app:**

   ```bash
   curl -fsS -X POST https://<domain>/api/payments/webhook/mercadopago \
     -H 'Content-Type: application/json' -d '{"type":"merchant_order","data":{"id":"1"}}'
   # {"received":true,"handled":false}
   ```

   A 502 here means the webhook cannot reach the server, and **no** payment will
   ever activate a plan (exactly what a tunnel pointed at the wrong address
   family does — see §12).
5. **First real payment:** use a **different person's card, phone and network**,
   the list price and **no promo code**. Paying your own merchant account with
   your own card is what Mercado Pago's antifraud scores as
   `cc_rejected_high_risk`.
6. **Yape:** offered per seller account and confirmed asynchronously. The plan
   activates when the webhook arrives, so step 4 must be green before concluding
   "Yape does not work". If the option does not appear on the checkout page at
   all, the account is not enabled for it — that is an account/business-profile
   matter with Mercado Pago support, not an app setting.
7. **Recovery flow already built in:** when a charge is declined, the customer
   receives the same checkout link plus the transfer/Yape details; and the admin
   console (*Pagos*) can resend that email, or confirm the payment as received by
   transfer/Yape against the same `LD-XXXXXX` reference.

---

## 10. Backups and restore

| What | How | Frequency |
|---|---|---|
| Database | Neon: enable **PITR**/backups in the project; restore into a branch | continuous |
| Uploads (evidence) | tar the `uploads` volume off the VPS | daily |
| Secrets | offline, encrypted copy (`secrets/README.md`) | on change |

```bash
# Uploads — run from the host (volume name is <project>_uploads)
install -d /opt/backups
docker run --rm \
  -v librodigital_uploads:/data:ro \
  -v /opt/backups:/backup \
  alpine sh -c 'tar czf /backup/uploads-$(date +%F).tgz -C /data .'
ls -lh /opt/backups
```

Restore:

1. **Database:** create a Neon branch from the desired timestamp, take its
   connection string, put it in `secrets/DATABASE_URL.txt`, then
   `docker compose up -d --force-recreate app`.
2. **Uploads:**
   `docker run --rm -v librodigital_uploads:/data -v /opt/backups:/backup alpine tar xzf /backup/uploads-YYYY-MM-DD.tgz -C /data`.

Run a restore drill once, on a scratch branch, before you actually need it.

## 11. Day-2 operations

```bash
cd /opt/librodigital/app

# Logs (app = payments, webhook, security; caddy = TLS and requests)
docker compose logs -f app | grep -i payment
docker compose logs -f app | grep -i security
docker compose logs -f caddy

# Restart only the app (secrets are re-read on start)
docker compose up -d --force-recreate app

# Deploy a new version
git pull --ff-only
docker compose build
docker compose up -d            # replaces the container; Caddy stays up

# Tag a known-good image before the next deploy (for rollback)
docker tag librodigital/app:latest librodigital/app:$(git rev-parse --short HEAD)

# Disk hygiene
df -h /
docker system df
docker image prune -f
```

Deployment rule: **migrations are additive** (new columns/tables, no destructive
changes), so old and new containers can run against the same database during a
short deploy. Never drop a column in the same release that stops using it.

---

## 12. Troubleshooting

| Symptom | Likely cause | What to check / do |
|---|---|---|
| `502` from Caddy | container unhealthy or crashed | `docker compose ps`, `docker compose logs --tail=100 app` |
| `502 error code: 502` from **Cloudflare** while the app is up | the tunnel dials `localhost`, which resolves to `[::1]`, and the app listened on IPv4 only | the app binds **dual-stack** (`serving on port 5000 (::)`); if the log shows `(0.0.0.0)`, IPv6 is unavailable — point the tunnel at `http://127.0.0.1:5000` |
| Login succeeds then immediately "session expired" | cookie is `Secure` (production) but the site is served over HTTP, or `TRUST_PROXY` is wrong behind two proxies | `APP_URL` must be `https://…`; `TRUST_PROXY` = `1` (Caddy only) or `2` (Cloudflare + Caddy) |
| Payment approved in Mercado Pago, plan still pending | webhook not arriving | `curl -X POST https://<domain>/api/payments/webhook/mercadopago …` (§8 step 4); then *Pagos → Verificar ahora*, or *Confirmar transferencia/Yape* |
| `cc_rejected_high_risk` on real cards | Mercado Pago antifraud (personal account, self-purchase, retries) | business account + a different payer's card; open a case with MP with the payment IDs |
| Yape option missing | seller account not enabled for Yape | convert to a business account; ask MP support |
| `missing secret: /run/secrets/DATABASE_URL` at boot | file absent, wrong name, or not listed under `secrets:` | `ls -l /opt/librodigital/secrets`, `docker compose config` |
| `SESSION_SECRET is required in production` | secret not mounted | same as above; regenerate with `openssl rand -hex 32` |
| Emails not delivered (`/api/status` → email degraded) | wrong SMTP password, or a trailing newline inside it | `docker compose exec app node scripts/smtp-diagnose.mjs`; recreate the secret with `printf '%s'` |
| `EADDRINUSE` | another process on 5000 | `ss -lptn 'sport = :5000'`; stop the duplicate |
| Uploads disappear after a redeploy | volume not mounted | `docker volume ls | grep uploads`; compose mounts `uploads:/data/uploads` |
| Certificate not issued | DNS not pointing here, or ports 80/443 closed | `dig +short <domain>`, `ufw status`, `docker compose logs caddy` |

## 13. Security checklist (tick before going live)

- [ ] SSH: keys only, root password login disabled, `fail2ban` active.
- [ ] UFW: only `22`, `80`, `443`. Port `5000` **not** published.
- [ ] `docker compose config` shows no secret values (only secret names).
- [ ] `secrets/`: directory `700`, files `600`, root-owned.
- [ ] `git status` shows no secret file (the directory is git-ignored).
- [ ] `https://<domain>` serves a valid certificate; HSTS header present.
- [ ] `/api/status` reports `database`, `email` and (if enabled) `ai` operational.
- [ ] Webhook smoke test returns 200 (§8 step 4).
- [ ] Platform admin created; `PLATFORM_ADMIN_EMAILS` correct; the demo account is not in the allow-list.
- [ ] Neon backups/PITR enabled and a restore drilled.
- [ ] Uploads volume backup scheduled and copied off the VPS.
- [ ] Offline copy of the secrets in the password manager.
- [ ] `APP_URL` and `TRUST_PROXY` match the real topology.
- [ ] Mercado Pago: production credentials, webhook registered, `live_mode` payments visible in the panel.

---

## 14. Alternative: Cloudflare Tunnel instead of Caddy

If the VPS must not expose ports 80/443 (or the IP should stay hidden), run
`cloudflared` instead of Caddy:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create librodigital
cloudflared tunnel route dns librodigital <domain>
```

Ingress **must point at a reachable origin**, and `localhost` is a trap on hosts
with IPv6: prefer `http://127.0.0.1:5000` (IPv4 explicitly) and publish the app as
`127.0.0.1:5000:5000`.

```yaml
# ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: <domain>
    service: http://127.0.0.1:5000
  - service: http_status:404
```

With a tunnel, Cloudflare terminates TLS: remove the `caddy` service (or keep it
only for local testing), publish `127.0.0.1:5000:5000`, set `TRUST_PROXY: "1"`, and
keep `APP_URL=https://<domain>`.

**Known failure mode (already hit once):** `originService=http://localhost:5000`
plus an app bound to `0.0.0.0` gives
`dial tcp [::1]:5000: actively refused` → every request, including Mercado Pago's
webhook, returns 502. The app now binds both families, but the explicit
`127.0.0.1` in the tunnel config removes the ambiguity.

---

## 15. One-page order of operations

```text
1.  Harden the VPS (section 3) + install Docker
2.  DNS A record -> VPS IP (section 4)
3.  git clone into /opt/librodigital/app (section 6)
4.  Create /opt/librodigital/secrets, 5 files, mode 600 (section 5)
5.  sed the domain into docker-compose.yml + deploy/Caddyfile (section 6)
6.  docker compose build && docker compose up -d
7.  Apply migrations (section 7.2)
8.  Create the platform admin (section 7.3)
9.  Verify: /api/status, /ready, site, webhook smoke test (section 8)
10. Register the webhook in Mercado Pago (section 9)
11. Backups: Neon PITR + uploads volume + offline secrets (section 10)
12. Run the security checklist (section 13)
```

Everything else — how the app is structured, the payment lifecycle, where each
secret is used — is in `RUNBOOK.md` and `PRODUCTION_READINESS.md`.





