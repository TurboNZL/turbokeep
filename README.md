# TurboKeep

Self-hosted notes and tasks in one small app: a Standard Notes style note list and a Vikunja style task manager, in your browser, on your server, behind a Cloudflare tunnel if you like. It imports and exports **Standard Notes** (decrypted backup zip, JSON or plain `.txt`/`.md` files) and **Vikunja** (its data-export zip), so you can leave at any time.

## Features
- **Notes:** plain text or Markdown, tags, pin, archive, trash, search, autosave, and a warning (not an overwrite) when the same note was changed on another device.
- **Tasks:** projects and sub-projects, a Today / Next 7 days / Overdue / Starred view, labels, priorities, due, start and end dates, reminders (stored, not sent), repeating tasks, task relations (subtask, blocked by, ...) and comments.
- **Import / export:** Standard Notes backup zip and plain text; Vikunja export zip. Preview before importing; importing the same Standard Notes backup twice changes nothing.
- **Self-hosting:** one container, one port, one volume (SQLite). No external services. Works behind a **Cloudflare Tunnel**, a reverse proxy, or on a LAN. Accounts are private; sign-up is closed after the first one.
- **Looks:** the TurboNZL theme engine: 67 colour themes, 33 UI styles, four layouts, all in Settings > Appearance. Works on phones and can be added to the home screen.

## Run it
```
git clone https://github.com/TurboNZL/turbokeep && cd turbokeep
docker compose up -d
docker compose logs turbokeep      # prints the setup code for the first account
```
Open <http://localhost:47901>, create the first account with that setup code, done. Behind a Cloudflare tunnel, with updates, backups and every setting: see `docs/guides/` (also in the app under Settings > Guides).

## Develop
```
pnpm install
pnpm dev:server        # API on :47901 (needs Node 22.13+)
pnpm dev:web           # client on :5173, proxies /api to :47901
pnpm test && pnpm typecheck
```
Layout: `apps/server` (Hono + the built-in `node:sqlite`, no native modules), `apps/web` (React, Vite, Tailwind), `docs/guides` (user guides, bundled into the app), `docs/development` (internals).

## Releases and updates
Every merge to `main` becomes a release (`vYYYY.M.N`): a multi-arch Docker image on `ghcr.io/turbonzl/turbokeep` and a Node tarball. Update with `docker compose pull && docker compose up -d`.

## Engine
Built on [TurboNZL/turboengine](https://github.com/TurboNZL/turboengine) (`.turboengine.json` says which commit and modules).

## License
MIT, see `LICENSE`.
