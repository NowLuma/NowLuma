#!/usr/bin/env bash
# Parse the entire script before executing any part of a streamed download.
{
set -euo pipefail
umask 077
case ${BASH_SOURCE[0]} in
    /dev/fd/*|/proc/self/fd/*) SCRIPT_DIR=$PWD ;;
    *) SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" ;;
esac
MODE=published
MODE_SELECTED=0
VERSION=''
ASSET_BASE=https://nowluma.github.io/NowLuma
HUB_REPOSITORY=wsxyt/nowluma
RELEASE_DIR="$SCRIPT_DIR/../dist"
LANGUAGE=''
TEMPORARY=''
STAGED_DEPLOY=''
ENV_TEMP=''
DOCKER=(docker)
SUDO_MANAGE=0

msg() {
    local format=$1
    [[ $LANGUAGE != en ]] || format=$2
    shift 2
    printf "$format\n" "$@"
}
prompt() {
    msg "$1" "$2" >&2
    case "$3" in y) printf '[Y/n]: ' >&2 ;; n) printf '[y/N]: ' >&2 ;; '') printf '> ' >&2 ;; *) printf '[%s]: ' "$3" >&2 ;; esac
    if ! read -r ANSWER; then msg '输入已结束，安装取消。' 'Input ended; installation cancelled.' >&2; exit 1; fi
    ANSWER=${ANSWER:-$3}
}
confirm() {
    while true; do
        prompt "$1" "$2" "${3:-y}"
        case "$ANSWER" in y|Y|yes|YES) return 0 ;; n|N|no|NO) return 1 ;; esac
        msg '请输入 y 或 n。' 'Enter y or n.' >&2
    done
}
fail() { msg "$1" "$2" >&2; exit 1; }
root_run() {
    if [[ $(id -u) == 0 ]]; then "$@";
    else command -v sudo >/dev/null || fail '需要 root 或 sudo。' 'Root or sudo is required.'; sudo "$@"; fi
}
cleanup() {
    [[ -z $TEMPORARY ]] || rm -rf -- "$TEMPORARY"
    [[ -z $STAGED_DEPLOY ]] || rm -rf -- "$STAGED_DEPLOY"
    [[ -z $ENV_TEMP ]] || rm -f -- "$ENV_TEMP"
}
trap cleanup EXIT
download() {
    command -v curl >/dev/null || fail '下载需要 curl。' 'curl is required to download files.'
    curl -q --proto '=https' --proto-redir '=https' --fail --show-error --silent --location --retry 2 --output "$2" "$1" && [[ -s $2 ]]
}
valid_version() { [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ && ${#1} -le 128 ]]; }
read_env() {
    [[ ! -f .env ]] || awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value=$0 } END { print value }' .env
}
compose_assets() {
    [[ -f $1/docker-compose.yml && -s $1/docker-compose.yml && ! -L $1/docker-compose.yml &&
       -f $1/manage.sh && -s $1/manage.sh && ! -L $1/manage.sh ]]
}
service_property() {
    command -v systemctl >/dev/null || return
    systemctl show --property="$1" --value docker.service 2>/dev/null || true
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --docker|--native)
            [[ $MODE_SELECTED == 0 ]] || { echo 'Choose only one mode: --docker or --native' >&2; exit 2; }
            MODE=${1#--}; MODE_SELECTED=1; shift ;;
        --version)
            [[ $# -ge 2 ]] || { echo '--version requires a versioned Docker Hub tag' >&2; exit 2; }
            VERSION=${2#v}
            valid_version "$VERSION" || { echo '--version requires a version such as 2.5.0-rc.1, not latest' >&2; exit 2; }
            shift 2 ;;
        --directory) [[ $# -ge 2 ]] || { echo '--directory requires a path' >&2; exit 2; }; RELEASE_DIR=$2; shift 2 ;;
        --lang) [[ $# -ge 2 && $2 =~ ^(zh|en)$ ]] || { echo '--lang zh|en' >&2; exit 2; }; LANGUAGE=$2; shift 2 ;;
        -h|--help) printf '%s\n' 'Nowluma: bash install.sh [--version VERSION | --docker | --native --directory PATH] [--lang zh|en]' \
            '--docker builds from this source checkout. New image installs default to the published latest image and pin its digest.'; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ $MODE == published || -z $VERSION ]] || { echo '--version cannot be combined with --docker or --native' >&2; exit 2; }
if [[ -z $LANGUAGE ]]; then
    printf '\nNowluma — 1. 简体中文  2. English\n' >&2
    while true; do
        printf 'Language / 语言 [1]: ' >&2
        read -r ANSWER || exit 1
        case "${ANSWER:-1}" in 1|zh|zh-CN) LANGUAGE=zh; break ;; 2|en) LANGUAGE=en; break ;; esac
    done
fi
msg '\nNowluma 安装向导' '\nNowluma installation wizard'
[[ $(uname -s) == Linux ]] || fail '此安装脚本用于 Linux。Windows 请使用一键运行 exe。' 'This installer is for Linux. Use the one-click exe on Windows.'

if [[ $MODE == native ]]; then
    [[ -f "$RELEASE_DIR/index.mjs" && -f "$RELEASE_DIR/launcher.sh" ]] || fail '请用 --directory 指定解压后的 Linux 发行目录。' 'Use --directory to select an extracted Linux release.'
    cd "$RELEASE_DIR"
    node_bin=$(command -v node || true)
    [[ ! -x ./node ]] || node_bin=./node
    [[ -n $node_bin ]] || fail '需要随包 Node，或 Node.js 24.22.1 / 26.12.1 以上。' 'Bundled Node or Node.js 24.22.1 / 26.12.1+ is required.'
    "$node_bin" ./check-node-version.cjs
    "$node_bin" -e "const fs=require('node:fs'); const r=JSON.parse(fs.readFileSync('release.json','utf8')); if(r.target!=='linux-'+process.arch) throw new Error('Release platform mismatch');"
    msg '请在 QQ 窗口登录并勾选自动登录。正在启动控制台……' 'Sign in using QQ and enable automatic login. Starting the console…'
    exec bash ./launcher.sh
fi

if [[ $MODE == docker ]]; then
    [[ -f $SCRIPT_DIR/docker/Dockerfile ]] && compose_assets "$SCRIPT_DIR" ||
        fail '--docker 只能在完整源码目录中使用。' '--docker requires a complete source checkout.'
fi

cancel() { msg '已取消安装。' 'Installation cancelled.'; exit 0; }
if ! command -v docker >/dev/null 2>&1; then
    if [[ -n ${DOCKER_HOST:-}${DOCKER_CONTEXT:-} || $(service_property LoadState) == loaded ]] ||
        test -S /var/run/docker.sock || test -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/docker.sock"; then
        fail 'Docker 命令不可用，但已有 Docker 服务或端点设置。请先恢复 Docker CLI；不会重新安装 Docker。' \
            'Docker CLI is unavailable, but an existing service or endpoint is configured. Restore the CLI first; Docker will not be reinstalled.'
    fi
    msg '未检测到 Docker。' 'Docker was not found.'
    while true; do
        prompt '是否使用第三方 LinuxMirrors 并自行选择镜像源？y=第三方，n=官方安装。' 'Use third-party LinuxMirrors and choose a registry mirror there? y=third-party, n=official.' n
        case "$ANSWER" in
            y|Y|yes|YES)
                docker_url=https://linuxmirrors.cn/docker.sh
                msg '将执行第三方脚本；镜像源等选项由你在该脚本中选择。' 'This is a third-party script. Choose its registry mirror and other options yourself.'
                msg '关闭防火墙或 SELinux 不是 Nowluma 的要求。' 'Nowluma does not require disabling the firewall or SELinux.'
                break ;;
            n|N|no|NO)
                docker_url=https://get.docker.com
                msg '将执行 Docker 官方安装脚本，不额外配置镜像源。' 'The official Docker installer will run without an added registry mirror.'
                break ;;
        esac
        msg '请输入 y 或 n。' 'Enter y or n.' >&2
    done
    msg '将先下载到临时文件，成功后才能以管理员权限执行：' 'Download to a temporary file first, then run it as root only if the download succeeds:'
    docker_root='sudo '; [[ $(id -u) != 0 ]] || docker_root=''
    printf 'tmp=$(mktemp) && curl -q --proto "=https" --proto-redir "=https" -fsSL %s -o "$tmp" && test -s "$tmp" && %sbash "$tmp"\n' "$docker_url" "$docker_root"
    confirm '是否继续执行？' 'Run this command?' || cancel
    TEMPORARY=$(mktemp -d)
    download "$docker_url" "$TEMPORARY/docker-install.sh" || fail '下载 Docker 安装脚本失败，未执行。' 'Docker installer download failed; nothing was executed.'
    root_run bash "$TEMPORARY/docker-install.sh"
    command -v docker >/dev/null || fail 'Docker 安装未完成，请查看上面的安装输出。' 'Docker installation did not complete. Check the output above.'
else
    msg '已检测到 Docker，保留已有 Docker 和镜像源设置。' 'Docker detected; keeping its existing configuration and mirrors.'
fi

use_sudo_docker() {
    if [[ $(id -u) != 0 ]] && command -v sudo >/dev/null &&
        [[ $(sudo docker context show) == default ]] && sudo docker info >/dev/null; then
        DOCKER=(sudo docker)
        SUDO_MANAGE=1
        return 0
    fi
    return 1
}
if ! docker_error=$(docker info 2>&1); then
    docker_context=$(docker context show) || fail '无法读取 Docker 上下文，请先修复 Docker 配置。' 'Could not read the Docker context. Fix Docker configuration first.'
    if [[ -n ${DOCKER_HOST:-}${DOCKER_CONTEXT:-} || $docker_context != default ]]; then
        printf '%s\n' "$docker_error" >&2
        fail '当前 Docker 端点不可用；不会切换守护进程或启动系统 Docker。' 'The selected Docker endpoint is unavailable; no daemon will be switched or started.'
    fi
    if ! use_sudo_docker; then
        if [[ $(service_property LoadState) != loaded || $(service_property ActiveState) != inactive ]]; then
            printf '%s\n' "$docker_error" >&2
            fail 'Docker 不可用。请检查服务状态和 Docker 权限；不会重装或重启已有服务。' 'Docker is unavailable. Check service status and Docker permissions; an existing service will not be reinstalled or restarted.'
        fi
        printf '%s\n' 'systemctl enable --now docker'
        confirm 'Docker 服务未运行，是否启动并设置开机启动？' 'Docker is stopped. Start it and enable it on boot?' || cancel
        root_run systemctl enable --now docker
        docker info >/dev/null || use_sudo_docker || fail 'Docker 服务仍不可用。' 'Docker is still unavailable.'
    fi
fi

if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    confirm '缺少 Docker Compose v2，是否安装插件？' 'Docker Compose v2 is missing. Install the plugin?' || cancel
    if command -v apt-get >/dev/null; then root_run apt-get update; root_run apt-get install -y docker-compose-plugin || root_run apt-get install -y docker-compose-v2
    elif command -v dnf >/dev/null; then root_run dnf install -y docker-compose-plugin
    elif command -v yum >/dev/null; then root_run yum install -y docker-compose-plugin
    elif command -v apk >/dev/null; then root_run apk add docker-cli-compose
    elif command -v pacman >/dev/null; then root_run pacman -S --needed --noconfirm docker-compose
    elif command -v zypper >/dev/null; then root_run zypper --non-interactive install docker-compose
    else fail '请安装 Docker Compose v2 后重新运行。' 'Install Docker Compose v2 and rerun the installer.'; fi
    "${DOCKER[@]}" compose version >/dev/null 2>&1 || fail 'Compose v2 仍不可用，请查看安装输出。' 'Compose v2 is still unavailable. Check the installation output.'
fi

if [[ $MODE == published ]]; then
    prompt 'Nowluma 安装目录（已有安装将复用）：' 'Nowluma installation directory (existing installations are reused):' "$HOME/Nowluma"
    install_dir=$ANSWER
    [[ ! -L $install_dir/deploy ]] || fail 'deploy 目录不能是符号链接。' 'The deploy directory must not be a symbolic link.'
    if compose_assets "$install_dir/deploy"; then
        SCRIPT_DIR="$(cd -- "$install_dir/deploy" && pwd)"
        # Older cloud installs unpacked the entire source. Never replace their
        # Compose file, management script or settings with the published bundle.
        if [[ -f $SCRIPT_DIR/docker/Dockerfile ]]; then
            [[ -f $SCRIPT_DIR/.env ]] ||
                fail '这是未配置的源码目录；请使用 --docker 或另选空目录。' 'This is an unconfigured source checkout. Use --docker or choose an empty directory.'
            MODE=docker
        fi
    else
        [[ ! -e $install_dir || -d $install_dir && -z $(ls -A -- "$install_dir") ]] ||
            fail '目录不是空目录或已有 Nowluma 安装。' 'Choose an empty directory or an existing Nowluma installation.'
        # Another directory on this daemon may already own the fixed project.
        existing=$("${DOCKER[@]}" ps -a --filter label=com.docker.compose.project=nowluma \
            --filter label=com.docker.compose.service=nowluma --format '{{.Names}}') ||
            fail '无法检查已有 Nowluma 容器。' 'Could not check for existing Nowluma containers.'
        [[ -z $existing ]] || fail '此 Docker 守护进程已有 Nowluma 容器；请选择原安装目录。' \
            'This Docker daemon already has a Nowluma container. Select its existing installation directory.'
        mkdir -p -- "$install_dir"
        install_dir="$(cd -- "$install_dir" && pwd)"
        STAGED_DEPLOY=$(mktemp -d "$install_dir/.nowluma-deploy.XXXXXXXX")
        SCRIPT_DIR=$STAGED_DEPLOY
    fi
fi
cd "$SCRIPT_DIR"
[[ ! -L .env && ( ! -e .env || -f .env ) ]] || fail '.env 必须是普通文件，不能是符号链接。' '.env must be a regular file, not a symbolic link.'
image=$(read_env NOWLUMA_IMAGE)
if [[ $MODE_SELECTED == 1 && -n $image ]]; then
    fail '此目录已保存镜像版本。--docker 不会把现有镜像部署切换为源码构建。' 'This deployment has a saved image. --docker will not switch an existing image deployment to a source build.'
fi
if [[ -f .env ]]; then
    if [[ -n $VERSION && ${image#docker.io/} != "$HUB_REPOSITORY:$VERSION" ]]; then
        fail '已有设置不会被覆盖。请使用已保存的版本或按升级说明操作。' 'Existing settings will not be overwritten. Use the saved version or follow the upgrade instructions.'
    fi
    if [[ -z $image && $MODE == published ]]; then
        fail '已有 .env 没有 NOWLUMA_IMAGE；请填写已发布的版本，不会重建配置。' 'Existing .env has no NOWLUMA_IMAGE. Set it to a published version; settings will not be regenerated.'
    fi
elif [[ $MODE == published ]]; then
    image="$HUB_REPOSITORY:${VERSION:-latest}"
elif [[ -n $VERSION ]]; then
    fail '此目录是已有源码部署。请省略 --version 以保留源码模式。' 'This is an existing source deployment. Omit --version to keep source mode.'
fi
read_port() {
    while true; do
        prompt "$1" "$2" "$3"
        if [[ $ANSWER =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$ANSWER <= 65535)); then return; fi
        msg '端口必须为 1–65535。' 'Port must be 1–65535.' >&2
    done
}
if [[ ! -f .env ]]; then
    prompt '访问方式：1. 仅本机/SSH（推荐）  2. 局域网  3. 公网控制台' \
        'Access: 1. Localhost/SSH (recommended)  2. LAN  3. Public console' 1
    console_bind=''
    case "$ANSWER" in
        1) bind_address=127.0.0.1 ;;
        2) bind_address=0.0.0.0
           msg '局域网 HTTP 未加密；远程访问建议使用 SSH 或 HTTPS。' 'LAN HTTP is unencrypted; use SSH or HTTPS for remote access.' ;;
        3) msg '公网会暴露管理入口。明文 HTTP 不能保护密码或会话；请使用 HTTPS、限制防火墙来源并开启双重验证。机器人端口仍仅限本机。' \
               'Public access exposes the management console. HTTP does not protect passwords or sessions. Use HTTPS, restrict firewall sources and enable 2FA. Bot ports stay on loopback.'
           confirm '确认将控制台端口发布到所有接口？' 'Publish the console port on all interfaces?' n || cancel
           bind_address=127.0.0.1; console_bind=0.0.0.0 ;;
        *) fail '访问方式必须为 1、2 或 3。' 'Access must be 1, 2 or 3.' ;;
    esac
    while true; do
        read_port '控制台与 QQ 桌面端口：' 'Console and QQ desktop port:' 5099; webui_port=$ANSWER
        read_port '机器人 HTTP 接口端口：' 'Bot HTTP endpoint port:' 3000; http_port=$ANSWER
        read_port '机器人 WebSocket 接口端口：' 'Bot WebSocket endpoint port:' 3001; ws_port=$ANSWER
        [[ $webui_port == "$http_port" || $webui_port == "$ws_port" || $http_port == "$ws_port" ]] || break
        msg '三个端口不能重复，请重新填写。' 'The three ports must be different. Try again.'
    done
    timezone=UTC; [[ $LANGUAGE != zh ]] || timezone=Asia/Shanghai
    prompt '时区：' 'Timezone:' "$timezone"; timezone=$ANSWER
    [[ $timezone =~ ^[A-Za-z0-9_+/-]+$ && $timezone != *..* ]] || fail '时区无效。' 'Invalid timezone.'
    if [[ $image == "$HUB_REPOSITORY:latest" ]]; then
        msg '正在拉取 %s……' 'Pulling %s…' "$image"
        if ! "${DOCKER[@]}" pull "$image"; then
            msg '无法拉取镜像。请检查 Docker 服务的网络和代理设置。' \
                'Image pull failed. Check the Docker daemon network and proxy settings.' >&2
            exit 3
        fi
        # Leave the pull attached to the terminal. A local image can also have
        # digests for other repositories; those must not select our deployment.
        digest=$("${DOCKER[@]}" image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" |
            awk -F@ -v repo="$HUB_REPOSITORY" '$1 == repo || $1 == "docker.io/" repo {print $2}' | sort -u)
        [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] ||
            fail 'Docker 没有返回唯一的镜像摘要，未保存部署。' 'Docker did not return a single image digest; deployment was not saved.'
        image="$HUB_REPOSITORY@$digest"
    fi
    ENV_TEMP=$(mktemp "$SCRIPT_DIR/.env.XXXXXXXX")
    {
        printf '%s\n' "NOWLUMA_LANG=$LANGUAGE" "BIND_ADDRESS=$bind_address" "WEBUI_PORT=$webui_port" \
            "ONEBOT_HTTP_PORT=$http_port" "ONEBOT_WS_PORT=$ws_port" "TZ=$timezone"
        if [[ -n $console_bind ]]; then printf '%s\n' "WEBUI_BIND_ADDRESS=$console_bind"; fi
        if [[ -n $image ]]; then printf '%s\n' "NOWLUMA_IMAGE=$image"; fi
    } > "$ENV_TEMP"
    # Publish the complete file atomically without overwriting an existing .env.
    ln -T -- "$ENV_TEMP" .env || fail '无法创建 .env，已有设置不会被覆盖。' 'Could not create .env; existing settings will not be overwritten.'
    rm -f -- "$ENV_TEMP"
    ENV_TEMP=''
else
    msg '使用已有部署配置。' 'Using the existing deployment settings.'
    bind_address=$(read_env BIND_ADDRESS); bind_address=${bind_address:-127.0.0.1}
    console_bind=$(read_env WEBUI_BIND_ADDRESS)
    webui_port=$(read_env WEBUI_PORT); webui_port=${webui_port:-5099}
fi

if [[ -n $STAGED_DEPLOY ]]; then
    msg '正在下载部署文件……' 'Downloading deployment files…'
    for file in docker-compose.yml manage.sh; do
        download "$ASSET_BASE/$file" "$SCRIPT_DIR/$file" ||
            fail '下载部署文件失败，未启动 Nowluma。' 'Deployment download failed; Nowluma was not started.'
    done
    if [[ $(head -n 1 manage.sh) != '#!/usr/bin/env bash' ]] || ! bash -n manage.sh ||
        ! NOWLUMA_IMAGE="$image" "${DOCKER[@]}" compose -f "$SCRIPT_DIR/docker-compose.yml" config --quiet; then
        fail '下载的部署文件无效，未启动 Nowluma。' 'Downloaded deployment files are invalid; Nowluma was not started.'
    fi
fi

manager="$SCRIPT_DIR/manage.sh"
if ! grep -Fxq '# Nowluma management CLI' "$manager"; then
    # Keep the old file for rollback; the CLI can operate on its directory.
    [[ -n $TEMPORARY ]] || TEMPORARY=$(mktemp -d)
    manager="$TEMPORARY/manage.sh"
    download "$ASSET_BASE/manage.sh" "$manager" && bash -n "$manager" &&
        grep -Fxq '# Nowluma management CLI' "$manager" ||
        fail '未取得新版管理命令，原部署未被修改。' 'Could not obtain the new manager; the existing deployment was not changed.'
fi
privilege=user; [[ $SUDO_MANAGE == 0 ]] || privilege=sudo
run_manage() {
    NOWLUMA_LANG="$LANGUAGE" bash "$manager" --deployment "$SCRIPT_DIR" "$privilege" "$@"
}

if [[ -n $STAGED_DEPLOY ]]; then
    # Keep failed pulls out of the final directory so the next run can choose another tag.
    if [[ $image != "$HUB_REPOSITORY@"* ]]; then run_manage pull; fi
    mv -T -- "$STAGED_DEPLOY" "$install_dir/deploy" ||
        fail '无法保存部署文件，未启动 Nowluma。' 'Could not save deployment files; Nowluma was not started.'
    [[ $manager != "$STAGED_DEPLOY/manage.sh" ]] || manager="$install_dir/deploy/manage.sh"
    STAGED_DEPLOY=''
    SCRIPT_DIR="$install_dir/deploy"
    cd "$SCRIPT_DIR"
    start_action=start
fi

if [[ -n $image ]]; then
    start_action=${start_action:-update}
else
    msg '首次构建会下载 Node、QQ 和依赖，请等待启动检查完成。' 'The first source build downloads Node, QQ and dependencies. Please wait for the startup check.'
fi
started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
if run_manage "${start_action:-start}"; then
    :
else
    status=$?
    if [[ $status != 3 ]]; then
        msg '启动失败，数据已保留。请运行 manage.sh logs 查看原因。' 'Startup failed; data is preserved. Run manage.sh logs for details.' >&2
    fi
    exit "$status"
fi

# Install the same manager for CLI use without embedding a user's writable
# deployment path in a system-wide executable. Registration is per user.
if [[ $(id -u) == 0 ]]; then bin_dir=${NOWLUMA_BIN_DIR:-/usr/local/bin}
else bin_dir=${NOWLUMA_BIN_DIR:-$HOME/.local/bin}; fi
[[ $bin_dir == /* && $SCRIPT_DIR != *$'\n'* ]] || fail '管理命令目录必须是绝对路径，部署路径不能含换行。' 'Use an absolute CLI directory and a deployment path without newlines.'
[[ -d $bin_dir ]] || install -d -m 0755 -- "$bin_dir"
cli="$bin_dir/nowluma"
if [[ -e $cli || -L $cli ]]; then
    [[ -f $cli && ! -L $cli ]] && grep -Fxq '# Nowluma management CLI' "$cli" ||
        fail '已有同名命令，不会覆盖。可用 NOWLUMA_BIN_DIR 选择其他目录。' 'An unrelated nowluma command already exists. Choose another directory with NOWLUMA_BIN_DIR.'
fi
install -T -m 0755 -- "$manager" "$cli"
registration_dir="${XDG_CONFIG_HOME:-$HOME/.config}/nowluma"
mkdir -p -- "$registration_dir"
[[ ! -L $registration_dir/deployment && ( ! -e $registration_dir/deployment || -f $registration_dir/deployment ) ]] ||
    fail '管理命令配置不是普通文件。' 'The CLI registration is not a regular file.'
ENV_TEMP=$(mktemp "$registration_dir/.deployment.XXXXXXXX")
printf '%s\n%s\n' "$SCRIPT_DIR" "$privilege" > "$ENV_TEMP"
mv -fT -- "$ENV_TEMP" "$registration_dir/deployment"
ENV_TEMP=''
compose() { NOWLUMA_IMAGE=${image:-nowluma:local} "${DOCKER[@]}" compose -f "$SCRIPT_DIR/docker-compose.yml" "$@"; }
initial_password=$(compose logs --no-color --since "$started_at" nowluma 2>/dev/null | sed -n 's/.*initial credentials: user=admin password=\([a-f0-9]\{16\}\).*/\1/p' | tail -1) || initial_password=''
msg '\nNowluma 已启动。' '\nNowluma is running.'
if [[ -n $initial_password ]]; then msg '控制台初始密码：%s' 'Initial console password: %s' "$initial_password";
else msg '控制台密码保持不变；首次凭据可在 manage.sh logs 中查看。' 'Your console password is unchanged; first-run credentials are available in manage.sh logs.'; fi
published_port=$(compose port nowluma 5099 2>/dev/null | head -1 | awk -F: '{print $NF}') || published_port=''
[[ ! $published_port =~ ^[1-9][0-9]{0,4}$ ]] || webui_port=$published_port
host=127.0.0.1
if [[ ${console_bind:-$bind_address} == 0.0.0.0 ]]; then host=$(hostname -I 2>/dev/null | awk '{print $1}') || host=''; host=${host:-SERVER_IP}; fi
[[ $host != *:* ]] || host="[$host]"
msg '控制台地址：http://%s:%s' 'Console: http://%s:%s' "$host" "$webui_port"
msg '登录控制台后完成首次设置，点“打开 QQ 桌面”扫码，不需要额外 VNC 密码。' 'Complete console setup, then click “Open QQ desktop” and scan. No extra VNC password is required.'
msg '在 QQ 设置中勾选自动登录。服务重启会保留相同 QQ 用户目录。' 'Enable automatic login in QQ. Restarts reuse the same QQ HOME.'
msg '安装目录：%s' 'Installation directory: %s' "$(dirname "$SCRIPT_DIR")"
if [[ :$PATH: != *":$bin_dir:"* ]]; then
    msg '将命令目录加入当前终端 PATH：' 'Add the command directory to this shell’s PATH:'
    printf 'export PATH=%q:"$PATH"\n' "$bin_dir"
fi
msg '管理面板：nowluma。也可直接运行 nowluma doctor、nowluma logs 或 nowluma restart。' \
    'Management menu: nowluma. Or run nowluma doctor, nowluma logs or nowluma restart.'
if [[ ${console_bind:-} == 0.0.0.0 ]]; then
    msg '远程登录前请先配置 HTTPS 和防火墙。上面的宿主机地址不一定可从公网抵达。' \
        'Configure HTTPS and the firewall before signing in remotely. The host address above may not be publicly routable.'
elif [[ $bind_address == 127.0.0.1 ]]; then
    msg '远程服务器：在自己电脑执行以下 SSH 命令，再打开本机控制台地址。' 'Remote server: run this SSH command on your computer, then open the local console URL.'
    printf 'ssh -L %s:127.0.0.1:%s USER@SERVER\n' "$webui_port" "$webui_port"
fi
}
