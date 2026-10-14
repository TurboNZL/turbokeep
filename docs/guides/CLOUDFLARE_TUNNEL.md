# Cloudflare Tunnel

A tunnel lets you reach TurboKeep from anywhere over HTTPS without opening a port on your router. The `cloudflared` program on your side makes an outbound connection to Cloudflare, and Cloudflare forwards visits for your hostname through it. You need a Cloudflare account and a domain whose DNS is on Cloudflare.

## 1. Create the tunnel
1. In the Cloudflare dashboard open **Zero Trust > Networks > Tunnels** and create a tunnel of type **Cloudflared**. (Cloudflare moves these screens around from time to time; look for *Tunnels* under Zero Trust.)
2. Choose **Linux** and your processor, install `cloudflared` as the page says, and run the command it generates, which starts with `sudo cloudflared service install` followed by your token. That installs `cloudflared` as a system service named `cloudflared` that starts with the machine. Treat the token like a password.

## 2. Point a hostname at TurboKeep
In the tunnel's settings add a **public hostname**: your subdomain and domain (say `keep.example.com`), service type **HTTP**, URL **`localhost:47901`** (or your own port, if you changed it). Cloudflare creates the DNS record for you.

## 3. Check it
```
sudo systemctl status cloudflared      # active, connection registered
journalctl -u turbokeep | grep -i "setup code"      # only until you made the first account
```
Open `https://keep.example.com`, create the first account with the setup code (the installer printed it too). Do this promptly: until an account exists, anyone who finds the address could try to guess the code (it is random and the page tells nobody it exists, but do not leave a fresh server open for days).

## What the server does for a tunnel
- **HTTPS:** Cloudflare ends TLS and tells TurboKeep with `X-Forwarded-Proto: https`, so the sign-in cookie is marked `Secure`.
- **Visitor address:** the sign-in lockout counts failed attempts per `CF-Connecting-IP`, the real visitor, not the tunnel. (Cloudflare *appends* to a visitor-supplied `X-Forwarded-For`, so that header is never trusted ahead of `CF-Connecting-IP`.)
- **Same site:** changes made from the browser are accepted when the browser says the request is same-origin (`Sec-Fetch-Site`) or its `Origin` matches the host. If you set the tunnel's "HTTP Host Header" origin option to something else and use a very old browser, add your public address to `TURBOKEEP_ORIGINS`.
- **Nothing else needed:** one origin, relative URLs, no WebSockets, no CORS settings.
- **Once the tunnel works, close the direct door.** `cloudflared` runs on the same machine, so TurboKeep can listen on this machine only: `sudo systemctl edit turbokeep`, add `[Service]` and `Environment=HOST=127.0.0.1`, save and `sudo systemctl restart turbokeep`. By default it is open to your LAN (so you can set it up), and with `TURBOKEEP_TRUST_PROXY=true` anyone who could reach port 47901 directly could forge `CF-Connecting-IP`. (Do this only when you do not also use it over the LAN.)

## Limits to know
- Cloudflare refuses request bodies over your plan's limit (100 MB on Free and Pro, 200 MB on Business, 500 MB on Enterprise) with an HTTP 413. A very large import (a Vikunja export with many attachments) may not get through the tunnel: do it over your LAN (`http://<server>:47901`), or split it.
- Attachments are not imported anyway, so real exports are usually small.

## Cloudflare Access (optional extra lock)
You can put **Cloudflare Access** in front of the hostname (an application with an *Allow* policy for your email, say). Browsers then sign in to Access first and to TurboKeep second, which is a good second wall. For scripts and API tokens ([API.md](API.md)) add a **service token** and a policy with the action **Service Auth**, then send both headers in addition to the bearer token:
```
curl https://keep.example.com/api/notes \
  -H "CF-Access-Client-Id: <id>.access" -H "CF-Access-Client-Secret: <secret>" \
  -H "Authorization: Bearer tk_..."
```
The web page needs no Access settings: it is served from the same address as the API, so the browser's Access cookie covers every request. The **Android app** is not a browser tab, so with Access in front it needs the service token's Client ID and Secret (Settings > Server in the app).
