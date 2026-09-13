# CY Codex subscription gateway

This server connects the static Internal Beyond page to one long-lived `codex app-server` process. It uses the existing Codex subscription login, not an OpenAI API key.

## Install and log in

```bash
cd gateway
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
codex login --device-auth
```

The Codex authentication cache is sensitive. Keep `~/.codex/auth.json` on the server and never copy it into this repository or the browser.

## Run

```bash
cp .env.example .env
# Edit .env and choose a long random CY_GATEWAY_TOKEN.
set -a
. ./.env
set +a
uvicorn app:app --host 127.0.0.1 --port 8787
```

Put the service behind HTTPS with Caddy, Nginx, Cloudflare Tunnel, or the existing OB reverse proxy. In the mobile site, tap the subscription status pill and enter the HTTPS base URL plus the same pairing token.

The gateway persists one native Codex thread per conversation in SQLite, rotates threads when the model or identity prompt changes, drains turns after browser disconnects, and reads account/rate-limit/token usage from Codex App Server. It never invents a dollar budget.
