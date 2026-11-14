---
title: Access and networking
description: Local, LAN and SSH access, TLS and reverse proxies, how /desktop/ authenticates, and which ports are exposed.
---

# Access and networking

This chapter answers three questions: where you reach the console from, how to keep that safe, and why the desktop entry behaves differently from an ordinary page.

## Three ways to reach it

| Method | When | Bind address | TLS needed |
| --- | --- | --- | --- |
| Local / SSH tunnel | Remote servers (recommended) | `127.0.0.1` | The tunnel is already encrypted |
| LAN direct | Same trusted network | `0.0.0.0` | **Recommended**; otherwise the password travels in plaintext |
| Reverse proxy + domain | You want HTTPS and a single entry | `127.0.0.1` + proxy | Required |

Default ports: console and desktop **5099**, bot HTTP **3000**, bot WebSocket **3001**.

## SSH tunnel (the cheapest safe option)

On your own computer:

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 user@server
```

Keep that window open and browse to `http://127.0.0.1:5099`.

**Expected result**: the console behaves as if it were local, and the server exposes nothing publicly.

To connect a bot running on your machine, forward 3000 too:

```bash
ssh -L 5099:127.0.0.1:5099 -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 user@server
```

## LAN

The installer's second question offers `2. LAN`, which sets the bind address to `0.0.0.0`. You can also switch later under service → listener → 「所有网卡」 (all interfaces) and save, then restart.

The cost, stated plainly:

- Anyone who can reach the port sees the login page.
- Without TLS, the access password crosses the network in plaintext.
- The interface itself warns you when you choose all interfaces: enable HTTPS and set strong credentials.

**Do not expose the console or desktop entry directly to the internet.** For public access, put a reverse proxy with TLS in front.

## TLS and reverse proxies

### Enable HTTPS inside the console

Under 「服务 → HTTPS / TLS」, paste the certificate and private key PEM, press 「保存证书」, enable HTTPS, save, and restart the service.

- An invalid certificate is rejected.
- A broken TLS configuration makes startup fail instead of downgrading to HTTP.

### Nginx reverse proxy

Terminate TLS on the proxy first. The important parts:

```nginx
location / {
    proxy_pass http://127.0.0.1:5099;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    # Keep X-Nowluma-Token; Authorization stays available for proxy Basic Auth
}

location /desktop/ {
    proxy_pass http://127.0.0.1:5099;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

Rules:

- `Host` must keep the real access port, or origin checks will be wrong.
- `proxy_buffering off` is required for SSE (log and state streaming); otherwise “live” logs arrive in batches.
- `/desktop/` must be proxied as-is, WebSocket upgrade headers must pass through, and the read timeout must be generous.
- The session token travels in `X-Nowluma-Token`, leaving `Authorization` for the proxy's own auth; the backend also accepts `Authorization: Bearer`.
- Set `trustProxy` only when requests really come from **your** proxy. Trusting public forwarded headers abandons origin checking.

## Bot endpoints vs access paths

| You want | Configure here |
| --- | --- |
| Browser access to the console | Bind address / reverse proxy / SSH tunnel (this chapter) |
| A local bot talking OneBot | Endpoints in [Endpoint configuration](onebot-config.md) plus published ports in your deployment |
| A usable QQ desktop | Desktop entry settings plus `/desktop/` (next section) |

These do not substitute for each other: the console password is not an OneBot token, and an OneBot token does not open the console.

## The desktop entry `/desktop/`

In Docker, the QQ desktop is not a separate site — it is a same-origin path of the console.

| Fact | Detail |
| --- | --- |
| Path | `/desktop/`, served on the console port |
| Exposed ports | 5099 only. **6080 is no longer published** |
| Browser-side auth | A path-scoped HttpOnly, SameSite=Strict session cookie; neither the console token nor a VNC password goes into the URL |
| Gateway checks | Desktop HTTP, scripts and WebSocket all require a valid console session; forced password change and agreement consent cannot be bypassed |
| Origin check | The WebSocket must carry an Origin matching the current host |
| Session lifetime | After sign-out, a password change or expiry the desktop cannot be operated; idle connections are closed |
| Backend VNC | Listens on loopback `5900` only with its own password authentication; that password is never returned to the browser |
| External desktop URL | Configurable under service → QQ desktop. Such a service protects itself and does not inherit the console session |

In short: only someone who can open the console can open the desktop, and VNC's own password is an internal second gate you never type.

**Why no token in the URL**: URLs end up in browser history, proxy logs, `Referer` headers and screenshots. A session in an HttpOnly cookie is unreadable by scripts and absent from proxy logs.

## Example — putting the console behind an HTTPS domain

1. Keep `BIND_ADDRESS=127.0.0.1` in `deploy/.env`.
2. Configure Nginx for `https://nowluma.example.invalid` → `127.0.0.1:5099` with both `location` blocks above.
3. Under service → listener set `trustProxy` to `1`, save, and restart.
4. Browse to `https://nowluma.example.invalid`, sign in, and press 「打开 QQ 桌面」.

**Expected result**: the address bar shows HTTPS, no insecure-access banner appears, and the desktop opens and works.

**If it fails**:

| Symptom | Check |
| --- | --- |
| Desktop will not open | Is `/desktop/` proxied, are upgrade headers passed, is the session valid? |
| Logs are not live | Is `proxy_buffering` off? |
| Origin shows the proxy IP | `trustProxy` is missing or wrong |
| Insecure-access banner persists | The browser sees non-HTTPS (often TLS terminates at the proxy but `X-Forwarded-Proto` is not forwarded) |
| 502 / connection refused | Is the backend listening, and does the port match `deploy/.env`? |

## Port exposure rules

| Port | Published by default | Purpose |
| --- | --- | --- |
| 5099 | Host loopback | Console + desktop (same origin) |
| 3000 | Host loopback | OneBot HTTP |
| 3001 | Host loopback | OneBot WebSocket |
| 5900 (VNC) | **Not published** | Container loopback, reachable only through the gateway |
| 6080 | **Not used** | Removed with the old approach |

Accounts sharing a listener need distinct ports, and each must be published by your deployment.

## Safety reminders

- A non-loopback address without HTTPS keeps the insecure-access banner visible; it is not a dismissible nit.
- Do not add a second plain-HTTP hop from the proxy to the public internet.
- Do not share a URL containing `?token=`.
- Use LAN mode only on your own trusted network; on public Wi-Fi, use a tunnel.
