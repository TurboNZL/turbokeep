# Android app

TurboKeep for Android is a small app that opens **your server's** page full screen, plus a **home-screen widget** and a **share target**. Because it shows the server's own page, it is always the version that matches your server, and you sign in the normal way.

## Install
1. On the phone, open the repository's **Releases** page on GitHub and download the newest `turbokeep-<version>-android.apk`.
2. Open it; Android asks once to allow *install unknown apps* for the browser or file manager you used.
3. Open TurboKeep, type your server's address (`https://keep.example.com` through a tunnel, or `http://192.168.1.20:47901` on your home network, which only works at home) and sign in.

The app checks for a newer release when it opens and offers it in **Settings > This app > Android app**; Android always asks you to confirm an install. While the repository is private, that card has a field for a GitHub token with read access.

## The widget
Long-press the home screen, **Widgets**, **TurboKeep list**. It shows your **Home list in your own order** (the order you dragged things into in the app; pinned first; overdue dates in red).
- **Refresh** is the circle arrow on the left. It always works, even when the list is empty, and says what happened ("Updated", or "Could not reach the server"). The widget also refreshes by itself every 30 minutes, whenever you change something in the app, and whenever you leave the app.
- The **title** in the middle opens the widget's settings: **text size**, the **space between items** and the **order** (*My order*, newest first, due date, A to Z). Changes show at once. It also has an *Open TurboKeep* button.
- **+** on the right adds something without opening the app (the first line is the title, the rest the description); it goes on the list like anything typed in the app.
- **Tap an item** and it opens up a little: its description and two big buttons, **Complete** (finishes it) and **Save to memory** (opens the app on that item with the tag picker ready, so you can file it under tags). Tap it again to close it. The **checkbox** on the left finishes it straight away.
- It needs an API token, which the app makes by itself the first time you sign in (you will see "Android app" under Settings > Account > API tokens; delete it to sign the widget out), or which comes with a pairing code (below). If the widget says to sign in, open the app once.

## Pair the phone with a code
Settings > This app > **Pair a phone** (on a computer, signed in) makes a **pairing code**: the server's address (type the one that works from the phone, the tunnel address if it is on mobile data), a token of its own named *Paired device* and, if you use Cloudflare Access, the service token's Client ID and Secret. On the phone's first screen (or *Change server*) paste it under **Pairing code**, press **Use code**, then **Connect**. The code *is* the credentials: send it only to yourself, and delete the *Paired device* token under Account > API tokens if it leaks.

## Share into TurboKeep
In any app, **Share > TurboKeep** adds the shared text to your list.

## Behind Cloudflare Access
The app's page signs in to Cloudflare Access in the normal way and keeps its cookie, and the widget borrows that cookie. When the cookie runs out the widget stops until you open the app, unless you give the app a **service token** on the address screen (Settings > This app > Change server): Client ID and Client Secret of a token with a *Service Auth* policy ([CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)).

## Good to know
- Exports (Settings > Import & export) are saved into the phone's **Downloads** folder.
- There is no offline mode: the app needs the server.
- Not verified on every phone. Reports of what breaks are welcome.
