# Getting started

TurboKeep keeps your **notes** and your **tasks** on a server you control. You use it from any browser, including on a phone.

## 1. Start the server
You need Docker. In the folder with `docker-compose.yml`:

```
docker compose up -d
docker compose logs turbokeep
```

The log prints a **setup code** the first time. Open the address (<http://localhost:8080> on the same machine), type a username, a password of at least ten characters and the setup code. That makes the first account. The code exists because a server that is already reachable from the internet (a tunnel) must not be claimable by whoever opens the page first.

Other ways to run it, and every setting: [SELF_HOSTING.md](SELF_HOSTING.md). To reach it from outside your home: [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

## 2. Notes
**Notes** in the side bar. Press **+** to write. Everything saves by itself (the small word above the title says *Saved*). Add tags under the text; pin, archive or trash with the buttons above it. *Markdown* turns the preview on for that note. If the same note is changed on two devices, the second save is not allowed to overwrite the first: you are asked whether to keep yours or take theirs.

## 3. Tasks
**Tasks** in the side bar. Type a title and press Enter to add it to the list you are looking at (Inbox by default). Click a task for the details: dates, priority, labels, reminders, repeat, related tasks and comments. **Today** and **Next 7 days** look at due dates; **Starred** at the star.

Reminders are stored and exported but this server does not send notifications.

## 4. Bring your data
Settings > **Import & export**: Standard Notes backups and Vikunja exports, with a preview. Details and what is carried over: [IMPORT_EXPORT.md](IMPORT_EXPORT.md).

## 5. Use it on a phone
Open the address in the phone's browser and use *Add to Home screen*. It then opens like an app. It needs the server to be reachable; there is no offline mode.

## 6. Make it yours
Settings > **Appearance**: 67 colour themes, 33 UI styles, four layouts. These choices are kept per browser, so a phone and a desktop can look different.
