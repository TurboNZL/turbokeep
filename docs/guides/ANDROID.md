# Android app

TurboKeep for Android is a small app that shows the TurboKeep page full screen, plus a **home-screen widget** and a **share target**. The page is bundled in the app (like TurboMusic's) and talks to **your server** with a token of its own: you sign in the normal way, once, and the app keeps the token. Updating the app brings the newest page; **update the server first (or together with the app)**: the app's page is not on the server's address, so signing in and saving need a server that allows it, and an older server makes them fail with “Cannot reach the server”.

## Install
1. On the phone, open the repository's **Releases** page on GitHub and download the newest `turbokeep-<version>-android.apk`.
2. Open it; Android asks once to allow *install unknown apps* for the browser or file manager you used.
3. Open TurboKeep, type your server's address (`https://keep.example.com` through a tunnel, or `http://192.168.1.20:47901` on your home network, which only works at home) and sign in.

The app checks for a newer release when it opens and offers it in **Settings > This app > Android app**; Android always asks you to confirm an install. While the repository is private, that card has a field for a GitHub token with read access.

## The widgets
Long-press the home screen, **Widgets**, **TurboKeep**. There are two.

**TurboKeep list** shows your **tasks in your own order** (the order you dragged things into in the app; pinned first; overdue dates in red), or **the notes of one tag**. Every pixel is items, each in its own outlined card; two small round buttons float over the corners:
- The top-right button shows a **gear** while it opens the widget's settings and the **open arrow** when it opens the app. The settings are a small window (tap anywhere outside it to close it): **Show** (tasks, or a tag), **text size** (down to 50%), the **space between items** (down to -10 dp: below 0 the cards lose their own padding, a list cannot overlap its rows, so at the lowest they touch), **button size** (Android 12 and later), **show the tags on items** (off by default; due dates always show), the **order**, and **Open TurboKeep** and **Server and Cloudflare Access**. If you turn off *The open button shows these settings first*, the button goes straight into the app; the settings are then one long press on the widget away (**Reconfigure**, Android 12 and later). The same window opens when you add the widget, so you pick tasks or a tag right then.
- **Refresh** (bottom right) always works, even when the list is empty, shows a spinner while it runs and says what happened ("Updated", or "Could not reach the server"). The widget also refreshes by itself every 30 minutes, whenever you change something in the app, and whenever you leave the app.
- **Tap an item** and it opens over the **whole widget** (no scrolling, the buttons are hidden): its description, with two buttons floating over the text. For tasks: **Complete** (top right; finishes it) and **Send to tags** (bottom right; an item that already has tags goes straight to them, one without opens the app on it with the tag picker ready). An item with no title of its own (or only the date the app put there) shows just its text. For a tag's notes: **Archive** and **Send to tasks**. **Tap the text** to close it again. Taps inside the widget never bring the app forward (even when it is in Recents); only the open button does. The widget picker previews the widgets small (2 × 2 cells).
- It uses the same API token as the app's page, which is made the first time you sign in (you will see "Android app" under Settings > Account > API tokens; delete it to sign the widget out), or which comes with a pairing code (below). If the widget says to sign in, open the app once.

**TurboKeep note** shows **one note**, chosen when you add it (or later with Reconfigure), as lines that scroll when the note is long. **Open** (top right) opens that note in the app; **Refresh** (bottom right) as above.

## Pair the phone with a code
Settings > This app > **Pair a phone** (on a computer, signed in) makes a **pairing code**: the server's address (type the one that works from the phone, the tunnel address if it is on mobile data), a token of its own named *Paired device* and, if you use Cloudflare Access, the service token's Client ID and Secret. In the phone's app, on its first screen (or Settings > This app > *Server*) open **Pair a device**, paste the code under **Use a code from another device** and press **Connect**. The code *is* the credentials: send it only to yourself, and delete the *Paired device* token under Account > API tokens if it leaks.

## Share into TurboKeep
In any app, **Share > TurboKeep** adds the shared text to your list.

## Behind Cloudflare Access
The app is set up like TurboMusic's: its first screen (and Settings > This app > **Server**) has the **URL**, an optional **token**, and a **Cloudflare Access service token** section (Client ID and Client Secret of a token with a *Service Auth* policy, [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)), with **Test connection**, **Speed test** and **Save**. The service token goes on every request the app and its widget make. If **Test connection** or the speed test says Access is *refusing the request*, the token is fine but the Access application protecting **this** address (each hostname has its own; another app's policy does not carry over) has no policy with the action **Service Auth** that includes the token: add one, with an *Include* rule *Service Token* naming it.

## Good to know
- Exports (Settings > Import & export) are saved into the phone's **Downloads** folder.
- There is no offline mode: the app needs the server.
- Not verified on every phone. Reports of what breaks are welcome.
