# Self-hosting

TurboKeep is one Node program that also serves the web page. It keeps everything in one folder (a SQLite database), has no other services to run, and runs as a normal system service (systemd), the same way every TurboNZL server does. It listens on **port 47901**.

## Install on Linux (a Raspberry Pi, a mini PC, a VPS)
One command on Raspberry Pi OS, Debian or Ubuntu. It installs Node 22, makes a `turbokeep` user, downloads and builds TurboKeep, installs the service and prints the address and the **setup code** for your first account:
```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbokeep/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /mnt/yourdrive/turbokeep
```
- `--data-dir` is where the database lives. **On a Raspberry Pi use a USB drive or SSD, not the SD card** (constant writes wear a card out); the installer warns when the folder is on the system disk. The default is `/var/lib/turbokeep`.
- `--port N` changes the port (default 47901). `--dry-run` prints what it would do and changes nothing. Run `./scripts/install-pi.sh --help` for the rest. It is safe to run again.
- From the machine itself: <http://localhost:47901>; from another computer `http://<the server's address>:47901` (for a Pi, its IP address or `raspberrypi.local`).
- The first account is the **owner**: the only one who can press *Update server* in Settings > This app.

**Every program on a machine needs its own port.** Two things cannot listen on the same one: the second fails to start ("address already in use"). TurboKeep uses 47901 (the TurboNZL port list gives each app its own number) so it does not collide with the usual 8080. Check what is taken with `ss -ltn` before picking another.

Service commands: `sudo systemctl status turbokeep`, `journalctl -u turbokeep -f` (logs), `sudo systemctl restart turbokeep`. Updating: [BACKUP_AND_UPDATE.md](BACKUP_AND_UPDATE.md).

## By hand (any machine with Node 22.13 or newer)
```
git clone https://github.com/TurboNZL/turbokeep && cd turbokeep
pnpm install --frozen-lockfile --ignore-scripts && pnpm build
TURBOKEEP_DATA=./data node --disable-warning=ExperimentalWarning apps/server/dist/server.mjs
```
Run it under systemd or any supervisor to keep it alive. The unit the installer writes is a good model (`WorkingDirectory` the checkout, `ExecStart` the line above, `Restart=on-failure`). With the supervisor's restart policy the in-app update works too (set `TURBOKEEP_UPDATE=1` when it is not systemd).

## Settings (environment variables)
In the installed service they live in `/etc/systemd/system/turbokeep.service` (`sudo systemctl edit turbokeep` to override, then restart).

| Variable | Default | What |
|---|---|---|
| `TURBOKEEP_PORT` | `47901` | The port the server listens on. |
| `HOST` | `0.0.0.0` | The address it listens on. `127.0.0.1` = this machine only (use that once a tunnel or reverse proxy on the same machine works). |
| `TURBOKEEP_DATA` | `./data` (`/var/lib/turbokeep` when installed) | Where the database lives. |
| `TURBOKEEP_WEB` | `./apps/web/dist` | The built web client. |
| `TURBOKEEP_TRUST_PROXY` | `true` | Believe `X-Forwarded-Proto` (so cookies are marked Secure behind HTTPS) and `CF-Connecting-IP` (so the sign-in lockout counts the real visitor). Set `false` only if the server faces the network directly. |
| `TURBOKEEP_ALLOW_SIGNUP` | `false` | Anyone who can open the page may create an account. Off: the first account only. |
| `TURBOKEEP_SETUP_CODE` | random, printed | The code the first account needs. The installer sets one and prints it. |
| `TURBOKEEP_ADMIN_USER`, `TURBOKEEP_ADMIN_PASSWORD` | unset | Create the first account at start-up instead of through the page (only when there are no accounts yet). |
| `TURBOKEEP_ORIGINS` | empty | Extra browser origins allowed to make changes (comma separated), rarely needed: see below. The Android app does not need it (it signs in with a token). |
| `TURBOKEEP_UPDATE` | auto | `0` switches the *Update server* button off, `1` offers it without systemd. |
| `TURBOKEEP_MAX_IMPORT_MB` | `256` | Largest import file. |
| `TURBOKEEP_SESSION_DAYS` | `30` | How long a sign-in lasts. |

## Behind your own reverse proxy
Point the proxy at the port (47901) and pass `Host`, `X-Forwarded-Proto` and `X-Forwarded-For`. Caddy:
```
keep.example.com {
    reverse_proxy 127.0.0.1:47901
}
```
nginx needs `proxy_set_header Host $host;`, `proxy_set_header X-Forwarded-Proto $scheme;`, `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `client_max_body_size 256m;` (imports). Put the proxy on the same machine and set `HOST=127.0.0.1`: do not leave the port open to the network next to the proxy, because with `TURBOKEEP_TRUST_PROXY=true` anyone who reaches it directly could forge those headers.

## Security notes
- Passwords are stored as scrypt hashes; sessions and API tokens only as SHA-256 of the secret. Ten failed sign-ins from one address lock it out for ten minutes.
- Changes made from a browser must come from the same site (the browser's `Sec-Fetch-Site`, or an `Origin` that matches the host). If a proxy changes the host name and your browser is old enough not to send `Sec-Fetch-Site`, list the public address in `TURBOKEEP_ORIGINS`.
- Notes and tasks are stored unencrypted in the database, like any self-hosted app. Encrypt the disk if that matters to you. (Standard Notes' end-to-end encryption is not part of TurboKeep.)
- Keep it on HTTPS if it is reachable from the internet; a tunnel does that for you.
