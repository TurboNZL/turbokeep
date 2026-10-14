# Import and export

Settings > **Import & export**. Every import has a **Preview** that counts what would be added without writing anything; **Import** unlocks after a preview.

## Everything: TurboKeep
**Export:** *TurboKeep backup (.zip)* holds one file, `turbokeep.json`, with every note and task of your account together: text, tags, pins, archive and trash, dates, and for tasks the list, priority, dates, reminders, repeat, comments and relations. It is the way to move to another TurboKeep server or to keep a backup you can read (it is plain JSON in a zip).
**Import:** pick that zip (or the `.json`), **Preview**, **Import**. Notes already on the server (same id) are skipped, so importing the same backup twice changes nothing; lists are matched by name. A file made by a *newer* TurboKeep, or by something else, is refused with a message. Accounts, passwords and API tokens are never part of it.

## Notes: Standard Notes
### Getting your notes out of Standard Notes
In the Standard Notes app: **Account > Data Backups > Download backup > Decrypted** (not the encrypted file: that one needs your keys and TurboKeep cannot read it; it says so). You get a zip containing `Standard Notes Backup and Import File.txt` (JSON, with tags, pins, archive and trash state, dates) and a folder `Items/Note/` with one `.txt` per note.

### Importing into TurboKeep
Choose that **zip**, the JSON file by itself, or any number of plain `.txt` / `.md` files. What comes across:

| | Zip or JSON | Plain text files |
|---|---|---|
| Title and text | yes | title from the file name (the `-1fa7d986` suffix Standard Notes adds is removed) |
| Tags | yes (nested tags such as `work.projects` stay as that name) | a folder name becomes a tag |
| Pinned, archived, trashed | yes | no |
| Created and modified dates | yes | no |
| Markdown notes | kept as Markdown | `.md` files are Markdown |
| "Super" notes | the words come across as plain text; formatting does not | n/a |
| Files, rich-text (HTML) notes | not handled | n/a |

Importing the same backup again does nothing: notes are recognised by their Standard Notes id (and plain files by identical title and text).

### Exporting from TurboKeep
- **Standard Notes backup (.zip):** the same layout Standard Notes writes: the JSON backup (`version 004`, notes and tags) plus every note as a `.txt` under `Items/Note/`. Import the JSON through Standard Notes' *Import Backup*; the text files can be imported as plain notes.
- **Plain text files only (.zip):** just the text files (Markdown notes as `.md`).
The layout and field names follow what the Standard Notes source writes and what third-party converters read; TurboKeep reads its own output back and reads a backup shaped like a real one. It has **not** been run against a live Standard Notes account, so if Standard Notes rejects a file, the plain text files in the same zip always work as a fallback (and please report it).

## Tasks: Vikunja
### Out of Vikunja
Vikunja: **Settings > Export your data**, enter your password, wait for the email or the download link, and take the zip (it holds `data.json`, `filters.json`, `VERSION`). You can also pick `data.json` alone.

### Into TurboKeep
Projects (with their parents) and tasks (title, description, done and when, due, start and end date, priority, percent done, colour, star, repeat): **each task becomes a note that is a task** (the title is the note's title, the description its text), and Vikunja's labels become **tags**. Reminders (absolute and relative), task relations and comments come across too. Not carried over: **attachments, assignees, kanban buckets and views, saved filters, project backgrounds, sharing**. The import says how many attachments were left out. Vikunja stores descriptions and comments as HTML; they become plain text (paragraphs, line breaks, lists as `- `, links as `text (url)`).

Vikunja's *Inbox* project is merged into yours instead of making a second one. Importing the same file twice makes the tasks twice (as it would in Vikunja itself); use the TurboKeep backup when you want a repeatable import.

### Out of TurboKeep, into Vikunja
Export **Vikunja export (.zip)**, then in Vikunja: **Settings > Import from other services > Vikunja file**. Tasks arrive with projects, labels (from the note's tags), reminders, repeats, relations and comments; descriptions become simple HTML paragraphs. This was checked by importing the file into a real Vikunja server (v0.24.6) and reading a real Vikunja export back into TurboKeep.

**Relations between different projects are left out by default.** Vikunja 0.24 and older reads a project's tasks one at a time and, when a task names a related task it has not created *in that project* yet, creates it as a new task, so you would get duplicates (this affects Vikunja's own exports too). TurboKeep therefore exports relations only inside a project, and says how many it left out. Tick *Keep relations between tasks in different projects* if your Vikunja is newer and fixes this (Vikunja's current source resolves them by id); if tasks appear twice, import the default file instead. Each relation pair is written once (from the later task to the earlier one); Vikunja adds the other direction itself.

## What is never exported
Accounts, passwords and API tokens. Other people's data: an export contains only your account.
