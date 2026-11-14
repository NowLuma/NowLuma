#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE=''
RELEASE_DIR="$ROOT/dist"

usage() {
    printf '%s\n' \
        'Nowluma 安装与启动' \
        '  bash deploy/install.sh --docker  构建并启动 QQ + 控制台 + 浏览器桌面' \
        '  bash deploy/install.sh --native --directory <发行目录>  启动已解压的 Linux 发行包'
}
while [[ $# -gt 0 ]]; do
    case "$1" in
        --docker|--native)
            [[ -z $MODE ]] || { echo '只能选择一种启动方式。' >&2; exit 2; }
            MODE=${1#--}; shift ;;
        --directory)
            [[ $# -ge 2 ]] || { echo '--directory 缺少目录。' >&2; exit 2; }
            RELEASE_DIR=$2; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done
if [[ -z $MODE ]]; then
    [[ -t 0 ]] || { usage >&2; exit 2; }
    echo '1. Docker（推荐，服务器/NAS，无需自行安装 QQ）'
    echo '2. Linux 发行包（桌面已有 QQ）'
    read -r -p '选择 [1]：' answer
    case "${answer:-1}" in 1) MODE=docker ;; 2) MODE=native ;; *) exit 2 ;; esac
fi

if [[ $MODE == native ]]; then
    [[ -f "$RELEASE_DIR/index.mjs" && -f "$RELEASE_DIR/launcher.sh" ]] || {
        echo '没有找到 Linux 发行包，请用 --directory 指定解压目录；源码部署推荐 --docker。' >&2
        exit 1
    }
    cd "$RELEASE_DIR"
    node_bin=$(command -v node || true)
    [[ ! -x ./node ]] || node_bin=./node
    [[ -n $node_bin ]] || { echo '需要随包 Node，或安装 Node.js 24.22.1 / 26.12.1 以上。' >&2; exit 1; }
    "$node_bin" ./check-node-version.cjs
    "$node_bin" -e "const fs=require('node:fs'); const release=JSON.parse(fs.readFileSync('release.json','utf8')); if(release.target!=='linux-'+process.arch) throw new Error('发行包平台与本机不符');"
    echo '请在这台设备的 QQ 窗口登录并勾选自动登录。正在启动控制台……'
    exec bash ./launcher.sh
fi

command -v docker >/dev/null 2>&1 || { echo '需要 Docker Engine 与 Docker Compose v2，安装后重新运行本命令。' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo '需要 Docker Compose v2 插件。' >&2; exit 1; }
cd "$SCRIPT_DIR"
[[ ! -L .env ]] || { echo '.env 不应是符号链接，未修改任何配置。' >&2; exit 1; }

if [[ ! -f .env ]]; then
    bind_address=127.0.0.1
    if [[ -t 0 ]]; then
        echo '访问方式：1. 仅本机/SSH 隧道（推荐）  2. 局域网'
        read -r -p '选择 [1]：' answer
        case "${answer:-1}" in 1) ;; 2) bind_address=0.0.0.0 ;; *) exit 2 ;; esac
    fi
    # Generate deployment config once; every later run keeps it and all volumes.
    printf '%s\n' "BIND_ADDRESS=$bind_address" 'WEBUI_PORT=5099' \
        'ONEBOT_HTTP_PORT=3000' 'ONEBOT_WS_PORT=3001' 'TZ=Asia/Shanghai' > .env
    chmod 600 .env
else
    echo '已有部署设置，保持不变；不会清空配置或 QQ 用户目录。'
fi

echo '首次构建需要下载 Node、QQ 和依赖，请等待构建结束。'
if ! bash "$SCRIPT_DIR/manage.sh" start; then
    echo '启动失败，未删除任何数据。请执行 bash deploy/manage.sh logs 查看原因。' >&2
    exit 1
fi
printf '\n%s\n' \
    '下一步：' \
    '1. 浏览器打开 http://127.0.0.1:5099，按控制台引导设置密码。' \
    '2. 执行 bash deploy/manage.sh logs 查看控制台首次密码。' \
    '3. 控制台点“打开 QQ 桌面”，无需单独输入桌面密码。' \
    '4. 在 QQ 窗口扫码，并勾选 QQ 自己的自动登录。重启会复用相同用户目录。' \
    '远程服务器：用 SSH 转发 5099，或访问刚才选定的局域网地址。' \
    '之后启动/停止/查看日志只需 bash deploy/manage.sh start|stop|logs。'
