# API and tokens

TurboKeep's web page uses a JSON API; you can use it from scripts. Everything is under `/api`, at the same address as the page.

## Signing in
- **API token (for scripts):** Settings > Account > API tokens > create. Send `Authorization: Bearer tk_...`. A token can do everything its owner can, does not expire and is revoked in the same list. It is shown once.
- **Session cookie (the web page):** `POST /api/auth/login` with `{"username","password"}`. Writes made with a cookie must come from the same site; bearer tokens are not subject to that.

```
curl -H "Authorization: Bearer $TOKEN" https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"From a script","text":"hello","tags":["inbox"]}' https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"Buy milk","dueDate":"2030-01-01T09:00:00Z","labels":["home"]}' https://keep.example.com/api/tasks
```
Errors are `{"error": "..."}` with a status code (400, 401, 403, 404, 409, 413, 429).

## Endpoints
| | |
|---|---|
| `GET /api/health`, `GET /api/setup` | no sign-in needed: liveness, version, whether the first account is still to be made |
| `GET /api/notes?view=notes\|archived\|trashed\|all&tag=&q=` | list (pinned first, newest change first). `tag=work` also finds `work.sub` |
| `POST /api/notes` | `{title, text, noteType: "plain-text"\|"markdown", tags[], pinned, archived, trashed}` |
| `GET\|PATCH\|DELETE /api/notes/:id` | `PATCH` takes any of those fields. Add `"base": <updatedAt you read>` to get a `409` (with the current note) instead of overwriting a newer edit. `DELETE` is permanent. `POST /api/notes/empty-trash` |
| `GET /api/tags`, `PATCH /api/tags {from,to}`, `DELETE /api/tags?title=` | renaming onto an existing tag merges them |
| `GET /api/tasks?project=&label=&done=true\|false&due=today\|overdue\|week\|none\|any&favorites=1&q=` | list |
| `POST /api/tasks` | `{title, projectId (Inbox if omitted), description, done, dueDate, startDate, endDate, priority 0-5, percentDone 0-1, isFavorite, labels[] (titles), reminders[{reminder} or {relativeTo: "due_date", relativePeriod: -3600}], repeatAfter (seconds), repeatMode 0 from due date \| 1 monthly \| 2 from completion}` |
| `GET\|PATCH\|DELETE /api/tasks/:id` | the full task (with comments and relations). Ticking `done` on a repeating task keeps it open and moves its dates |
| `POST /api/tasks/:id/relations {otherId, kind}`, `DELETE /api/tasks/:id/relations/:otherId/:kind` | kinds: subtask, parenttask, related, duplicateof, duplicates, blocking, blocked, precedes, follows, copiedfrom, copiedto. The opposite direction is added for you |
| `POST /api/tasks/:id/comments {comment}`, `DELETE .../comments/:commentId` | |
| `GET\|POST /api/projects`, `PATCH\|DELETE /api/projects/:id` | `{title, description, hexColor, parentId, isArchived, isFavorite}`; the Inbox cannot be deleted or moved; deleting a project deletes its tasks and moves its sub-projects up |
| `GET /api/labels`, `PATCH\|DELETE /api/labels/:id` | |
| `GET /api/export/standardnotes[?plain=1]`, `GET /api/export/vikunja[?relations=all]` | the zips |
| `POST /api/import/standardnotes[?dry=1]`, `POST /api/import/vikunja[?dry=1]` | multipart form, field `file` (several allowed for Standard Notes). `dry=1` counts without writing |
| `POST /api/auth/password`, `GET\|POST /api/tokens`, `DELETE /api/tokens/:id` | |

Dates are ISO 8601 in UTC; colours are six hex digits without `#`.
