# Import and export

Settings > **Import & export**, arranged by **app**, not by direction: **TurboKeep** is at the top (its export and import together); **Standard Notes** and **Vikunja** each open in their own window with their export and their import. Every import has a **Preview** that counts what would be added without writing anything; **Import** unlocks after a preview.

## TurboKeep
**Export:** *TurboKeep backup (.zip)* holds one file, `turbokeep.json`, with every item of your account: title and text, tags (and each tag's emoji and colour), whether it is on your list, its date and progress, your order, pins, and the archive and bin. It is the way to move to another TurboKeep server or to keep a backup you can read (plain JSON in a zip).
**Import:** pick that zip (or the `.json`), **Preview**, **Import**. Items already on the server (same id) are skipped, so importing the same backup twice changes nothing. A file made by a *newer* TurboKeep, or by something else, is refused with a message. Accounts, passwords and API tokens are never part of it.
**Older backups (format 1, from before items became one kind of thing)** are still read: a task goes on your list, *done* becomes archived, its project becomes a tag (a sub-project `Work.Sub`), its comments are added to the end of the text under *--- Comments ---*, and reminders, repeats, priority, start/end dates and task relations are dropped (the import says how many).

## Notes: Standard Notes
### Getting your notes out of Standard Notes
In the Standard Notes app: **Account > Data Backups > Download backup > Decrypted** (not the encrypted file: that one needs your keys and TurboKeep cannot read it; it says so). You get a zip containing `Standard Notes Backup and Import File.txt` (JSON, with tags, pins, archive and trash state, dates) and a folder `Items/Note/` with one `.txt` per note.

### Importing into TurboKeep
Open **Standard Notes** and choose that **zip**, the JSON file by itself, or any number of plain `.txt` / `.md` files. What comes across:

| | Zip or JSON | Plain text files |
|---|---|---|
| Title and text | yes | title from the file name (the `-1fa7d986` suffix Standard Notes adds is removed) |
| Tags | yes (nested tags such as `work.projects` stay as that name) | a folder name becomes a tag |
| Pinned, archived, trashed | yes | no |

Imported notes are filed under their tags and are **not on your task list** (there is no checkbox in Standard Notes); put one on the list from its menu.

| Created and modified dates | yes | no |
| Markdown notes | kept as Markdown | `.md` files are Markdown |
| "Super" notes | the words come across as plain text; formatting does not | n/a |
| Files, rich-text (HTML) notes | not handled | n/a |

Importing the same backup again does nothing: notes are recognised by their Standard Notes id (and plain files by identical title and text).

### Exporting from TurboKeep
- **Standard Notes backup (.zip):** the same layout Standard Notes writes: the JSON backup (`version 004`, notes and tags) plus every note as a `.txt` under `Items/Note/`. Import the JSON through Standard Notes' *Import Backup*; the text files can be imported as plain notes.
- **Plain text files only (.zip):** just the text files (Markdown notes as `.md`).
The layout and field names follow what the Standard Notes source writes and what third-party converters read; TurboKeep reads its own output back and reads a backup shaped like a real one. It has **not** been run against a live Standard Notes account, so if Standard Notes rejects a file, the plain text files in the same zip always work as a fallback (and please report it).

## Vikunja
### Out of Vikunja
Vikunja: **Settings > Export your data**, enter your password, wait for the email or the download link, and take the zip (it holds `data.json`, `filters.json`, `VERSION`). You can also pick `data.json` alone.

### Into TurboKeep
Open **Vikunja** and pick the zip. **Each task goes onto your list.** Kept: title, description, done (the task is archived), due date, percent done (progress), star (pinned), and the dates it was made and changed. Vikunja's **labels become tags**, and the **project** (with its parents, `Work.Sub`) becomes a tag too (its *Inbox* does not). **Comments** are added to the end of the text under *--- Comments ---*. **Not kept:** reminders, repeats, priority, start and end dates, related tasks (the import says how many tasks had them), and attachments, assignees, kanban buckets and views, saved filters, project backgrounds, sharing. Vikunja stores descriptions as HTML; they become plain text (paragraphs, line breaks, lists as `- `, links as `text (url)`).

Importing the same file twice makes the tasks twice (as it would in Vikunja itself); use the TurboKeep backup when you want a repeatable import.

### Out of TurboKeep, into Vikunja
Open **Vikunja** and export. Everything on your **list** becomes a task of one project called *TurboKeep* (finished ones as done, with the due date, progress and star), and your **tags become labels** with their colour. Notes that are not on your list are left out (Vikunja has only tasks): the page tells you how many. In Vikunja: **Settings > Import from other services > Vikunja file**. Descriptions become simple HTML paragraphs. The file has the same shape as before (one project of plain tasks, with empty reminders, relations and comments), which was checked by importing into a real Vikunja v0.24.6; this simplified version has not been run against a real Vikunja again, so please report it if Vikunja refuses it.

## What is never exported
Accounts, passwords and API tokens. Other people's data: an export contains only your account.
