# TurboKeep

Self-hosted to-dos and notes in one small app, in your browser or on Android, on your server, behind a Cloudflare tunnel if you like. There is one kind of thing: you type something, it is on your list; tick it to finish it, or send it to tags to keep it. It imports and exports **Standard Notes** (decrypted backup zip, JSON or plain `.txt`/`.md` files), **Vikunja** (its data-export zip) and its own **TurboKeep** backup, so you can leave at any time.

## Features
- **Home:** open it and type; it is on your list. Tags on the left (with emoji and colour that tint the items), the open item beside it, an optional Google Keep wall of cards. Drag to reorder (mouse, touch or keyboard), tick to finish with an animation and Undo, right-click or hold for pin, archive, send to tags, copy link, download and bin.
- **Items:** a title and an optional description (plain text or Markdown), tags, a date, a progress slider, pin, archive (= finished), bin, search, autosave, and a warning (not an overwrite) when the same item was changed on another device. Items link to each other by pasting a copied link.
- **Import / export:** one window per app, each with its import and export: TurboKeep backup (everything), Standard Notes backup zip and plain text, Vikunja export zip. Preview before importing; importing the same backup twice changes nothing.
- **Android app** with a home-screen widget (your list in your own order, tap an item to complete it or save it to memory), quick add, share target and a pairing code (see `docs/guides/ANDROID.md`).
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
