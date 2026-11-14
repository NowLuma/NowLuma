#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
LANGUAGE=${NOWLUMA_LANG:-}
if [[ -z $LANGUAGE && -f .env ]]; then
    LANGUAGE=$(awk -F= '$1 == "NOWLUMA_LANG" { sub(/\r$/, "", $2); print $2; exit }' .env)
fi
LANGUAGE=${LANGUAGE:-zh}
msg() { local format=$1; [[ $LANGUAGE != en ]] || format=$2; shift 2; printf "$format\n" "$@"; }
usage() { msg '用法：bash deploy/manage.sh start|stop|restart|logs|doctor' 'Usage: bash deploy/manage.sh start|stop|restart|logs|doctor'; }
case "${1:-help}" in -h|--help|help) usage; exit 0 ;; esac
command -v docker >/dev/null 2>&1 || { msg '请先运行 Linux 安装向导。' 'Run the Linux installation wizard first.' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { msg '需要 Docker Compose v2。' 'Docker Compose v2 is required.' >&2; exit 1; }
compose() { docker compose -f "$SCRIPT_DIR/docker-compose.yml" "$@"; }
case "${1:-help}" in
    start)
        compose up -d --build --wait --wait-timeout 240
        msg 'Nowluma 已通过启动检查。首次登录密码见安装输出或 logs。' 'Nowluma passed its startup check. See the installer output or logs for the first password.'
        compose port nowluma 5099
        ;;
    stop)
        # Keep all volumes, including QQ's credentials and automatic-login settings.
        compose down
        msg '已停止，设置与 QQ 用户目录已保留。' 'Stopped; settings and QQ HOME are preserved.'
        ;;
    restart)
        compose restart
        compose up -d --wait --wait-timeout 240
        msg '重启完成，服务已恢复。' 'Restart complete; the service is healthy.'
        ;;
    logs) exec docker compose -f "$SCRIPT_DIR/docker-compose.yml" logs --follow --tail=100 nowluma ;;
    doctor)
        compose config --quiet
        compose ps
        compose exec --user 1000:1000 -T nowluma node /usr/local/lib/nowluma-healthcheck.cjs
        compose exec --user 1000:1000 -T nowluma sh -c 'id; printf "HOME=%s\nXDG_CONFIG_HOME=%s\n" "$HOME" "$XDG_CONFIG_HOME"; ls -ld /home/nowluma /home/nowluma/.config/QQ /app/config /app/data /app/logs'
        ;;
    vnc-password)
        msg '桌面使用控制台认证，无需单独密码。登录控制台后点击“打开 QQ 桌面”。' 'Desktop access uses your console session; no separate password is required. Click “打开 QQ 桌面” (Open QQ desktop).'
        ;;
    *) usage >&2; exit 2 ;;
esac
