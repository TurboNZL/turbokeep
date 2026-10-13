# Architecture

```
apps/server   Hono on Node 22, SQLite through the built-in node:sqlite (no native modules), esbuild -> one file (dist/server.mjs)
  src/config.ts   environment -> Config
  src/db.ts       schema, versioned migrations (pragma user_version), tx() helper
  src/auth.ts     scrypt passwords, session/API-token storage (SHA-256), same-site check, login limiter, client IP
  src/store.ts    notes, tags, projects, labels, tasks, relations, comments (all queries; every one is scoped by user_id)
  src/formats/    Standard Notes + Vikunja readers and writers (pure)
  src/io.ts       import/export against the database (dry run = the transaction is rolled back)
  src/app.ts      routes, security headers (CSP), static client with SPA fallback
apps/web      React 18, Vite, Tailwind with the turbothemes preset, zustand, react-router
```

## Decisions and why
- **node:sqlite, not better-sqlite3:** no native build, so the Docker image and the CI are trivial and arm64 needs no compiler. Cost: Node >= 22.13 and an "experimental" warning (silenced with `--disable-warning`). Vitest runs it fine.
- **Server is the source of truth, no offline mode:** a note editor autosaves (700 ms) and flushes when the tab is hidden; failures show "Offline: will retry" and retry every 5 s; a stale save returns 409 with the server's note (`base` = the `updatedAt` the editor last saw) and the editor offers keep mine / use theirs. A service worker and a local queue are the next step, not done.
- **Auth:** the first account needs a setup code printed in the log (a public tunnel must not be claimable by the first visitor). Cookie sessions are `HttpOnly; SameSite=Lax; Secure` when HTTPS was seen, and cookie writes need `Sec-Fetch-Site: same-origin` or a matching `Origin`. Bearer tokens skip that. Tokens and sessions are stored hashed.
- **Dates:** ISO strings in UTC in the database. `done_at` is set when ticked. Repeating tasks follow Vikunja's modes (`nextDates` in `store.ts`).
- **Ids:** notes are UUIDs (kept from Standard Notes so re-imports are idempotent), tasks and projects are integers (Vikunja's ids are never reused; the importer maps old to new).
- **Search:** `LIKE` per word with `%`/`_` escaped. Fine for a personal server; FTS5 if it ever matters.
- **Client bundle is ~500 kB** (the theme catalogue is inside the engine). Not split; one request, cached forever.

## Tests
`pnpm test` runs both packages: server (formats, API through `app.request`, database, a real Vikunja export fixture) and web (markdown safety, dates). The browser flow was driven with Playwright + Chromium during development (not part of CI).
