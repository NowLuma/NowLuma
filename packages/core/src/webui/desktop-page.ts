export const DESKTOP_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nowluma · QQ 桌面</title><link rel="stylesheet" href="./style.css"></head>
<body><header><a href="../">← 返回控制台 / Console</a><strong>QQ 桌面 / Desktop</strong><span id="status" role="status">正在连接 / Connecting…</span><button id="fullscreen" type="button">全屏 / Full screen</button></header><main id="screen" aria-label="QQ desktop"></main><p id="error" role="alert" hidden></p><script type="module" src="./client.js"></script></body></html>`;

export const DESKTOP_STYLE = `:root{color-scheme:dark;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#17141d;color:#eee;height:100dvh;display:flex;flex-direction:column}header{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;padding:.7rem 1rem;background:#292333}a{color:#d8b6fa}button{font:inherit;background:#59466e;border:1px solid #9376b1;border-radius:.5rem;color:white;padding:.4rem .7rem;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #d8b6fa;outline-offset:3px}#screen{flex:1;min-height:0;overflow:hidden}#error{padding:1rem;margin:0;color:#ffb6bd}#status{margin-left:auto}`;

export const DESKTOP_CLIENT = `import RFB from './vendor/core/rfb.js';
const status = document.getElementById('status');
const error = document.getElementById('error');
const url = new URL('./socket', location.href);
url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const rfb = new RFB(document.getElementById('screen'), url.href);
rfb.scaleViewport = true;
rfb.resizeSession = true;
function failed(message) { error.hidden = false; error.textContent = message; status.textContent = '已断开 / Disconnected'; }
rfb.addEventListener('connect', () => { status.textContent = '已连接 / Connected'; });
rfb.addEventListener('disconnect', () => failed('桌面已断开。会话过期时，请返回控制台重新登录后打开。 / Sign in again if your session expired.'));
rfb.addEventListener('credentialsrequired', () => { rfb.disconnect(); failed('桌面认证异常，请查看服务器日志。 / Desktop authentication failed.'); });
rfb.addEventListener('securityfailure', () => failed('桌面认证失败，请返回控制台。 / Desktop authentication failed.'));
document.getElementById('fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => failed('浏览器不允许全屏 / Full screen unavailable.')));
window.addEventListener('pagehide', () => rfb.disconnect(), { once: true });`;
