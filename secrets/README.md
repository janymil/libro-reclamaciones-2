# Secrets — where the passwords live

This directory is the **only** place the production passwords are meant to sit on
the VPS. There is no `.env`: `docker-compose.yml` mounts each file below as a
Docker secret, and `deploy/entrypoint.sh` exports it as the variable of the same
name before the application starts.

Everything here is git-ignored except this README and `.gitignore`.

## Files to create on the server

| File | Variable the app receives | How to obtain it |
|---|---|---|
| `DATABASE_URL.txt` | `DATABASE_URL` | Neon dashboard → Connection string (pooled, `?sslmode=require`) |
| `SESSION_SECRET.txt` | `SESSION_SECRET` | `openssl rand -hex 32` |
| `SMTP_PASSWORD.txt` | `SMTP_PASSWORD` | Zoho → *App passwords* (with 2FA) or the mailbox password |
| `AI_API_KEY.txt` | `AI_API_KEY` | Groq / OpenAI-compatible provider |
| `MERCADOPAGO_ACCESS_TOKEN.txt` | `MERCADOPAGO_ACCESS_TOKEN` | Mercado Pago → *Tus integraciones* → production credentials (`APP_USR-…`) |

Optional, only if the feature is enabled (add them to the `secrets:` list in
`docker-compose.yml` first): `WHATSAPP_ACCESS_TOKEN.txt`,
`WHATSAPP_APP_SECRET.txt`, `APISNET_API_TOKEN.txt`, `DECOLECTA_API_TOKEN.txt`,
`CULQI_SECRET_KEY.txt`.

## Create them (on the VPS, as root)

```bash
install -d -m 700 -o root -g root /opt/librodigital/secrets
cd /opt/librodigital/secrets

# One line per secret; no quotes, no `export`, no trailing spaces.
printf '%s' 'postgresql://USER:PASS@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require' \
  > DATABASE_URL.txt
openssl rand -hex 32 > SESSION_SECRET.txt
printf '%s' 'la-clave-smtp' > SMTP_PASSWORD.txt
printf '%s' 'gsk_...'       > AI_API_KEY.txt
printf '%s' 'APP_USR-...'   > MERCADOPAGO_ACCESS_TOKEN.txt

chmod 600 ./*.txt
chown root:root ./*.txt
chmod 700 .
```

Why `printf '%s'` and not `echo`: `echo` appends a newline. Docker secrets keep
the bytes verbatim and the entrypoint strips one trailing newline, but writing
without it removes any doubt (a trailing newline inside a password silently
breaks SMTP authentication).

## Verify

```bash
# Only root, and only the files: no directory listing for anybody else.
ls -la /opt/librodigital/secrets        # -rw------- root root
sudo -u root cat /opt/librodigital/secrets/SESSION_SECRET.txt | wc -c   # 64
```

After the stack starts, the secrets exist **inside the container** only as
environment variables and as tmpfs files under `/run/secrets`:

```bash
docker compose exec app sh -c 'ls -l /run/secrets; test -n "$DATABASE_URL" && echo "DATABASE_URL ok"'
```

They never appear in `docker inspect` (only the secret *references* do), never in
an image layer, and never in `docker compose config`.

## Rotating a password

1. Edit the file (same permissions).
2. `docker compose up -d --force-recreate app` — secrets are read at container
   start, not on every request.
3. For `SESSION_SECRET`, rotation signs everybody out (sessions become invalid).
   Do it deliberately, not during business hours.

## Backups

The secrets are not in the database and not in Git. Keep an **offline** copy
(password manager or an encrypted archive) — losing `SESSION_SECRET` only forces
a re-login, but losing `DATABASE_URL`/SMTP/MP credentials means a manual recovery
through each provider.

```bash
# Example: encrypted, off-site copy
tar -czf - -C /opt/librodigital secrets | age -p > ~/librodigital-secrets-$(date +%F).tar.gz.age
```
