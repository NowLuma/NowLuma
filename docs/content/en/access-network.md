---
title: Access and network
description: Local, SSH, LAN and reverse-proxy access; TLS, desktop authentication, token handling and recovery.
tutorial: access-network
---

# Access and network

The lesson above locates listener settings and diagnostics. SSH forwarding, published ports and TLS certificates still require configuration on your actual deployment.

![Deployment diagnostics on the service settings page](/images/tutorials/deployment-diagnostics.png)

_Figure: sample paths only. Redact real addresses and directories before requesting help._

By default only the local machine can reach the console. Prefer an SSH tunnel for remote use; use an HTTPS reverse proxy for LAN or public entry. Never expose the management UI and desktop directly over plaintext public HTTP.

## Three entry modes

| Entry                   | Suitable for                      | Key point                                             |
| ----------------------- | --------------------------------- | ----------------------------------------------------- |
| `http://127.0.0.1:5099` | Same machine                      | Default bind is `127.0.0.1`                           |
| SSH tunnel              | Remote server                     | Only a local port is opened; traffic goes through SSH |
| LAN / reverse proxy     | Trusted network or existing HTTPS | Strong access password; public entry requires TLS     |

The installer's `1. 仅本机/SSH（推荐）` sets `127.0.0.1`; `2. 局域网` sets `0.0.0.0` and warns that HTTP is unencrypted.

## SSH tunnel

```bash
ssh -L 5099:127.0.0.1:5099 -L 3001:127.0.0.1:3001 user@server
```

Keep the window open and visit `http://127.0.0.1:5099`. Forward bot ports only as needed; do not publish 5099 publicly.

## LAN

- Change the bind address under Settings → `服务` → `服务监听`, or choose LAN during install.
- Restrict access to trusted networks with a firewall.
- Plain HTTP on a LAN can expose passwords and sessions; use TLS or keep access inside SSH.
- Restart Nowluma after changing the listener.

## Reverse proxy

Preserve the real Host, forwarded protocol and WebSocket upgrade. Example (configure TLS first):

```nginx
location / {
    proxy_pass http://127.0.0.1:5099;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
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

- Do not drop the `/desktop/` prefix or proxy it to the old 6080.
- Set `trust-proxy` to `1`, `loopback` or explicit IPs only behind a trusted proxy. Trusting every forwarded header defeats source checks.
- Proxy Basic Auth does not replace the Nowluma password; both can coexist.

## HTTPS / TLS

- Under Settings → `服务` → `HTTPS / TLS`, paste a valid PEM certificate and key. The key is written to `config/key.pem` (0600) and never echoed.
- If the certificate cannot load after TLS is enabled, WebUI startup fails rather than downgrading to HTTP.
- A reverse proxy may terminate TLS and forward to loopback HTTP; ensure the proxy-to-local hop is on the same host or a trusted network.
- Expired, mismatched or incomplete chains are rejected by the browser; verify the certificate there first.

## Desktop authentication

Docker desktop is served under `/desktop/`:

- HttpOnly, SameSite=Strict, path-scoped cookies; console tokens and VNC passwords never appear in URLs.
- The gateway validates the console session server-side; the VNC backend listens only on loopback 5900 and keeps independent authentication. Its password is not returned to the browser.
- Logout, password change or session expiry stops desktop operations; WebSocket also checks Origin.
- The automatic `打开 QQ 桌面` entry always uses same-origin `/desktop/`; it does not use browser user agent or a configured external URL, and appears only when the server has actually applied the gateway.

## Tokens, passwords and sessions

- Sessions live in the browser; `退出登录` clears the current browser token.
- Changing the access password immediately invalidates other sessions.
- `?token=<password>` is a one-shot convenience removed from the address bar after reading; never share such a link.
- With 2FA enabled, a one-time code or recovery code is also required; recovery codes are shown once.

## Recovery

| Situation                 | Action                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Forgot access password    | Stop, back up and move `config/webui.json`, restart to get a new initial password; this also clears 2FA and sessions |
| Lost 2FA                  | Use a recovery code; otherwise reset as above                                                                        |
| Suspected session leak    | Change the password to expire other sessions; review proxy and network access                                        |
| Insecure banner           | Non-loopback without HTTPS; use SSH or TLS                                                                           |
| Wrong source behind proxy | Check `trust-proxy` and forwarded headers, never trust all sources                                                   |

Recovery is documented in [First run](first-run.md#forgot-password-or-lost-2fa). Resetting authentication does not delete accounts, messages or connections.

## Troubleshooting

- **Cannot open**: bind address, port, firewall, tunnel or proxy; use `doctor` for container health.
- **Session expires immediately**: proxy rewrites cookies, Host mismatch or clock skew.
- **Blank desktop**: missing `/desktop/` prefix or WebSocket upgrade; check the console session.
- **Mixed content**: an HTTPS page requesting HTTP resources is blocked; unify on HTTPS or relative URLs.
- **LAN works but bots do not**: publish the bot ports, allow them in the firewall and check tokens.
