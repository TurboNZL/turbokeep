# Getting started

TurboKeep keeps your **to-dos and notes** (they are the same kind of thing) on a server you control. You use it from any browser, including on a phone.

## 1. Start the server
On a Raspberry Pi or any Debian / Ubuntu machine, one command installs it as a service and prints the address and a **setup code** (see [SELF_HOSTING.md](SELF_HOSTING.md) for the command, the data folder and the settings):

```
curl -fsSL https://raw.githubusercontent.com/TurboNZL/turbokeep/main/scripts/install-pi.sh | sudo bash -s -- --data-dir /mnt/yourdrive/turbokeep
```

Open the address it prints (`http://<the server's address>:47901`; a Raspberry Pi answers to its IP address or `raspberrypi.local`), type a username, a password of at least ten characters and the setup code. That makes the first account, the **owner**. The code exists because a server that is already reachable from the internet (a tunnel) must not be claimable by whoever opens the page first.

To reach it from outside your home: [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md).

## 2. Home: type something, it is on your list
Everything in TurboKeep is one kind of thing: an **item** with a title and, if you want, a description. You never decide "note or task" before you write it.

- **Open TurboKeep and type.** The box at the top of **Home** has the cursor already. Type, press **Enter**: it is on your list (the **Tasks** list, with a checkbox). Press **Tab** once instead and you are in the **description**; **Ctrl+Enter** adds it, and clicking away keeps what you typed too. On a phone the **+** next to the box adds it.
- **The list shows only what is on your list.** Tick the box to **finish** an item: it plays a short animation (a glass glint and a ring of light in the Liquid Glass style) and goes to the **Archive**, with an **Undo** for a few seconds. Finished and archived are the same thing; tick it again in the Archive to bring it back.
- **Descriptions stay out of the way.** The **arrow** on a row opens it in place: the description, a **progress** slider, a **date** and big buttons. Click the title to open the whole item.
- **Reorder by dragging.** Drag a row to where you want it (with a mouse, anywhere on the row; on a touch screen, the **grip** on its left, so scrolling never moves anything). The order is yours and is the same in the Android widget. The **sort** menu above the list can switch to newest, edited, oldest, due date or A to Z instead (dragging is off then). Pinned items always stay on top.
- **Send to tags** is the big button when you want something kept rather than done: in the box (once you typed), on an opened row, in the item, in the menu and in the widget. Pick as many tags as you like or type a new one and press **Enter**. The item then leaves the list and is found under its tags; tick *Also keep it on my task list* to keep its checkbox too.
- **Tags** are the left column: **Tasks** (the list), **All notes**, **No tag**, then your tags. A tag can have an **emoji** (a searchable picker) and a **colour**; the colour **tints every item** carrying the tag, with a stripe down its edge, so you can read the list by colour. Hover a tag and press the pencil (on a phone select it first). A dot makes a sub-tag (`work.reports` sits under `work`).
- **Right-click an item, or hold your finger on it, or press the dots on its row** for the menu: Open, **Pin**, **Finish** (or Archive for something not on the list), **Send to tags**, **Put on / Take off my task list** (the checkbox), **Set a date**, **Copy link**, **Download**, **Move to the bin** (with Undo). *Copy link* gives a link to the item: paste it into another item and the second one shows a chip that opens the first. There are no related-task or comment features; links are how items refer to each other.
- Inside the item: title and description save by themselves (the small word above says *Saved*); tags (type, **Enter** adds), the checkbox switch, a date, progress, Markdown. If the same item is changed on two devices, the second save does not overwrite the first: you choose.
- The page you are on stays as it is when you visit Settings; the item you were reading stays open. Moving between **Home, Archive, Bin and Settings** slides the page in from the side it sits on. You can change the order of those pages in Settings > Appearance > Page order (drag or use the arrows).
- Settings > Appearance > **Google Keep view** shows the items as a wall of cards (a card opens in a window; dragging works there too).

There is no priority, project, repeat, reminder or start/end date any more; only a **date** (shown red when it has passed) and **progress**.

## 3. Bring your data
Settings > **Import & export**: a TurboKeep backup, and Standard Notes and Vikunja (one window each, with its import and export together), with a preview. Details and what is carried over: [IMPORT_EXPORT.md](IMPORT_EXPORT.md).

## 4. Use it on a phone
Install the **Android app** from the latest GitHub release (an `.apk`; see [ANDROID.md](ANDROID.md)), or open the address in the phone's browser and use *Add to Home screen*. Either needs the server to be reachable; there is no offline mode.

## 5. Make it yours
Settings > **Appearance**: 67 colour themes, 33 UI styles, four layouts and the Keep view. These choices are kept per browser, so a phone and a desktop can look different.
