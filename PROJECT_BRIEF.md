# TurboKeep: project brief

The long-lived "why and what". `CLAUDE.md` is the running log; this file changes rarely.

## Goal and user
A self-hostable to-do and notes app (one kind of thing) for one person or a household, that is easy to put behind a **Cloudflare Tunnel**, and that never traps the data: it reads and writes **Standard Notes** (plaintext/decrypted export), **Vikunja** (data export) and its own **TurboKeep** bundle (notes and tasks together) so users can come from either, or leave to either. Built on the TurboNZL engine so it looks and releases like the other apps (themes, release flow, guides).

## Feature inventory
- Accounts (first-run setup code, optional sign-up, API tokens), per-user data.
- Items (schema v4): a title and a description (plain/Markdown), tags (emoji, colour), a due date, progress, pin, archive (= finished), bin, search, autosave with conflict detection, hand-made order (drag, touch too), links between items by pasted link. Everything typed on Home goes on the list; "send to tags" files it instead.
- Import/export: TurboKeep bundle; Standard Notes zip/JSON/plain files; Vikunja zip. Preview (dry run) before import.
- Themes, layouts, Keep view, guides inside the app. Native systemd install (`scripts/install-pi.sh`), in-app server update, Android app with a widget attached to every release.

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
| Due-date notifications (web push or email) | an item with a date tells you once, on time, on a phone |
| Attachments | stored on disk, exported in `files/<id>` of the Vikunja zip, imported from it |
| Standard Notes round trip proven on a live account | export imported in the real app, tags and dates verified |
| Run against Vikunja 1.x | `relations=all` import checked on a current release |
| Android app proven on a device | installed from a release, signed in, widget ticks a task, share target saves a note |
| Desktop client | then take `updaters` etc. from the engine |

## Glossary
- **On the list:** an item with a checkbox, shown on Home. **Finished** = archived. **Send to tags** = off the list, found by its tags.
- **Position:** the hand-made order (a real number; a drop takes the middle of its neighbours).
- **Setup code:** printed by the server on first start; needed to create the first account.
