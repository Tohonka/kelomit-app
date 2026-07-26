# Kelomit server

Read-only web view over the database the phone pushes up. See
`docs/superpowers/specs/2026-07-26-remote-sync-web-view-design.md`.

## Local development

Requires **Node 22.x** on PATH. `better-sqlite3` compiles a native module and
has no prebuilt binary for Node 26 — if `npm test` or `npm run dev` fails
while rebuilding `better-sqlite3`, that's why. Switch to Node 22 (e.g. `nvm use 22`).

    cd server
    npm ci
    npm test

There is no build step: production runs the TypeScript directly via `tsx`
(see below), so there's nothing to compile locally either. Use
`npx tsc --noEmit -p tsconfig.json` as the type-check gate.

## Deploy (Playground-1)

The repo is checked out at `/home/tommi/kelomit/`.

    cd /home/tommi/kelomit
    printf 'KELOMIT_SYNC_TOKEN=%s\n' "$(openssl rand -hex 32)" > server/.env
    docker compose -f server/compose.yaml up -d --build

Then append to `/home/tommi/picofi/Caddyfile`:

    kelmi.pico.fi {
        tls {
            dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        }
        @api path /api/*
        handle @api {
            reverse_proxy 172.17.0.1:8090
        }
        handle {
            basic_auth {
                tommi <bcrypt-hash-from-caddy-hash-password>
            }
            reverse_proxy 172.17.0.1:8090
        }
    }

Generate the hash with:

    docker exec picofi-caddy-1 caddy hash-password --plaintext '<password>'

Reload Caddy:

    docker exec picofi-caddy-1 caddy reload --config /etc/caddy/Caddyfile

The `@api` matcher matters: the app authenticates with a bearer token, so
`/api/*` must not be behind basic auth or every sync gets a 401.

Put the value of `KELOMIT_SYNC_TOKEN` into the app's Settings → Data → Remote sync.
