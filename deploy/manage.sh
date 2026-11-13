#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
    printf '%s\n' '用法：./deploy/manage.sh start|stop|restart|logs|doctor|vnc-password'
}
command -v docker >/dev/null 2>&1 || { echo '请先安装 Docker Engine 与 Compose 插件。' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo '需要 Docker Compose v2。' >&2; exit 1; }
compose() { docker compose -f "$SCRIPT_DIR/docker-compose.yml" "$@"; }

case "${1:-help}" in
    start)
        compose up -d --build --wait --wait-timeout 240
        echo 'Nowluma 已通过启动检查。首次登录密码请运行 logs 查看。'
        compose port nowluma 5099
        ;;
    stop)
        # Keep every volume, including QQ's credentials and automatic-login settings.
        compose down
        ;;
    restart)
        compose restart
        compose up -d --wait --wait-timeout 240
        ;;
    logs) exec docker compose -f "$SCRIPT_DIR/docker-compose.yml" logs --follow --tail=100 nowluma ;;
    doctor)
        compose config --quiet
        compose ps
        compose exec -T nowluma node /usr/local/lib/nowluma-healthcheck.cjs
        compose exec -T nowluma sh -c 'id; printf "HOME=%s\nXDG_CONFIG_HOME=%s\n" "$HOME" "$XDG_CONFIG_HOME"; ls -ld /home/nowluma /home/nowluma/.config/QQ /app/config /app/data /app/logs'
        ;;
    vnc-password)
        echo '这是远程桌面的访问密码，请勿转发：'
        compose exec -T nowluma cat /home/nowluma/.vnc/password
        ;;
    -h|--help|help) usage ;;
    *) usage >&2; exit 2 ;;
esac
