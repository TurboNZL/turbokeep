# Backup and updating

## What to back up
Everything is in the data volume: `turbokeep.db` (plus `-wal` and `-shm` files while the server runs). Two safe ways:

1. **Export from the app** (Settings > Import & export): a Standard Notes zip and a Vikunja zip. They are readable by other programs, so this is also your way out. They are per account.
2. **Copy the database** while the server runs, with SQLite's own backup so the copy is consistent:
```
docker compose exec turbokeep node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync('/data/turbokeep.db'); d.exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp turbokeep:/data/backup.db ./turbokeep-backup.db
docker compose exec turbokeep rm /data/backup.db
```
To restore, stop the container and put the file back as `/data/turbokeep.db` (delete the `-wal` and `-shm` files next to it).

## Updating
```
docker compose pull
docker compose up -d
```
When a release changes how the database is laid out, the new version converts it when it starts. A server never opens a database made by a *newer* version (it stops with a message instead), so before updating, take a backup; to go back, pin the older tag in `docker-compose.yml` (`ghcr.io/turbonzl/turbokeep:2026.10.0`) and restore that backup. The running version is in Settings > This app.

Releases are published on GitHub for every merge to the main branch, named `vYYYY.M.N`.
