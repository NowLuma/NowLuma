# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /source
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @nowluma/core build:all \
    && pnpm --filter webui build \
    && node tools/check-release-layout.mjs dist

FROM node:24.22.1-bookworm-slim AS runtime
ARG TARGETARCH
# Pinned official Linux QQ release; upgrades are explicit, never on each boot.
ARG QQ_DEB_URL
ARG QQ_DEB_SHA256
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl xvfb x11-utils x11vnc novnc websockify \
        openbox dbus-x11 ffmpeg tini procps util-linux \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in amd64|arm64) ;; *) echo 'Unsupported QQ architecture' >&2; exit 1 ;; esac; \
    url="${QQ_DEB_URL:-https://qqdl.gtimg.cn/qqfile/QQNTV2/9.9.37/release/816b3c79/QQ_3.2.35_261103_${TARGETARCH}_01.deb}"; \
    curl --fail --location --retry 2 --connect-timeout 20 "$url" --output /tmp/qq.deb; \
    if [ -n "$QQ_DEB_SHA256" ]; then printf '%s  /tmp/qq.deb\n' "$QQ_DEB_SHA256" | sha256sum --check --strict; fi; \
    test "$(dpkg-deb --field /tmp/qq.deb Architecture)" = "$TARGETARCH"; \
    apt-get update; \
    apt-get install -y --no-install-recommends /tmp/qq.deb; \
    rm -f /tmp/qq.deb; \
    rm -rf /var/lib/apt/lists/*; \
    test -x /opt/QQ/qq

# Reuse the image's UID/GID 1000 rather than swallowing useradd collisions.
RUN usermod --login nowluma --home /home/nowluma node \
    && groupmod --new-name nowluma node \
    && install -d -o 1000 -g 1000 /app/config /app/data /app/logs /home/nowluma \
    && rm -f /etc/machine-id /var/lib/dbus/machine-id \
    && ln -s /home/nowluma/.machine-id /etc/machine-id \
    && ln -s /etc/machine-id /var/lib/dbus/machine-id
WORKDIR /app
COPY --from=build /source/dist/ /app/
COPY deploy/docker/entrypoint.sh /usr/local/bin/nowluma-entrypoint
COPY deploy/docker/healthcheck.cjs /usr/local/lib/nowluma-healthcheck.cjs
RUN chmod 755 /usr/local/bin/nowluma-entrypoint
ENV HOME=/home/nowluma \
    XDG_CONFIG_HOME=/home/nowluma/.config \
    XDG_RUNTIME_DIR=/tmp/nowluma-runtime \
    DISPLAY=:99 \
    NOWLUMA_WEBUI_HOST=0.0.0.0 \
    NOWLUMA_WEBUI_PORT=5099 \
    NOWLUMA_VNC_PORT=6080 \
    NOWLUMA_HOOK_AUTOLOAD=1
EXPOSE 5099 6080 3000 3001
HEALTHCHECK --interval=30s --timeout=6s --start-period=90s --retries=3 \
    CMD ["node", "/usr/local/lib/nowluma-healthcheck.cjs"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/nowluma-entrypoint"]
CMD ["node", "./index.mjs"]
