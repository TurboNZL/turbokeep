# Cloudflare Tunnel

A tunnel lets you reach TurboKeep from anywhere over HTTPS without opening a port on your router. The `cloudflared` program on your side makes an outbound connection to Cloudflare, and Cloudflare forwards visits for your hostname through it. You need a Cloudflare account and a domain whose DNS is on Cloudflare.

## 1. Create the tunnel
1. In the Cloudflare dashboard open **Zero Trust > Networks > Tunnels** and create a tunnel of type **Cloudflared**. (Cloudflare moves these screens around from time to time; look for *Tunnels* under Zero Trust.)
2. Choose the **Docker** install option and copy the **token** from the command it shows (the long string after `--token`).
3. In the folder with `docker-compose.yml` create a file called `.env` containing `TUNNEL_TOKEN=` followed by that token. (`.env.example` is a template. `.env` is ignored by git; treat the token like a password.)

## 2. Point a hostname at TurboKeep
In the tunnel's settings add a **public hostname**: your subdomain and domain (say `keep.example.com`), service type **HTTP**, URL **`turbokeep:8080`**. `turbokeep` is the compose service name, which `cloudflared` reaches over the compose network. (Inside the compose network the port is always 8080, whatever `TURBOKEEP_PORT` says. If you run `cloudflared` on the host instead of in compose, use `localhost:47901`, or your own `TURBOKEEP_PORT`.) Cloudflare creates the DNS record for you.

## 3. Start both
```
docker compose --profile tunnel up -d
docker compose logs cloudflared    # should say the connection is registered
docker compose logs turbokeep      # the setup code for the first account
```
Open `https://keep.example.com`, create the first account with the setup code. Do this promptly: until an account exists, anyone who finds the address could try to guess the code (it is random and the page tells nobody it exists, but do not leave a fresh server open for days).

## What the server does for a tunnel
- **HTTPS:** Cloudflare ends TLS and tells TurboKeep with `X-Forwarded-Proto: https`, so the sign-in cookie is marked `Secure`.
- **Visitor address:** the sign-in lockout counts failed attempts per `CF-Connecting-IP`, the real visitor, not the tunnel. (Cloudflare *appends* to a visitor-supplied `X-Forwarded-For`, so that header is never trusted ahead of `CF-Connecting-IP`.)
- **Same site:** changes made from the browser are accepted when the browser says the request is same-origin (`Sec-Fetch-Site`) or its `Origin` matches the host. If you set the tunnel's "HTTP Host Header" origin option to something else and use a very old browser, add your public address to `TURBOKEEP_ORIGINS`.
- **Nothing else needed:** one origin, relative URLs, no WebSockets, no CORS settings.
- **Once the tunnel works, close the direct door.** Set `TURBOKEEP_BIND=127.0.0.1` in `.env` and run `docker compose --profile tunnel up -d` again: the tunnel reaches TurboKeep over the compose network, so nothing else needs the port, and then it is no longer open to your LAN. By default it is open to the LAN (so you can set it up), and with `TURBOKEEP_TRUST_PROXY=true` anyone who could reach the published port (47901) directly could forge `CF-Connecting-IP`.

## Limits to know
- Cloudflare refuses request bodies over your plan's limit (100 MB on Free and Pro, 200 MB on Business, 500 MB on Enterprise) with an HTTP 413. A very large import (a Vikunja export with many attachments) may not get through the tunnel: do it over your LAN (`http://<server>:47901` after publishing the port), or split it.
- Attachments are not imported anyway, so real exports are usually small.

## Cloudflare Access (optional extra lock)
You can put **Cloudflare Access** in front of the hostname (an application with an *Allow* policy for your email, say). Browsers then sign in to Access first and to TurboKeep second, which is a good second wall. For scripts and API tokens ([API.md](API.md)) add a **service token** and a policy with the action **Service Auth**, then send both headers in addition to the bearer token:
```
curl https://keep.example.com/api/notes \
  -H "CF-Access-Client-Id: <id>.access" -H "CF-Access-Client-Secret: <secret>" \
  -H "Authorization: Bearer tk_..."
```
TurboKeep itself needs no Access settings: the web page is served from the same address as the API, so the browser's Access cookie covers every request.
