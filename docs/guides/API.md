# API and tokens

TurboKeep's web page uses a JSON API; you can use it from scripts. Everything is under `/api`, at the same address as the page. **A task is a note with a task attached** (`note.task` is `null` for a plain note): `/api/notes` lists both, `/api/tasks` is the same data seen from the task side (creating a task creates its note, deleting it deletes the note). Labels no longer exist: they are the note's tags.

## Signing in
- **API token (for scripts):** Settings > Account > API tokens > create. Send `Authorization: Bearer tk_...`. A token can do everything its owner can, does not expire and is revoked in the same list. It is shown once.
- **Session cookie (the web page):** `POST /api/auth/login` with `{"username","password"}`. Writes made with a cookie must come from the same site; bearer tokens are not subject to that.

```
curl -H "Authorization: Bearer $TOKEN" https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"From a script","text":"hello","tags":["inbox"]}' https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"Buy milk","dueDate":"2030-01-01T09:00:00Z","tags":["home"]}' https://keep.example.com/api/tasks
```
Errors are `{"error": "..."}` with a status code (400, 401, 403, 404, 409, 413, 429).

## Endpoints
| | |
|---|---|
| `GET /api/health`, `GET /api/setup` | no sign-in needed: liveness, version, whether the first account is still to be made |
| `GET /api/notes?view=notes\|archived\|trashed\|all&kind=all\|tasks\|notes&tag=&q=&done=true\|false&due=today\|overdue\|week\|none\|any&favorites=1&project=&excerpt=1` | list (pinned first, newest change first). `excerpt=1` cuts each text to 400 characters (the web page uses it for speed). `tag=work` also finds `work.sub`. Each note has `task: null` or the short task (`id, projectId, done, dueDate, priority, ...`) |
| `POST /api/notes` | `{title, text, noteType: "plain-text"\|"markdown", tags[], pinned, archived, trashed}` |
| `GET\|PATCH\|DELETE /api/notes/:id` | `GET` returns the note with its full task (comments, relations, reminders). `PATCH` takes any of the fields above. Add `"base": <updatedAt you read>` to get a `409` (with the current note) instead of overwriting a newer edit. `DELETE` is permanent. `POST /api/notes/empty-trash` |
| `PUT\|PATCH\|DELETE /api/notes/:id/task` | make the note a task (`PUT`, optional task fields), change the task, or take the task off (`DELETE`: the note stays). Task fields: `{done, projectId, dueDate, startDate, endDate, priority 0-5, percentDone 0-1, isFavorite, reminders[{reminder} or {relativeTo: "due_date", relativePeriod: -3600}], repeatAfter (seconds), repeatMode 0 from due date \| 1 monthly \| 2 from completion}` |
| `GET /api/tags`, `PATCH /api/tags`, `DELETE /api/tags?title=` | each tag has `title, emoji, color, count`. `PATCH {from, to}` renames (onto an existing tag merges them); `PATCH {title, emoji, color}` sets the look (`color` is six hex digits, `''` clears). A tag with a look stays when its last note goes |
| `GET /api/tasks?project=&tag=&done=true\|false&due=today\|overdue\|week\|none\|any&favorites=1&q=` | list of tasks |
| `POST /api/tasks` | `{title, noteId (to attach to an existing note), text, tags[], projectId (Inbox if omitted), ...task fields}` creates the note and its task |
| `GET\|PATCH\|DELETE /api/tasks/:id` | the full task (with comments and relations); `PATCH` may also change the note's `title`, `text` and `tags`. Ticking `done` on a repeating task keeps it open and moves its dates. `DELETE` removes the note too |
| `POST /api/tasks/:id/relations {otherId, kind}`, `DELETE /api/tasks/:id/relations/:otherId/:kind` | kinds: subtask, parenttask, related, duplicateof, duplicates, blocking, blocked, precedes, follows, copiedfrom, copiedto. The opposite direction is added for you |
| `POST /api/tasks/:id/comments {comment}`, `DELETE .../comments/:commentId` | |
| `GET\|POST /api/projects`, `PATCH\|DELETE /api/projects/:id` | `{title, description, hexColor, parentId, isArchived, isFavorite}`; the Inbox cannot be deleted or moved; deleting a project deletes its tasks (and their notes) and moves its sub-projects up |
| `GET /api/export/turbokeep`, `GET /api/export/standardnotes[?plain=1]`, `GET /api/export/vikunja[?relations=all]` | the zips |
| `POST /api/import/turbokeep[?dry=1]`, `POST /api/import/standardnotes[?dry=1]`, `POST /api/import/vikunja[?dry=1]` | multipart form, field `file` (several allowed for Standard Notes). `dry=1` counts without writing |
| `POST /api/auth/password`, `GET\|POST /api/tokens`, `DELETE /api/tokens/:id` | |
| `GET /api/admin/update`, `POST /api/admin/update` | owner only: whether the server can update itself, and start that |

Dates are ISO 8601 in UTC; colours are six hex digits without `#`.
