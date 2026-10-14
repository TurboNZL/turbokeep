# TurboKeep: project handoff

Read this first, then `PROJECT_BRIEF.md`. This file is the running state and decision log: update it whenever a decision or the state changes.

## Engine
This app is pinned to TurboNZL/turboengine (see `.turboengine.json`; `docs/development/ENGINE.md` says which modules and where they live). The engine is a **reference, not a dependency**: its modules are working code copied into apps. Before building something that every app would want (updates, release naming, the theme picker, window chrome, settings layout, guides), look in the engine's `modules/` first and copy from it rather than inventing a new one. If you improve a module here, say so in the session log so it can be ported back to the engine.

## User preferences (how to work with them)
- Don't waste their usage. Fact-check and double-check yourself; use web search liberally.
- They write casually; reply in normal capitalised prose.
- Put effort into verifying against real runs, not only unit tests.
- A merged PR cannot take new work: restart the branch from main for follow-up changes. Commit trailers as the harness gives them.

## Decisions made (don't re-ask)
| Topic | Decision |
|---|---|
| Shape | One web app + server in ONE Docker image, SQLite in `/data`. No desktop/Android build. |
| Server stack | Hono on Node 22, built-in `node:sqlite` (no native modules), esbuild to one file. |
| Client stack | React 18 + Vite + Tailwind (turbothemes preset) + zustand. |
| Engine "self-hosted-server" set | Deliberately NOT taken in full (no `server-install-update`, `updaters`, `cloudflare-access` fields): see `.turboengine.json` `notes`. New engine module `docker-self-host` created from this app instead. |
| Auth | Setup code for first account; sign-up closed unless `TURBOKEEP_ALLOW_SIGNUP`; scrypt; cookie sessions + `tk_` bearer tokens. |
| Standard Notes | Reads decrypted zip / JSON / plain .txt .md; writes the same zip layout. Encrypted backups refused with instructions. |
| Vikunja | Reads/writes the data-export zip. Cross-project relations OFF by default in export (old Vikunja duplicates tasks); `?relations=all` to keep. |
| Descriptions | Plain text in this app; HTML flattened on import, `<p>` wrapped on export. |
| Reminders | Stored and exported, NOT sent (no notification channel yet). |
| Port | 47901 on the host (`TURBOKEEP_PORT`), 8080 inside the container; never default to 8080 (the owner runs several servers per machine). |
| Versions / assets | `vYYYY.M.N`; image `ghcr.io/turbonzl/turbokeep`; `turbokeep-<version>-node.tar.gz`. |

## Repo layout
`apps/server` (API, formats, tests), `apps/web` (client), `docs/guides` (user, bundled into Settings > Guides), `docs/development` (internals), `.github/workflows`, `Dockerfile`, `docker-compose.yml`.

## What exists and is tested
- Server: 40 vitest tests (formats, API incl. auth/lockout/CSRF/conflicts, database versions, real Vikunja fixture). `pnpm test`, `pnpm typecheck`.
- **Vikunja export imported into a real Vikunja v0.24.6** (built from the Go module proxy) and a real Vikunja export imported here: see `docs/development/FORMATS.md`.
- Client driven end to end in Chromium (Playwright): setup, note autosave across reload, tasks, both imports, both exports, themes/layouts, phone width.
- Clean-copy production build (`pnpm install --frozen-lockfile && pnpm build`) run as the Docker image would run it.

## Not verified (say so, don't claim)
- The Docker image and the compose file were never RUN as containers (no Docker daemon in the session). The CI `docker` job builds the image and passed on GitHub on 2026-10-13, so the Dockerfile builds; start-up, the volume permissions and the health check are untested.
- Cloudflare Tunnel was never run against real Cloudflare; the guide follows Cloudflare's documented behaviour (verified by search, not by traffic).
- Standard Notes' own import of our JSON; Vikunja 1.x with `relations=all`.
- `release.yml` (first run pending); `check.yml`'s `ts` job failed once for `pnpm/action-setup` given both `version:` and `packageManager` (fixed: only `packageManager`).

## Hard-won gotchas
- Vikunja ≤0.24's file import is `PUT .../migration/vikunja-file/migrate`; its related-task lookup is per project (duplicates otherwise).
- **Compose reads `${VAR}` for every service, even one in an inactive profile**: `${TUNNEL_TOKEN:?...}` broke a plain `docker compose up` on the Pi (found by the owner, 2026-10-14). Use `${VAR:-}`; `deploy.test.ts` guards it.
- **A port published on `127.0.0.1` is invisible to every other machine.** The first compose file did that and the owner could not open his Pi from his PC (2026-10-14). Default is now `TURBOKEEP_BIND=0.0.0.0`; set `127.0.0.1` only once a tunnel works. `deploy.test.ts` guards it.
- **`git pull` + `docker compose up -d` does NOT update the image**: compose reuses the local `:latest`. An update is `docker compose pull && docker compose up -d` (the owner saw an old version number in the log after pulling the repo, 2026-10-14). The guides say so; the log line names the version, check it against the release.
- **Ports:** TurboKeep is 47901 on the host (8080 only inside the container); the engine's `docs/SERVER_APPS.md` lists every app's port, and two programs cannot share one.
- `pkill -f <pattern>` in a tool call kills the tool's own shell when the pattern is in its command line.
- Tunnels: trust `CF-Connecting-IP`, never the first `X-Forwarded-For` entry; check same-site with `Sec-Fetch-Site` first (Host may be rewritten).
- turbothemes is a git dependency on a subfolder; the lockfile records a codeload tarball URL, which CI and Docker can fetch without SSH (the engine repo is public).
- `pnpm/action-setup@v4` fails in 0 s if the workflow passes `version:` AND `package.json` has `packageManager`: use only `packageManager`.
- ghcr packages start private: make `turbokeep` public in GitHub Packages or `docker compose pull` is denied.
- Engine moved while this was built (cloudflare-access etc. arrived): re-read `CLAUDE.md` of the engine before starting.

## Session log
- 2026-10-14 (4): the start-up log only said `listening on 0.0.0.0:8080` (the container's own port) and the owner thought it was wrong; it now names the address to open (`TURBOKEEP_PUBLISHED` from compose, `openHint` in config.ts, tested). His version number lagged the release because `up -d` does not pull a newer image.
- 2026-10-14 (3): the Pi's port 47901 was unreachable from the owner's PC because compose published on 127.0.0.1; added `TURBOKEEP_BIND` (default 0.0.0.0), docs say how to lock it down after the tunnel works.
- 2026-10-14 (2): owner's Pi: `docker compose up` failed on the required TUNNEL_TOKEN even without the tunnel profile; fixed (`:-`), host port made configurable and moved to 47901; registry of ports added to the engine.
- 2026-10-14: re-pinned to engine `fca5507` (adds `logos`, `docker-self-host`, picker docs: the Appearance mock preview already follows them); logo generated (check-mark emblem); CI pnpm fix; first release.
- 2026-10-13: first build from the engine at `3787668`: server, formats, client, Docker/CI, guides; engine module `docker-self-host` created.
