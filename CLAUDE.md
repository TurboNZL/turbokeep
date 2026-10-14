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
| Shape | One web app + server (Node, SQLite in the data folder) installed as a native systemd service the engine's way (`scripts/install-pi.sh`, `update.sh`, owner-only Update server button). Docker was used first and REMOVED (2026-10-14, owner's request: follow the engine). Android app (WebView of the server's page + widget) in `apps/android`. |
| Server stack | Hono on Node 22, built-in `node:sqlite` (no native modules), esbuild to one file. |
| Client stack | React 18 + Vite + Tailwind (turbothemes preset) + zustand. |
| Engine "self-hosted-server" set | Taken: `server-install-update`, `updaters`; `cloudflare-access` only as the Android service token (see `.turboengine.json` `notes`). The engine's `docker-self-host` module came from this app's Docker phase; it is superseded here. |
| Data model | A task is a note with a task attached (schema v2, `tasks.note_id`); labels are tags. Home = notes+tasks in one list, tag rail on the left, views as nav buttons, open note kept across tabs, notes titled with their date, optional Google Keep wall (`settings.keepView`). |
| TurboKeep bundle | `turbokeep.json` in a zip (`format: turbokeep`, version 1), idempotent by note id. |
| Auth | Setup code for first account; sign-up closed unless `TURBOKEEP_ALLOW_SIGNUP`; scrypt; cookie sessions + `tk_` bearer tokens. |
| Standard Notes | Reads decrypted zip / JSON / plain .txt .md; writes the same zip layout. Encrypted backups refused with instructions. |
| Vikunja | Reads/writes the data-export zip. Cross-project relations OFF by default in export (old Vikunja duplicates tasks); `?relations=all` to keep. |
| Descriptions | Plain text in this app; HTML flattened on import, `<p>` wrapped on export. |
| Reminders | Stored and exported, NOT sent (no notification channel yet). |
| Port | 47901 (`TURBOKEEP_PORT`); never default to 8080 (the owner runs several servers per machine). |
| Versions / assets | `vYYYY.M.N`; asset `turbokeep-<version>-android.apk`. The server reports `git describe --tags`. |

## Repo layout
`apps/server` (API, formats, tests), `apps/web` (client), `docs/guides` (user, bundled into Settings > Guides), `docs/development` (internals), `apps/android`, `scripts` (installer, updater, logo), `.github/workflows`.

## What exists and is tested
- Server: 40 vitest tests (formats, API incl. auth/lockout/CSRF/conflicts, database versions, real Vikunja fixture). `pnpm test`, `pnpm typecheck`.
- **Vikunja export imported into a real Vikunja v0.24.6** (built from the Go module proxy) and a real Vikunja export imported here: see `docs/development/FORMATS.md`.
- Client driven end to end in Chromium (Playwright): setup, note autosave across reload, tasks, both imports, both exports, themes/layouts, phone width.
- Clean-copy production build (`pnpm install --frozen-lockfile && pnpm build`) run as the Docker image would run it.

## Not verified (say so, don't claim)
- The Android app was never run on a device or emulator, and CI is the only place it is compiled (no Android SDK in the sandbox; Google's maven is blocked there). Widget, quick add, share target, token hand-over, Downloads saving and the updater are untested until someone installs an APK.
- `install-pi.sh` was only run with `--dry-run` (no apt/systemd/root here). The update path WAS run for real (restart loop, local bare origin).
- Cloudflare Tunnel / Access never run against real Cloudflare (guides follow its docs). Standard Notes' own import of our JSON; Vikunja 1.x with `relations=all`.
- The v1 -> v2 migration is tested on a database shaped like v1 (db.test.ts), not on the owner's real data: back up before updating.

## Hard-won gotchas
- Vikunja ≤0.24's file import is `PUT .../migration/vikunja-file/migrate`; its related-task lookup is per project (duplicates otherwise).
- **Ports:** TurboKeep is 47901; the engine's `docs/PORTS.md` lists every app's port, and two programs cannot share one.
- `pkill -f` also kills the tool's own shell (it did again on 2026-10-14): kill by PID.
- A `curl -c jar` on a failed request overwrites the cookie jar (lost the session in a test).
- The sandbox cannot reach dl.google.com / maven.google.com: Android can only be compiled in CI (`android.yml` runs on every non-main push).
- `pkill -f <pattern>` in a tool call kills the tool's own shell when the pattern is in its command line.
- Tunnels: trust `CF-Connecting-IP`, never the first `X-Forwarded-For` entry; check same-site with `Sec-Fetch-Site` first (Host may be rewritten).
- turbothemes is a git dependency on a subfolder; the lockfile records a codeload tarball URL, which CI and Docker can fetch without SSH (the engine repo is public).
- `pnpm/action-setup@v4` fails in 0 s if the workflow passes `version:` AND `package.json` has `packageManager`: use only `packageManager`.
- Engine moved while this was built (cloudflare-access etc. arrived): re-read `CLAUDE.md` of the engine before starting.

## Session log
- 2026-10-14 (5): big rework on one branch: schema v2 (tasks are notes, labels are tags, migration), TurboKeep bundle import/export, Home tab (tag rail, merged Inbox, view buttons in nav, open note kept across tabs, date titles, Keep wall, engine Select dropdowns, wider content), Docker removed for the engine's native install/update (update path run for real), Android app with widget (CI-built only). Engine improvements to port back: `docs/guides/ANDROID.md` pattern (server-page WebView + widget), `TurboKeepBridge.saveFile` (blob downloads in WebView), `Select.tsx` use, `android.yml` branch build.
- 2026-10-14 (4): the start-up log only said `listening on 0.0.0.0:8080` (the container's own port) and the owner thought it was wrong; it now names the address to open (`TURBOKEEP_PUBLISHED` from compose, `openHint` in config.ts, tested). His version number lagged the release because `up -d` does not pull a newer image.
- 2026-10-14 (3): the Pi's port 47901 was unreachable from the owner's PC because compose published on 127.0.0.1; added `TURBOKEEP_BIND` (default 0.0.0.0), docs say how to lock it down after the tunnel works.
- 2026-10-14 (2): owner's Pi: `docker compose up` failed on the required TUNNEL_TOKEN even without the tunnel profile; fixed (`:-`), host port made configurable and moved to 47901; registry of ports added to the engine.
- 2026-10-14: re-pinned to engine `fca5507` (adds `logos`, `docker-self-host`, picker docs: the Appearance mock preview already follows them); logo generated (check-mark emblem); CI pnpm fix; first release.
- 2026-10-13: first build from the engine at `3787668`: server, formats, client, Docker/CI, guides; engine module `docker-self-host` created.
