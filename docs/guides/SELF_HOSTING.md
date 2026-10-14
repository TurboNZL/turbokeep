# Self-hosting with Docker

TurboKeep is one container: a Node server that also serves the web page. It listens on **port 47901** on your machine (8080 inside the container) and keeps everything in one folder (`/data`, a SQLite database). It has no other services to run.

## Docker Compose (recommended)
```
git clone https://github.com/TurboNZL/turbokeep && cd turbokeep
docker compose up -d
```
The image is `ghcr.io/turbonzl/turbokeep` (`:latest`, or a version such as `:2026.10.0`; amd64 and arm64, so a Raspberry Pi 4 or 5 works). The compose file publishes the port on `127.0.0.1` only; remove the `127.0.0.1:` from the `ports:` line to reach it from your LAN.

**Every program on a machine needs its own port.** Two things cannot listen on the same one: the second fails to start ("address already in use"). TurboKeep uses 47901 so it does not collide with the usual 8080, and you can move it by setting `TURBOKEEP_PORT=` in `.env` (compose) or as an environment variable (no Docker). Check what is taken with `ss -ltn` (Linux) before picking a number. The data lives in the named volume `turbokeep-data`.

If `docker compose pull` answers *denied* or *unauthorized*, the package on GitHub is still private (new packages start private): the owner opens GitHub > Packages > turbokeep > Package settings and sets the visibility to public, or you run `docker login ghcr.io` with a token that can read packages.

## Settings (environment variables)
| Variable | Default | What |
|---|---|---|
| `TURBOKEEP_PORT` | `47901` | Port on your machine. Without Docker this is the port the server listens on; with compose it is the left side of the published port. |
| `PORT` | `47901` (`8080` in the image) | The same thing, if `TURBOKEEP_PORT` is not set. The Docker image sets it to 8080 inside the container. |
| `TURBOKEEP_DATA` | `/data` | Where the database lives. |
| `TURBOKEEP_TRUST_PROXY` | `true` | Believe `X-Forwarded-Proto` (so cookies are marked Secure behind HTTPS) and `CF-Connecting-IP` (so the sign-in lockout counts the real visitor). Set `false` only if the container faces the network directly. |
| `TURBOKEEP_ALLOW_SIGNUP` | `false` | Anyone who can open the page may create an account. Off: the first account only. |
| `TURBOKEEP_SETUP_CODE` | random, printed | The code the first account needs. Set your own to avoid reading the log. |
| `TURBOKEEP_ADMIN_USER`, `TURBOKEEP_ADMIN_PASSWORD` | unset | Create the first account at start-up instead of through the page (only when there are no accounts yet). |
| `TURBOKEEP_ORIGINS` | empty | Extra browser origins allowed to make changes (comma separated), rarely needed: see below. |
| `TURBOKEEP_MAX_IMPORT_MB` | `256` | Largest import file. |
| `TURBOKEEP_SESSION_DAYS` | `30` | How long a sign-in lasts. |

## Without Docker
Each release has `turbokeep-<version>-node.tar.gz`: `server.mjs` and the web client in `web/`. You need Node 22.13 or newer.
```
mkdir turbokeep && tar -xzf turbokeep-*-node.tar.gz -C turbokeep && cd turbokeep
TURBOKEEP_DATA=./data TURBOKEEP_WEB=./web node --disable-warning=ExperimentalWarning server.mjs
```
Run it as a service with systemd or any supervisor.

## Behind your own reverse proxy
Point the proxy at the port (47901) and pass `Host`, `X-Forwarded-Proto` and `X-Forwarded-For`. Caddy:
```
keep.example.com {
    reverse_proxy 127.0.0.1:47901
}
```
nginx needs `proxy_set_header Host $host;`, `proxy_set_header X-Forwarded-Proto $scheme;`, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `client_max_body_size 256m;` (imports). Do not expose the container's own port to the internet next to the proxy: with `TURBOKEEP_TRUST_PROXY=true` anyone who reaches it directly could forge those headers.

## Security notes
- Passwords are stored as scrypt hashes; sessions and API tokens only as SHA-256 of the secret. Ten failed sign-ins from one address lock it out for ten minutes.
- Changes made from a browser must come from the same site (the browser's `Sec-Fetch-Site`, or an `Origin` that matches the host). If a proxy changes the host name and your browser is old enough not to send `Sec-Fetch-Site`, list the public address in `TURBOKEEP_ORIGINS`.
- Notes and tasks are stored unencrypted in the database, like any self-hosted app. Encrypt the disk if that matters to you. (Standard Notes' end-to-end encryption is not part of TurboKeep.)
- Keep it on HTTPS if it is reachable from the internet; a tunnel does that for you.

Backups and updates: [BACKUP_AND_UPDATE.md](BACKUP_AND_UPDATE.md).
