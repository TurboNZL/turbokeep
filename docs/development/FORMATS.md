# Import and export formats: what was checked, and how

The code is `apps/server/src/formats/` (pure functions: bytes in, neutral objects out, and back) and `apps/server/src/io.ts` (database side). Tests: `formats.test.ts`, `api.test.ts`.

## Vikunja (verified against a real server)
Source of truth: `go-vikunja/vikunja` `pkg/modules/migration/vikunja-file/vikunja.go` and `create_from_structure.go`, `pkg/models/{tasks,project,label,task_reminder,task_comments}.go`.
- Zip: `VERSION` (required, must parse as a version >= `0.20.1+61`, or equal `dev` on a dev build), `data.json` (required), `filters.json` (optional), `files/<id>` blobs. Import endpoint is **`PUT /api/v1/migration/vikunja-file/migrate`** (multipart field `import`), not POST.
- `data.json`: array of projects, flat, children point at the parent with `parent_project_id` (the importer also accepts nested `child_projects`; the pseudo project `id -1` is skipped). Times are Go RFC 3339; an unset time is `0001-01-01T00:00:00Z`.
- **Verified by running it:** Vikunja v0.24.6 (built from the Go module proxy: `go build` of `code.vikunja.io/api@v0.24.6` with an empty `frontend/dist`) imported our file ("Everything was migrated successfully") with projects, parent, colours, tasks, labels, reminders (absolute and relative), relations and comments intact; and a data export made by that server imports into TurboKeep (`apps/server/test/fixtures/vikunja-0.24.6-export.zip`, used by a test).
- **The relation bug** (found by that run): 0.24 resolves `related_tasks` only against tasks already created *in the same project* (`tasksByOldID` is per project in `create_from_structure.go`); any other task named there is created anew and the real one is created again later. Hence the export writes each pair once (later task to earlier task, Vikunja adds the inverse) and only inside a project, unless `?relations=all`. Newer Vikunja (main) resolves by id globally (`canonicalByOldID`), so `relations=all` is right there. Not run against a 1.x server (no binary reachable from the sandbox).
- Descriptions and comments are HTML in Vikunja: `htmlToText` / `textToHtml` in `vikunja.ts`.
- Not carried: attachments (counted and reported), assignees, views and buckets (an empty `views` makes Vikunja build the defaults), saved filters.

## Standard Notes (checked against source and converters, not a live account)
Source: `standardnotes/app` `packages/ui-services/src/Archive/ArchiveManager.ts` (decrypted zip: `Standard Notes Backup and Import File.txt` = JSON of `{version, items}` + `Items/<content_type>/<title>-<first 8 of uuid>.txt`), plus the field layout read by `hozza/standardnotes-to-markdown-yaml-export` (`content.pinned|archived|trashed`, `appData['org.standardnotes.sn'].client_updated_at`, Tag items with `references`) and `BrunoBernardino/standardnotes-folder-export-cli`. Encrypted backups have `content` as a `004:...` string and are refused with instructions. Super notes (`noteType: "super"`, Lexical JSON) are flattened to text.
- Not verified: Standard Notes' own *import* of our JSON (no way to run the app here). The per-note `.txt` files are the fallback.


## Changes with "one kind of thing" (schema v4)
- **TurboKeep bundle** is format version 2: notes carry `onList, dueDate, percentDone, position`; no projects or relations. Version 1 files are still read (`parseTurboKeep`): a task goes on the list, done becomes archived, the project path becomes a tag, comments are appended to the text, the rest is dropped and counted in a warning. Tested in `api.test.ts` ("still reads a version 1 backup").
- **Vikunja export** is now one project, "TurboKeep", holding everything on the list (done = archived), tags as labels with their colour; reminders, repeats, priority, start/end, relations and comments are written empty. The relation handling described above no longer exists because there are no relations to write: if relations ever come back, read the bug above first. **Not re-run against a real Vikunja after this simplification**: the shape is a subset of what 0.24.6 accepted before, but that is an argument, not a run. `?relations=all` is gone.
- **Vikunja import** makes every task a list item: project path and labels become tags (the Inbox does not), comments are appended to the text, the rest is dropped and counted in a warning. The report is `{notes, tags, warnings}`.
