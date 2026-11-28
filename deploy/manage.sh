#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
[[ ! -L .env && ( ! -e .env || -f .env ) ]] || { printf '%s\n' 'deploy/.env must be a regular file, not a symbolic link.' >&2; exit 1; }
read_env() {
    [[ ! -f .env ]] || awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value=$0 } END { print value }' .env
}
LANGUAGE=${NOWLUMA_LANG:-}
[[ -n $LANGUAGE ]] || LANGUAGE=$(read_env NOWLUMA_LANG)
LANGUAGE=${LANGUAGE:-zh}
msg() { local format=$1; [[ $LANGUAGE != en ]] || format=$2; shift 2; printf "$format\n" "$@"; }
usage() { msg '用法：bash deploy/manage.sh start|stop|restart|logs|doctor|pull|update' 'Usage: bash deploy/manage.sh start|stop|restart|logs|doctor|pull|update'; }
case "${1:-help}" in -h|--help|help) usage; exit 0 ;; esac
command -v docker >/dev/null 2>&1 || { msg '请先运行 Linux 安装向导。' 'Run the Linux installation wizard first.' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { msg '需要 Docker Compose v2。' 'Docker Compose v2 is required.' >&2; exit 1; }
# Only the persisted image selects published mode; ambient variables must not switch modes.
image=$(read_env NOWLUMA_IMAGE)
tag=${image#docker.io/wsxyt/nowluma:}
if [[ -n $image && ! $image =~ ^docker\.io/wsxyt/nowluma@sha256:[0-9a-f]{64}$ ]] &&
    [[ $tag == "$image" || ! $tag =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ || ${#tag} -gt 128 ]]; then
    msg 'deploy/.env 中的 NOWLUMA_IMAGE 必须是带版本标签或摘要的官方 Docker Hub 镜像。' 'NOWLUMA_IMAGE in deploy/.env must be an official Docker Hub image with a version tag or digest.' >&2
    exit 1
fi
export NOWLUMA_IMAGE=${image:-nowluma:local}
compose() { docker compose -f "$SCRIPT_DIR/docker-compose.yml" "$@"; }
require_deployment() {
    [[ -n $image || -f docker/Dockerfile ]] || {
        msg '没有已保存的镜像版本，也没有可构建的源码。请重新运行安装向导或恢复 deploy/.env。' 'No saved image version or buildable source. Rerun the installer or restore deploy/.env.' >&2
        exit 1
    }
}
pull_image() {
    [[ -n $image ]] || {
        msg '源码部署请更新源码后运行 start。' 'For source deployments, update the checkout and run start.' >&2
        return 1
    }
    msg '正在拉取 %s……' 'Pulling %s…' "$image"
    if ! compose pull nowluma; then
        msg '无法拉取 %s。请检查版本标签、平台和镜像源。' 'Could not pull %s. Check the version tag, platform and registry access.' "$image" >&2
        return 3
    fi
}

case "${1:-help}" in
    pull) pull_image ;;
    start|update)
        require_deployment
        if [[ ${1:-} == update ]]; then pull_image; fi
        if [[ -n $image ]]; then
            compose up -d --no-build --pull never --wait --wait-timeout 240 || exit 1
        else
            # Keep the build definition out of the hosted Compose file.
            compose -f - up -d --build --pull never --wait --wait-timeout 240 <<'YAML'
services:
  nowluma:
    build:
      context: ..
      dockerfile: deploy/docker/Dockerfile
      args:
        QQ_DEB_URL: ${QQ_DEB_URL:-}
        QQ_DEB_SHA256: ${QQ_DEB_SHA256:-}
YAML
        fi
        msg 'Nowluma 已通过启动检查。首次登录密码见安装输出或 logs。' 'Nowluma passed its startup check. See the installer output or logs for the first password.'
        compose port nowluma 5099
        ;;
    stop)
        # Keep all volumes, including QQ's credentials and automatic-login settings.
        compose down
        msg '已停止，设置与 QQ 用户目录已保留。' 'Stopped; settings and QQ HOME are preserved.'
        ;;
    restart)
        require_deployment
        compose restart
        compose up -d --no-recreate --no-build --pull never --wait --wait-timeout 240
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
