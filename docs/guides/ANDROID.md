# Android app

TurboKeep for Android is a small app that opens **your server's** page full screen, plus a **home-screen widget** and a **share target**. Because it shows the server's own page, it is always the version that matches your server, and you sign in the normal way.

## Install
1. On the phone, open the repository's **Releases** page on GitHub and download the newest `turbokeep-<version>-android.apk`.
2. Open it; Android asks once to allow *install unknown apps* for the browser or file manager you used.
3. Open TurboKeep, type your server's address (`https://keep.example.com` through a tunnel, or `http://192.168.1.20:47901` on your home network, which only works at home) and sign in.

The app checks for a newer release when it opens and offers it in **Settings > This app > Android app**; Android always asks you to confirm an install. While the repository is private, that card has a field for a GitHub token with read access.

## The widget
Long-press the home screen, **Widgets**, **TurboKeep tasks**. It lists your open tasks (soonest first; overdue in red).
- Tap the box to **tick a task off**; tap the title to open it in the app.
- **+** adds a task and the note button adds a note, in a small window, without opening the app. **Refresh** reloads the list (it also reloads every 30 minutes and whenever you leave the app).
- It needs an API token, which the app makes by itself the first time you sign in (you will see "Android app" under Settings > Account > API tokens; delete it to sign the widget out). If the widget says to sign in, open the app once.

## Share into TurboKeep
In any app, **Share > TurboKeep** saves the shared text as a note.

## Behind Cloudflare Access
The app's page signs in to Cloudflare Access in the normal way and keeps its cookie, and the widget borrows that cookie. When the cookie runs out the widget stops until you open the app, unless you give the app a **service token** on the address screen (Settings > This app > Change server): Client ID and Client Secret of a token with a *Service Auth* policy ([CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)).

## Good to know
- Exports (Settings > Import & export) are saved into the phone's **Downloads** folder.
- There is no offline mode: the app needs the server.
- Not verified on every phone. Reports of what breaks are welcome.
