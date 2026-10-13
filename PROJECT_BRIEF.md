# TurboKeep: project brief

The long-lived "why and what". `CLAUDE.md` is the running log; this file changes rarely.

## Goal and user
A self-hostable notes and tasks app for one person or a household, that is easy to put behind a **Cloudflare Tunnel**, and that never traps the data: it reads and writes **Standard Notes** (plaintext/decrypted export) and **Vikunja** (data export) so users can come from either, or leave to either. Built on the TurboNZL engine so it looks and releases like the other apps (themes, release flow, guides).

## Feature inventory
- Accounts (first-run setup code, optional sign-up, API tokens), per-user data.
- Notes: plain/Markdown, tags, pin/archive/trash, search, autosave with conflict detection.
- Tasks: projects (nested), labels, priority, dates, reminders (stored), repeats, relations, comments, smart views.
- Import/export: Standard Notes zip/JSON/plain files; Vikunja zip. Preview (dry run) before import.
- Themes, layouts, guides inside the app. Docker image + Node tarball per release.

## Rules that must not be broken
1. **Importers are idempotent where the source has ids** (Standard Notes uuids) and always transactional: a failed import changes nothing.
2. **Exports must stay readable by the real thing.** Any change to `apps/server/src/formats/vikunja.ts` is re-checked against a real Vikunja (see `docs/development/FORMATS.md`); do not "simplify" the relation handling without reading why it is there.
3. **Every query is scoped by `user_id`.** A new route without that is a bug.
4. **Nothing in the client may assume another origin:** relative URLs, same-origin cookies. That is what makes tunnels and reverse proxies work with no settings.
5. **The first account needs the setup code** (or env-created admin). Do not make an open first-run page.
6. **A database from a newer version is refused, never opened.** Schema changes go through `MIGRATIONS` in `db.ts`.
7. **Do not add a default that makes an existing install wrong.** New behaviour is an option or a new module (engine principle 3).

## Architecture
See `docs/development/ARCHITECTURE.md` (Hono + node:sqlite server, React/Vite client) and `docs/development/ENGINE.md` (which engine modules are used and why some are not).

## Roadmap (with done-criteria)
| Item | Done when |
|---|---|
| Offline editing (service worker + local queue) | a note typed with the server unreachable is saved on reconnect, conflicts still detected |
| Kanban view and Vikunja buckets/views import | a project can be shown as columns; the export carries `views`/`buckets` that a real Vikunja accepts |
| Reminders that notify (web push or email) | a reminder fires once, on time, on a phone |
| Attachments | stored on disk, exported in `files/<id>` of the Vikunja zip, imported from it |
| Standard Notes round trip proven on a live account | export imported in the real app, tags and dates verified |
| Run against Vikunja 1.x | `relations=all` import checked on a current release |
| Native clients (desktop/Android) | then take `updaters`, `cloudflare-access`, `device-pairing` from the engine |

## Glossary
- **Inbox:** each user's default project; tasks without a project go there.
- **Relation kinds:** Vikunja's (subtask, parenttask, related, blocked, ...); the inverse is always stored too.
- **Setup code:** printed by the server on first start; needed to create the first account.
