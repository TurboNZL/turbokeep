# Backup and updating

## What to back up
Everything is in the data folder: `turbokeep.db` (plus `-wal` and `-shm` files while the server runs). Two safe ways:

1. **Export from the app** (Settings > Import & export): the **TurboKeep backup** holds your notes and tasks together and restores into any TurboKeep; the Standard Notes and Vikunja zips are readable by other programs, so they are also your way out. They are per account.
2. **Copy the database** while the server runs, with SQLite's own backup so the copy is consistent (adjust the data folder):
```
sudo -u turbokeep node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('/var/lib/turbokeep/turbokeep.db'); d.exec(\"VACUUM INTO '/var/lib/turbokeep/backup.db'\")"
```
Copy `backup.db` somewhere safe. To restore: `sudo systemctl stop turbokeep`, put the file back as `turbokeep.db` (delete the `-wal` and `-shm` files next to it), `sudo systemctl start turbokeep`.

## Updating
**Easiest:** sign in as the owner (the first account), open **Settings > This app > Update server**. It downloads the newest version, rebuilds it and restarts the server; the page waits for it to come back. Your notes are not touched (they live in the data folder, not in the program folder). The button appears only when the server can do it: it runs from the installer's git checkout under systemd (or with `TURBOKEEP_UPDATE=1`).

**From a terminal:**
```
sudo -u turbokeep -H /home/turbokeep/turbokeep/scripts/update.sh
```
It prints each step and stops at the first one that fails: stop the service, `git pull --ff-only`, `pnpm install`, build, start the service and check it is running. If a step fails after the service was stopped it stays stopped: fix the cause and run it again (it is safe to re-run). The installer also lets the service user run `systemctl stop|start|is-active turbokeep` without a password, and nothing else.

The version you are running is in the first line of `journalctl -u turbokeep` and in Settings > This app; compare it with the latest release on GitHub. Releases are made for every merge to the main branch, named `vYYYY.M.N`; the server updates from `main`.

When a release changes how the database is laid out, the new version converts it when it starts (the 2026.10 notes-and-tasks merge did this: every task got a note). A server never opens a database made by a *newer* version (it stops with a message instead), so **take a backup before updating**; to go back, check out the older tag in the program folder (`git checkout v2026.10.3`, then `pnpm install --frozen-lockfile && pnpm build`) and restore that backup.
