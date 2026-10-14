# Getting started

TurboKeep keeps your **notes** and your **tasks** on a server you control. You use it from any browser, including on a phone.

## 1. Start the server
On a Raspberry Pi or any Debian / Ubuntu machine, one command installs it as a service and prints the address and a **setup code** (see [SELF_HOSTING.md](SELF_HOSTING.md) for the command, the data folder and the settings):

```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbokeep/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /mnt/yourdrive/turbokeep
```

Open the address it prints (`http://<the server's address>:47901`; a Raspberry Pi answers to its IP address or `raspberrypi.local`), type a username, a password of at least ten characters and the setup code. That makes the first account, the **owner**. The code exists because a server that is already reachable from the internet (a tunnel) must not be claimable by whoever opens the page first.

To reach it from outside your home: [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

## 2. Home: notes and tasks together
Everything is a **note**; a note can also be a **task** (a checkbox, dates, priority, reminders, repeat, related tasks and comments). **Home** shows them in one list with the note you are reading beside it, and **tags on the left**: one click on a tag shows only those notes. The buttons of the side bar (the dock on a phone) choose the view: **Home** (everything), **Today**, **Tasks**, **Notes**, **Next 7 days**, **Overdue**, **Starred**, **Archive**, **Trash**.

- **New note** starts a note titled with the date and time, like *Wednesday, 14 Oct 2026 at 20:37*; rename it any time. The box above the list adds a task: type a title, press Enter.
- Everything saves by itself (the small word above the title says *Saved*). Add tags under the text; pin, archive or trash with the buttons above it. *Make a task* gives a note a checkbox and dates; *Not a task* takes them off and keeps the note. If the same note is changed on two devices, the second save is not allowed to overwrite the first: you are asked whether to keep yours or take theirs.
- The note you are reading stays open when you switch views or visit Settings.
- A task is a note with a checkbox. The arrow on its row opens it in place: the rest of its text, its dates and its sub-tasks as checkboxes of their own. In the **Tasks** view the tasks are listed under their **tags** (a task with no tag is under *Tasks*).
- **Tags** can have an **emoji** and a **colour**: hover a tag in the left column and press the pencil (on a phone, select the tag first). The look shows everywhere the tag does, and is kept in the TurboKeep backup.
- The **sort** menu above the list orders notes: *Automatic* (newest first on the Keep wall, due dates for tasks in the list), newest, recently edited, oldest, A to Z.
- **Lists** (below the tags) group tasks the way projects do.
- Settings > Appearance > **Google Keep view** shows the notes as a wall of cards (a card opens the note in a window).

Reminders are stored and exported but this server does not send notifications.

## 4. Bring your data
Settings > **Import & export**: a TurboKeep backup (notes and tasks together), Standard Notes backups and Vikunja exports, with a preview. Details and what is carried over: [IMPORT_EXPORT.md](IMPORT_EXPORT.md).

## 5. Use it on a phone
Install the **Android app** from the latest GitHub release (an `.apk`; see [ANDROID.md](ANDROID.md)), or open the address in the phone's browser and use *Add to Home screen*. Either needs the server to be reachable; there is no offline mode.

## 6. Make it yours
Settings > **Appearance**: 67 colour themes, 33 UI styles, four layouts and the Keep view. These choices are kept per browser, so a phone and a desktop can look different.
