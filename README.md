# TurboKeep

Self-hosted notes and tasks in one small app, in your browser or on Android, on your server, behind a Cloudflare tunnel if you like. A task is a note with a checkbox, so one list holds both. It imports and exports **Standard Notes** (decrypted backup zip, JSON or plain `.txt`/`.md` files), **Vikunja** (its data-export zip) and its own **TurboKeep** backup (notes and tasks together), so you can leave at any time.

## Features
- **Home:** notes and tasks in one list with tags on the left, a view per button (Inbox, Today, Tasks, Notes, Next 7 days, Overdue, Starred, Archive, Trash), the open note beside it, and an optional Google Keep wall of cards. New notes are titled with the date.
- **Notes:** plain text or Markdown, tags, pin, archive, trash, search, autosave, and a warning (not an overwrite) when the same note was changed on another device.
- **Tasks:** any note can be one: lists and sub-lists, priorities, due, start and end dates, reminders (stored, not sent), repeating tasks, task relations (subtask, blocked by, ...) and comments.
- **Import / export:** TurboKeep backup (everything), Standard Notes backup zip and plain text, Vikunja export zip. Preview before importing; importing the same backup twice changes nothing.
- **Android app** with a home-screen widget (see `docs/guides/ANDROID.md`).
- **Self-hosting:** one Node program, one port (47901), one data folder (SQLite), installed as a systemd service by one command. No external services. Works behind a **Cloudflare Tunnel**, a reverse proxy, or on a LAN. Accounts are private; sign-up is closed after the first one.
- **Looks:** the TurboNZL theme engine: 67 colour themes, 33 UI styles, four layouts, all in Settings > Appearance.

## Run it
On a Raspberry Pi or any Debian / Ubuntu machine:
```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbokeep/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /mnt/yourdrive/turbokeep
```
It prints the address and a setup code for the first account. Behind a Cloudflare tunnel, updates, backups and every setting: see `docs/guides/` (also in the app under Settings > Guides).

## Develop
```
pnpm install
pnpm dev:server        # API on :47901 (needs Node 22.13+)
pnpm dev:web           # client on :5173, proxies /api to :47901
pnpm test && pnpm typecheck
```
Layout: `apps/server` (Hono + the built-in `node:sqlite`, no native modules), `apps/web` (React, Vite, Tailwind), `docs/guides` (user guides, bundled into the app), `docs/development` (internals).

## Releases and updates
Every merge to `main` becomes a release (`vYYYY.M.N`) with the Android app attached. The server updates from `main` with the owner's **Update server** button (Settings > This app) or `scripts/update.sh`.

## Engine
Built on [TurboNZL/turboengine](https://github.com/TurboNZL/turboengine) (`.turboengine.json` says which commit and modules).

## License
MIT, see `LICENSE`.
