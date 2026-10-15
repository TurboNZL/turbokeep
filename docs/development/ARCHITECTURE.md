# Architecture

```
apps/server   Hono on Node 22, SQLite through the built-in node:sqlite (no native modules), esbuild -> one file (dist/server.mjs)
  src/config.ts   environment -> Config
  src/db.ts       schema, versioned migrations (pragma user_version), tx() helper
  src/auth.ts     scrypt passwords, session/API-token storage (SHA-256), same-site check, login limiter, client IP
  src/store.ts    notes (one kind of thing: onList, dueDate, percentDone, position), tags with emoji and colour, moveNote (all queries; every one is scoped by user_id)
  src/formats/    Standard Notes + Vikunja readers and writers (pure)
  src/io.ts       import/export against the database (dry run = the transaction is rolled back)
  src/app.ts      routes, security headers (CSP), static client with SPA fallback, owner-only /api/admin/update
  src/update.ts   the in-app "Update server" (runs scripts/update.sh --live, then exits so systemd restarts)
  src/formats/turbokeep.ts  the TurboKeep bundle (one turbokeep.json in a zip)
apps/web      React 18, Vite, Tailwind with the turbothemes preset, zustand, react-router. Pages: Home (tag rail | composer + list | editor, or the Keep wall), Archive, Bin, Settings
apps/android Kotlin: WebView of the server's page, home-screen widget (RemoteViews), quick add / share, updater
```

## Decisions and why
- **node:sqlite, not better-sqlite3:** no native build, so the installer and the CI are trivial and arm64 needs no compiler. Cost: Node >= 22.13 and an "experimental" warning (silenced with `--disable-warning`). Vitest runs it fine.
- **Server is the source of truth, no offline mode:** a note editor autosaves (700 ms) and flushes when the tab is hidden; failures show "Offline: will retry" and retry every 5 s; a stale save returns 409 with the server's note (`base` = the `updatedAt` the editor last saw) and the editor offers keep mine / use theirs. A service worker and a local queue are the next step, not done.
- **Auth:** the first account needs a setup code printed in the log (a public tunnel must not be claimable by the first visitor). Cookie sessions are `HttpOnly; SameSite=Lax; Secure` when HTTPS was seen, and cookie writes need `Sec-Fetch-Site: same-origin` or a matching `Origin`. Bearer tokens skip that. Tokens and sessions are stored hashed.
- **Dates:** ISO strings in UTC in the database; a note has one optional due date. Finishing is archiving: there is no `done` column.
- **Ids:** notes are UUIDs (kept from Standard Notes so re-imports are idempotent). Vikunja's integer ids are never stored.
- **Order:** `notes.position` (a real number) is the hand-made order. A drop puts the note between its two neighbours (the middle of their positions; the server renumbers when the gap is below 1e-7). Only changes to the title, text or kind of text move `updated_at`, so pinning, finishing, filing and dragging can never make an open editor's save fail with a 409.
- **Search:** `LIKE` per word with `%`/`_` escaped. Fine for a personal server; FTS5 if it ever matters.
- **Client bundle is ~500 kB** (the theme catalogue is inside the engine). Not split; one request, cached forever.

## Tests
`pnpm test` runs both packages: server (formats, API through `app.request`, database migrations from v1 and v3 shaped files, a real Vikunja export fixture) and web (markdown safety, dates, filters, ordering, pairing codes, links). The browser flow was driven with Playwright + Chromium during development (not part of CI).

## Data model (schema v4: one kind of thing)
Everything is a **note**: `notes` has title, text, `pinned`, `archived` (= finished), `trashed`, `on_list` (it has a checkbox and shows on Home), `due_date`, `percent_done`, `position`. Tags are the way things are organised (`note_tags`; `tags` has an emoji and a colour). There are no tasks, projects, reminders, relations or comments. Migration 3 -> 4 (db.ts) moved the old task fields onto their notes, made a project a tag (nested ones `Work.Sub`), appended comments to the text and dropped the rest; `db.test.ts` runs it on files shaped like v1 and v3. `GET /api/notes?list=1` is the Home list.

## Client structure
- `lib/views.ts`: the filter (Tasks / All notes / No tag / a tag / a search), what belongs in each list (`matchesFilter`, so a change shows at once without asking the server), the orders, `positionBetween`. `lib/actions.ts`: `patchNote` (optimistic, put back on failure). `lib/useItemUi.tsx`: finish with its animation and Undo, the menu, the tag picker, the date window; Home, Archive and Bin share it.
- Drag and drop is `@dnd-kit`: the mouse drags from anywhere on a row, a finger only from the grip (so scrolling and long-press stay free), the keyboard from the grip with Space. A long press (480 ms, touch only) or a right click opens the menu.
- **Editor autosave** (`NoteEditor.tsx`) is set up once and never restarts on a re-render (callbacks go through refs); a burst of typing is saved at least every 4 s. `Dialog.tsx` takes the focus only when it opens (it used to do it on every re-render, which pulled the focus out of the text mid-typing when the editor was in a window).
- Pages slide in from the side they sit on in the navigation (`Layout.tsx`, `.tk-page-fwd/back`); the Settings chunk is fetched while Home is idle so no "Loading" frame shows between pages. `--dock-h` (set by the layout) keeps menus, toasts and the tag column above a bottom bar.
