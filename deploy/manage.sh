#!/usr/bin/env bash
# Nowluma management CLI
set -euo pipefail
DOCKER=(docker)
if [[ ${BASH_SOURCE[0]##*/} == nowluma ]]; then
    registration="${XDG_CONFIG_HOME:-$HOME/.config}/nowluma/deployment"
    if [[ -L $registration || ! -f $registration ]] ||
        ! { IFS= read -r SCRIPT_DIR && IFS= read -r privilege; } < "$registration"; then
        printf '%s\n' 'No deployment registered for this user. Run the Nowluma installation wizard.' >&2
        exit 1
    fi
elif [[ ${1:-} == --deployment ]]; then
    # The installer may manage a retained deployment with a newer script.
    (( $# >= 4 )) || exit 2
    SCRIPT_DIR=$2; privilege=$3; shift 3
else
    SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    privilege=user
fi
[[ $SCRIPT_DIR == /* && -d $SCRIPT_DIR ]] || { echo 'Invalid deployment directory.' >&2; exit 1; }
case "$privilege" in
    user) ;;
    sudo) DOCKER=(sudo docker) ;;
    *) echo 'Invalid deployment registration.' >&2; exit 1 ;;
esac
cd -- "$SCRIPT_DIR"
[[ ! -L .env && ( ! -e .env || -f .env ) ]] || { printf '%s\n' 'deploy/.env must be a regular file, not a symbolic link.' >&2; exit 1; }
read_env() {
    [[ ! -f .env ]] || awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value=$0 } END { print value }' .env
}
LANGUAGE=${NOWLUMA_LANG:-}
[[ -n $LANGUAGE ]] || LANGUAGE=$(read_env NOWLUMA_LANG)
LANGUAGE=${LANGUAGE:-zh}
msg() { local format=$1; [[ $LANGUAGE != en ]] || format=$2; shift 2; printf "$format\n" "$@"; }
usage() { msg '用法：nowluma [start|stop|restart|logs|doctor|pull|update [版本]]' 'Usage: nowluma [start|stop|restart|logs|doctor|pull|update [VERSION]]'; }
case "${1:-}" in -h|--help|help) usage; exit 0 ;; esac
command -v docker >/dev/null 2>&1 || { msg '请先运行 Linux 安装向导。' 'Run the Linux installation wizard first.' >&2; exit 1; }
"${DOCKER[@]}" compose version >/dev/null 2>&1 || { msg '需要 Docker Compose v2。' 'Docker Compose v2 is required.' >&2; exit 1; }
# Only the persisted image selects published mode; ambient variables must not switch modes.
image=$(read_env NOWLUMA_IMAGE)
valid_tag() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ && ${#1} -le 128 ]]; }
reference=${image#docker.io/}
if [[ -n $image && ! $reference =~ ^wsxyt/nowluma@sha256:[0-9a-f]{64}$ ]] &&
    { [[ $reference != wsxyt/nowluma:* ]] || ! valid_tag "${reference#wsxyt/nowluma:}"; }; then
    msg 'deploy/.env 中的 NOWLUMA_IMAGE 必须是带版本标签或摘要的官方 Docker Hub 镜像。' 'NOWLUMA_IMAGE in deploy/.env must be an official Docker Hub image with a version tag or digest.' >&2
    exit 1
fi
export NOWLUMA_IMAGE=${image:-nowluma:local}
compose() {
    local args=(-f "$SCRIPT_DIR/docker-compose.yml")
    # sudo can strip NOWLUMA_IMAGE. Both pull and up must use the candidate
    # even while the on-disk .env still selects the last healthy version.
    [[ -z $settings_tmp ]] || args+=(--env-file "$settings_tmp")
    "${DOCKER[@]}" compose "${args[@]}" "$@"
}
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

settings_tmp=''
trap '[[ -z $settings_tmp ]] || rm -f -- "$settings_tmp"' EXIT
run_action() {
if (( $# > 1 )) && [[ $1 != update || $# != 2 ]]; then usage >&2; return 2; fi
case "$1" in
    pull) pull_image ;;
    start|update)
        require_deployment
        if [[ $1 == update ]]; then
            if [[ $# == 2 ]]; then
                [[ -n $image ]] || { msg '源码部署不能切换到镜像更新。' 'Source deployments cannot switch to image updates.' >&2; return 2; }
                version=${2#v}
                valid_tag "$version" || { msg '请输入已发行的版本号。' 'Use a published version number.' >&2; return 2; }
                image="wsxyt/nowluma:$version"
                export NOWLUMA_IMAGE=$image
                settings_tmp=$(mktemp "$SCRIPT_DIR/.env.XXXXXXXX")
                saved_image=$image
                # A retained older manage.sh only understands the fully qualified spelling.
                grep -Fxq '# Nowluma management CLI' "$SCRIPT_DIR/manage.sh" || saved_image="docker.io/$image"
                awk -v image="$saved_image" '/^NOWLUMA_IMAGE=/ {$0="NOWLUMA_IMAGE=" image} {print}' .env > "$settings_tmp"
            fi
            pull_image
        fi
        if [[ -n $image ]]; then
            if ! compose up -d --no-build --pull never --wait --wait-timeout 240; then
                if [[ -n $settings_tmp ]]; then
                    msg '新版本未通过启动检查，原设置已保留。运行 nowluma start 恢复原镜像。' \
                        'The new version failed its startup check. Settings still select the old image; run nowluma start to restore it.' >&2
                fi
                return 1
            fi
            if [[ -n $settings_tmp ]]; then
                mv -fT -- "$settings_tmp" .env
                settings_tmp=''
            fi
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
    logs) compose logs --follow --tail=100 nowluma ;;
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
}

if (( $# )); then run_action "$@"; exit; fi
while true; do
    msg '\nNowluma\n1. 启动  2. 停止  3. 重启  4. 日志  5. 诊断  6. 拉取已选镜像  7. 更新至指定版本  0. 退出' \
        '\nNowluma\n1. Start  2. Stop  3. Restart  4. Logs  5. Diagnostics  6. Pull saved image  7. Update to version  0. Exit'
    printf '> '
    IFS= read -r choice || exit 0
    case "$choice" in
        0) exit 0 ;;
        1) run_action start ;; 2) run_action stop ;; 3) run_action restart ;;
        4) run_action logs ;; 5) run_action doctor ;; 6) run_action pull ;;
        7) msg '目标版本（回车取消）：' 'Target version (Enter to cancel):'
           IFS= read -r version || exit 0
           [[ -z $version ]] || run_action update "$version" ;;
        *) msg '请选择 0–7。' 'Choose 0–7.' >&2 ;;
    esac
done
