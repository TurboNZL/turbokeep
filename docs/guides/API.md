# API and tokens

TurboKeep's web page uses a JSON API; you can use it from scripts. Everything is under `/api`, at the same address as the page. **Everything is one kind of thing, a note.** A note is *on the list* (`onList`: it has a checkbox and shows on Home) or filed under tags; *finishing* it is archiving it (`archived`). There are no tasks, projects, comments, relations or reminders: `/api/tasks` and `/api/projects` are gone (they answer 404).

## Signing in
- **API token (for scripts):** Settings > Account > API tokens > create. Send `Authorization: Bearer tk_...`. A token can do everything its owner can, does not expire and is revoked in the same list. It is shown once.
- **Session cookie (the web page):** `POST /api/auth/login` with `{"username","password"}`. Writes made with a cookie must come from the same site; bearer tokens are not subject to that.

```
curl -H "Authorization: Bearer $TOKEN" https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"From a script","text":"hello","tags":["inbox"]}' https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"title":"Buy milk","onList":true,"dueDate":"2030-01-01T09:00:00Z"}' https://keep.example.com/api/notes
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -X PATCH \
     -d '{"archived":true}' https://keep.example.com/api/notes/$ID      # finish it
```
Errors are `{"error": "..."}` with a status code (400, 401, 403, 404, 409, 413, 429).

## Endpoints
| | |
|---|---|
| `GET /api/health`, `GET /api/setup` | no sign-in needed: liveness, version, whether the first account is still to be made |
| `GET /api/notes?view=notes\|archived\|trashed\|kept\|all&list=1\|0&tag=&untagged=1&q=&due=today\|overdue\|week\|none\|any&excerpt=1` | list, in the owner's own order (pinned first, then the dragged position, then the latest edit; the archive in the same order; the bin by latest change). `view=notes` (the default) is live items, `archived` is finished or put away, `kept` is both live and archived (what a search looks through). `list=1` is only what is on the Home list, `list=0` only what is not. `tag=work` also finds `work.sub`. `excerpt=1` cuts each text to 400 characters (the web page uses it for speed) |
| `POST /api/notes` | `{title, text, noteType: "plain-text"\|"markdown", tags[], onList, dueDate, percentDone 0-1, pinned, archived, trashed}`. A new item goes to the top of the order |
| `GET\|PATCH\|DELETE /api/notes/:id` | `PATCH` takes any of the fields above. Add `"base": <updatedAt you read>` to get a `409` (with the current note) instead of overwriting a newer edit of the **title or text**; only those move `updatedAt` (pinning, finishing, tagging and moving never do, so they cannot clash with someone typing). `DELETE` is permanent. `POST /api/notes/empty-trash` |
| `POST /api/notes/:id/move {above, below}` | drag and drop: the ids of the items that should end up directly above and below it (either may be omitted at the ends). The server puts it between them and renumbers when the gap gets too small |
| `GET /api/tags`, `PATCH /api/tags`, `DELETE /api/tags?title=` | each tag has `title, emoji, color, count` (`?tasks=1` also counts the tasks that carry it; an imported emoji is `:<12 hex>:`) (live items sent to tags, i.e. not on the list; `?view=archived` counts the archived ones). `PATCH {from, to}` renames (onto an existing tag merges them); `PATCH {title, emoji, color}` sets the look (`color` is six hex digits, `''` clears). A tag with a look stays when its last note goes |
| `GET /api/export/turbokeep`, `GET /api/export/standardnotes[?plain=1]`, `GET /api/export/vikunja` | the zips |
| `POST /api/import/turbokeep[?dry=1]`, `POST /api/import/standardnotes[?dry=1]`, `POST /api/import/vikunja[?dry=1]` | multipart form, field `file` (several allowed for Standard Notes). `dry=1` counts without writing |
| `POST /api/auth/password`, `GET\|POST /api/tokens`, `DELETE /api/tokens/:id` | |
| `GET /api/admin/update`, `POST /api/admin/update` | owner only: whether the server can update itself, and start that |

Dates are ISO 8601 in UTC; colours are six hex digits without `#`.

## Imported emoji and a few more details
`GET /api/emoji` lists yours, `POST /api/emoji {name, data}` adds one (`data` is a base64 PNG or WebP, at most 120 kB: the web page shrinks any picture to 96 × 96 first), `GET /api/emoji/<id>` serves it with a year-long cache header, `DELETE /api/emoji/<id>` removes it (tags using it lose it). A tag uses one by setting its emoji to `:<id>:`. A note has `autoTitle: true` when its title is only the date the app put there; typing a title of your own (a PATCH with a new `title`) clears it. The search `q` understands `tag:`, `-tag:`, `exclude:`/`excludes:`/`not:`, `include:`, `before:`, `after:`, `is:`, `has:` and `"phrases"`.
