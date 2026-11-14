#!/usr/bin/env bash
set -euo pipefail
umask 077

log() { printf '[Nowluma] %s\n' "$*" >&2; }
die() { log "$*"; exit 1; }

export HOME=/home/nowluma
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_RUNTIME_DIR=/tmp/nowluma-runtime
export DISPLAY=:99
cd /app

if [[ $(id -u) == 0 ]]; then
    # Only dedicated container volumes are touched; never change the host user.
    mkdir -p "$HOME" config data logs "$XDG_RUNTIME_DIR"
    chown -R 1000:1000 "$HOME" config data logs "$XDG_RUNTIME_DIR"
    chmod 700 "$HOME" "$XDG_RUNTIME_DIR"
    # Keep only the capability needed to attach to the sibling QQ process.
    exec setpriv --reuid=1000 --regid=1000 --clear-groups \
        --inh-caps=+sys_ptrace --ambient-caps=+sys_ptrace \
        "$0" "$@"
fi
[[ $(id -u) == 1000 ]] || die '容器需要固定 UID 1000；请不要覆盖 compose 的 user。'
for directory in "$HOME" "$XDG_RUNTIME_DIR" config data logs; do
    [[ -d "$directory" && -w "$directory" ]] || die "目录不存在或不可写：$directory"
done
[[ -f ./index.mjs && -x /opt/QQ/qq ]] || die '发行包或 QQ 程序缺失。'

# The machine ID belongs to the persistent home, not the container layer.
dbus-uuidgen --ensure="$HOME/.machine-id"
mkdir -p "$XDG_CONFIG_HOME/QQ" "$HOME/.vnc"
password_file="$HOME/.vnc/password"
if [[ ! -f "$password_file" ]]; then
    if [[ -n ${VNC_PASSWORD:-} ]]; then
        [[ ${#VNC_PASSWORD} == 8 && $VNC_PASSWORD != *$'\n'* ]] || die 'VNC_PASSWORD 必须为 8 个字符。'
        printf '%s\n' "$VNC_PASSWORD" > "$password_file"
    else
        node -e "process.stdout.write(require('node:crypto').randomBytes(6).toString('base64url')+'\n')" > "$password_file"
    fi
    chmod 600 "$password_file"
    log '已生成并保存内部桌面凭据；登录控制台后可直接打开桌面。'
fi
password=$(<"$password_file")
[[ ${#password} == 8 ]] || die '已保存的桌面密码无效；请检查持久卷，不会自动清除。'
x11vnc -storepasswd "$password" "$HOME/.vnc/passwd" >/dev/null
unset password VNC_PASSWORD

pids=()
app_pid=''
qq_pid=''
stopping=0
shutdown() {
    [[ $stopping == 0 ]] || return 0
    stopping=1
    trap '' INT TERM
    # Let the runtime drain SQLite handles before asking QQ to persist its state.
    if [[ -n $app_pid ]] && kill -0 "$app_pid" 2>/dev/null; then
        kill -TERM "$app_pid" 2>/dev/null || true
        for ((attempt=0; attempt<100; attempt++)); do
            kill -0 "$app_pid" 2>/dev/null || break
            sleep 0.1
        done
    fi
    if [[ -n $qq_pid ]]; then kill -TERM "$qq_pid" 2>/dev/null || true; fi
    for ((attempt=0; attempt<100; attempt++)); do
        [[ -n $qq_pid ]] && kill -0 "$qq_pid" 2>/dev/null || break
        sleep 0.1
    done
    for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
    for ((attempt=0; attempt<20; attempt++)); do
        running=0
        for pid in "${pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then running=1; fi
        done
        [[ $running != 0 ]] || break
        sleep 0.1
    done
    for pid in "${pids[@]}"; do kill -KILL "$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}
trap 'shutdown; exit 0' INT TERM
trap shutdown EXIT

# These are process locks, not credentials. Only remove them before any QQ starts.
for lock in SingletonLock SingletonSocket SingletonCookie; do
    rm -f "$XDG_CONFIG_HOME/QQ/$lock"
done
rm -f "$XDG_RUNTIME_DIR/dbus.address"
dbus-daemon --session --nofork --print-address=3 3>"$XDG_RUNTIME_DIR/dbus.address" &
pids+=("$!")
for ((attempt=0; attempt<100; attempt++)); do
    [[ -s "$XDG_RUNTIME_DIR/dbus.address" ]] && break
    kill -0 "${pids[0]}" 2>/dev/null || die '会话总线启动失败。'
    sleep 0.1
done
[[ -s "$XDG_RUNTIME_DIR/dbus.address" ]] || die '会话总线启动超时。'
read -r DBUS_SESSION_BUS_ADDRESS < "$XDG_RUNTIME_DIR/dbus.address"
export DBUS_SESSION_BUS_ADDRESS
Xvfb "$DISPLAY" -screen 0 "${SCREEN_GEOMETRY:-1280x800x24}" -nolisten tcp &
display_pid=$!
pids+=("$display_pid")
for ((attempt=0; attempt<100; attempt++)); do
    if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then break; fi
    kill -0 "$display_pid" 2>/dev/null || die '虚拟桌面启动失败。'
    sleep 0.1
done
xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 || die '虚拟桌面启动超时。'
openbox --sm-disable &
pids+=("$!")
x11vnc -display "$DISPLAY" -localhost -forever -shared \
    -rfbauth "$HOME/.vnc/passwd" -rfbport 5900 &
pids+=("$!")

/opt/QQ/qq --no-sandbox &
qq_pid=$!
pids+=("$qq_pid")
printf '%s\n' "$qq_pid" > "$XDG_RUNTIME_DIR/qq.pid"
log 'QQ 与程序共用固定 HOME；首次请打开桌面扫码并勾选 QQ 自动登录。'
"$@" &
app_pid=$!
pids+=("$app_pid")

# If any required process exits, fail visibly and let Docker restart the service.
set +e
wait -n "${pids[@]}"
result=$?
set -e
log "必要进程退出（状态 $result），正在正常关闭服务。"
shutdown
[[ $result != 0 ]] || result=1
exit "$result"
