const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = (value) =>
  value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const source = __dirname;
const image = 'docker.io/wsxyt/nowluma:2.5.0-rc.1'; // Fixture tag; makes no claim about the registry.
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-install-test-'));
  const deploy = path.join(root, 'checkout with spaces', 'deploy');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(deploy, { recursive: true });
  fs.mkdirSync(bin);
  for (const file of ['install.sh', 'manage.sh', 'docker-compose.yml'])
    fs.copyFileSync(path.join(source, file), path.join(deploy, file));
  fs.mkdirSync(path.join(deploy, 'docker'));
  fs.writeFileSync(path.join(deploy, 'docker', 'Dockerfile'), 'FROM scratch\n');
  const hosted = path.join(root, 'hosted');
  fs.mkdirSync(hosted);
  for (const file of ['install.sh', 'manage.sh', 'docker-compose.yml'])
    fs.copyFileSync(path.join(source, file), path.join(hosted, file));
  const log = path.join(root, 'calls');
  const missing = path.join(root, 'docker-missing');
  const composeMissing = path.join(root, 'compose-missing');
  const daemonStopped = path.join(root, 'daemon-stopped');
  if (options.daemonStopped) fs.writeFileSync(daemonStopped, '');
  if (options.missing) fs.writeFileSync(missing, '');
  if (options.composeMissing) fs.writeFileSync(composeMissing, '');
  function script(name, content) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nset -e\n${content}\n`, { mode: 0o755 });
  }
  script('uname', 'echo Linux');
  script(
    'id',
    'if [[ $NON_ROOT == 1 && ${SUDO_TEST_ROOT:-0} != 1 ]]; then echo 1000; else echo 0; fi',
  );
  script('sudo', 'printf "sudo %s\\n" "$*" >> "$TEST_LOG"; unset NOWLUMA_IMAGE; export SUDO_TEST_ROOT=1; exec "$@"');
  script(
    'systemctl',
    `printf "systemctl %s\\n" "$*" >> "$TEST_LOG"
if [[ $1 == show ]]; then
  case "$2" in
    --property=LoadState)
      if [[ -f $DOCKER_MISSING && $SERVICE_EXISTS == 0 ]]; then echo not-found; else echo loaded; fi ;;
    --property=ActiveState)
      if [[ -f $DAEMON_STOPPED ]]; then echo "$DAEMON_STATE"; else echo active; fi ;;
    *) exit 1 ;;
  esac
elif [[ $* == 'enable --now docker' ]]; then
  rm -f -- "$DAEMON_STOPPED"
else
  exit 1
fi`,
  );
  script('hostname', 'echo 192.0.2.10');
  script(
    'docker',
    `printf 'docker %s\\n' "$*" >> "$TEST_LOG"
if [[ $* == 'context show' ]]; then echo "$DOCKER_TEST_CONTEXT"; fi
if [[ $1 == info && ( -f $DAEMON_STOPPED || $NON_ROOT == 1 && \${SUDO_TEST_ROOT:-0} != 1 ) ]]; then
  echo 'Cannot connect to Docker daemon' >&2; exit 1
fi
if [[ $* == 'ps -a '* ]]; then
  if [[ $EXISTING_PROJECT == 1 ]]; then echo nowluma-nowluma-1; fi
  exit 0
fi
if [[ $1 == compose && $2 == version && ( -f $COMPOSE_MISSING ||
  $ROOTLESS_COMPOSE_ONLY == 1 && \${SUDO_TEST_ROOT:-0} != 1 ) ]]; then exit 1; fi
if [[ $1 == compose && $2 == -f ]]; then
  env_file=.env
  if [[ $4 == --env-file ]]; then env_file=$5; fi
  selected=\${NOWLUMA_IMAGE:-$(awk -F= '$1 == "NOWLUMA_IMAGE" { print $2 }' "$env_file")}
  printf 'image %s\\n' "\${selected:-nowluma:local}" >> "$TEST_LOG"
  if [[ $* == *' -f - up '* ]]; then cat >> "$TEST_LOG"; fi
fi
if [[ $* == *' pull '* && $FAIL_PULL == 1 ]]; then echo 'manifest unknown' >&2; exit 1; fi
if [[ $* == 'pull wsxyt/nowluma:latest' ]]; then
  if [[ $FAIL_PULL == 1 ]]; then echo 'proxyconnect tcp: no route to host' >&2; exit 1; fi
  echo 'pull layer progress'
fi
if [[ $* == 'image inspect '* ]]; then
  echo 'other/repository@sha256:ignore'
  if [[ $PULL_DIGEST != '' ]]; then printf 'docker.io/wsxyt/nowluma@%s\\n' "$PULL_DIGEST"; fi
fi
if [[ $* == *' up '* && $FAIL_START == 1 ]]; then exit 1; fi
if [[ $* == *' logs '* && $* != *--follow* && $NO_INITIAL != 1 ]]; then echo 'initial credentials: user=admin password=0123456789abcdef'; fi
if [[ $* == *' port '* ]]; then
  port=$(awk -F= '$1 == "WEBUI_PORT" { value=$2 } END { print value }' .env)
  echo "127.0.0.1:\${port:-5099}"
fi`,
  );
  script(
    'curl',
    `printf 'curl %s\\n' "$*" >> "$TEST_LOG"
output=''
url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output|-o) output=$2; shift ;;
    https://*) url=$1 ;;
  esac
  shift
done
case "$url" in
  https://get.docker.com|https://linuxmirrors.cn/docker.sh)
    printf '%s\\n' 'echo "ran Docker installer" >> "$TEST_LOG"' 'rm -f -- "$DOCKER_MISSING"' > "$output"
    if [[ $FAIL_DOCKER_DOWNLOAD == 1 ]]; then exit 18; fi ;;
  https://nowluma.github.io/NowLuma/install.sh|https://nowluma.github.io/NowLuma/manage.sh|https://nowluma.github.io/NowLuma/docker-compose.yml)
    file=\${url##*/}
    if [[ $file == "$FAIL_ASSET" && -z $output ]]; then head -n 100 "$HOSTED/$file"; exit 18; fi
    if [[ -z $output ]]; then cat "$HOSTED/$file"; else cp -- "$HOSTED/$file" "$output"; fi
    if [[ $file == "$FAIL_ASSET" ]]; then exit 18; fi ;;
  *) exit 1 ;;
esac`,
  );
  script('apt-get', 'printf "apt-get %s\\n" "$*" >> "$TEST_LOG"; rm -f -- "$COMPOSE_MISSING"');
  const runner = path.join(root, 'run.sh');
  fs.writeFileSync(
    runner,
    `#!/bin/bash
export PATH="$TEST_BIN:/usr/bin:/bin"
command() {
  if [[ $1 == -v && $2 == docker && -f $DOCKER_MISSING ]]; then return 1; fi
  builtin command "$@"
}
# Keep host Unix sockets out of the Docker detection fixtures.
test() { if [[ $1 == -S ]]; then return 1; fi; builtin test "$@"; }
installer=$1
shift
source "$installer" "$@"
`,
  );
  const env = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: `${posix(bin)}:/usr/bin:/bin`,
    HOME: posix(path.join(root, 'home')),
    TMPDIR: posix(root),
    NOWLUMA_BIN_DIR: posix(bin),
    TEST_BIN: posix(bin),
    TEST_LOG: posix(log),
    DOCKER_MISSING: posix(missing),
    COMPOSE_MISSING: posix(composeMissing),
    FAIL_START: options.failStart ? '1' : '0',
    FAIL_PULL: options.failPull ? '1' : '0',
    FAIL_DOCKER_DOWNLOAD: options.failDockerDownload ? '1' : '0',
    FAIL_ASSET: options.failAsset ?? '',
    PULL_DIGEST: options.pullDigest ?? `sha256:${'a'.repeat(64)}`,
    HOSTED: posix(hosted),
    DOCKER_HOST: options.dockerHost ?? '',
    DOCKER_CONTEXT: '',
    DOCKER_TEST_CONTEXT: options.context ?? 'default',
    DOCKER_CONFIG: posix(path.join(root, 'docker-config')),
    XDG_RUNTIME_DIR: posix(path.join(root, 'runtime')),
    ROOTLESS_COMPOSE_ONLY: options.rootComposeOnly ? '1' : '0',
    DAEMON_STATE: options.daemonState ?? 'inactive',
    SERVICE_EXISTS: options.serviceExists ? '1' : '0',
    EXISTING_PROJECT: options.existingProject ? '1' : '0',
    NON_ROOT: options.nonRoot ? '1' : '0',
    NO_INITIAL: options.noInitial ? '1' : '0',
    DAEMON_STOPPED: posix(daemonStopped),
  };
  const runBash = (args, input = '') => {
    fs.rmSync(log, { force: true });
    // Set PATH inside Bash: Git for Windows can translate an inherited PATH.
    // Fail closed if either fixture is missing rather than contacting the host.
    const bootstrap =
      'export PATH="$TEST_BIN:/usr/bin:/bin"; ' +
      '[[ $(type -P curl) == "$TEST_BIN/curl" && $(type -P docker) == "$TEST_BIN/docker" ]] || exit 97; ' +
      'exec /bin/bash "$@"';
    const result = spawnSync(bash, ['-c', bootstrap, 'installer-test', ...args], {
      input,
      env,
      encoding: 'utf8',
      timeout: 20000,
    });
    if (result.error) throw result.error;
    return { ...result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  };
  const run = (input, args = ['--docker']) =>
    runBash([posix(runner), posix(path.join(deploy, 'install.sh')), ...args], input);
  const cloud = (input, args = []) =>
    runBash([posix(runner), posix(path.join(hosted, 'install.sh')), ...args], input);
  const manage = (directory, action) => runBash([posix(path.join(directory, 'manage.sh')), action]);
  return {
    root,
    deploy,
    bin,
    env,
    run,
    cloud,
    manage,
    runBash,
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
function using(options, body) {
  const f = fixture(options);
  try {
    body(f);
  } finally {
    f.dispose();
  }
}

test('EOF at the language prompt is handled before Docker or deployment checks', () =>
  using({}, (f) => {
    const result = f.run('');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Language \/ 语言/);
    assert.equal(result.calls, '');
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('asks language first, reuses Docker and writes default English setup with no VNC secret', () =>
  using({}, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /^\s*Nowluma — 1\. 简体中文 {2}2\. English/);
    assert.match(result.stdout, /Docker detected/);
    assert.match(result.stdout, /Initial console password: 0123456789abcdef/);
    assert.match(result.stdout, /No extra VNC password/);
    const config = fs.readFileSync(path.join(f.deploy, '.env'), 'utf8');
    assert.match(config, /NOWLUMA_LANG=en/);
    assert.match(config, /TZ=UTC/);
    assert.match(config, /WEBUI_PORT=5099/);
    assert.doesNotMatch(config, /VNC_|PASSWORD/);
    assert.doesNotMatch(result.calls, /curl |apt-get |systemctl | down | pull /);
    assert.match(result.calls, /image nowluma:local/);
    assert.match(result.calls, /-f - up -d --build/);
    assert.match(result.calls, /context: \.\./);
    assert.match(result.calls, /QQ_DEB_SHA256: \$\{QQ_DEB_SHA256:-\}/);
  }));

test('official Docker install is selected without mirrors and Enter confirms y', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /https:\/\/get\.docker\.com -o "\$tmp" && test -s "\$tmp" && bash "\$tmp"/);
    assert.match(result.calls, /curl .*--proto-redir =https.*https:\/\/get\.docker\.com/);
    assert.match(result.calls, /ran Docker installer/);
    assert.doesNotMatch(result.calls, /linuxmirrors/);
  }));

test('mirror installer is clearly third-party and runs only when selected', () =>
  using({ missing: true }, (f) => {
    const result = f.run('1\ny\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /将执行第三方脚本/);
    assert.match(result.calls, /curl .*--proto-redir =https.*https:\/\/linuxmirrors\.cn\/docker\.sh/);
    assert.match(result.calls, /ran Docker installer/);
    assert.doesNotMatch(result.calls, /get\.docker\.com/);
    assert.match(fs.readFileSync(path.join(f.deploy, '.env'), 'utf8'), /TZ=Asia\/Shanghai/);
  }));

test('a partial Docker installer transfer never executes its contents', () =>
  using({ missing: true, failDockerDownload: true }, (f) => {
    const result = f.run('2\nn\ny\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Docker installer download failed/);
    assert.doesNotMatch(result.calls, /ran Docker installer/);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('does not reinstall when the Docker CLI is missing but a daemon is configured', () =>
  using({ missing: true, serviceExists: true }, (f) => {
    const result = f.run('2\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Restore the CLI first/);
    assert.doesNotMatch(result.calls, /curl |systemctl enable/);
  }));

test('n declines Docker installation without changing settings', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\nn\nn\n');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Installation cancelled/);
    assert.doesNotMatch(result.calls, /curl /);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('EOF is not an Enter confirmation and never runs the remote installer', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\nn\n');
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.calls, /curl /);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('checks and installs missing Compose v2 using the package manager', () =>
  using({ composeMissing: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /apt-get install -y docker-compose-plugin/);
  }));

test('checks Compose under the same Docker identity used to start Nowluma', () =>
  using({ nonRoot: true, rootComposeOnly: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /sudo docker compose version/);
    assert.doesNotMatch(result.calls, /apt-get /);
  }));

test('declining the Compose plugin leaves the deployment untouched', () =>
  using({ composeMissing: true }, (f) => {
    const result = f.run('2\nn\n');
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.calls, /apt-get | up /);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('validates ports, supports LAN/custom values and keeps the selected console address', () =>
  using({}, (f) => {
    const result = f.run('2\n2\ninvalid\n6099\n3800\n3801\nUTC\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /Port must be 1–65535/);
    const config = fs.readFileSync(path.join(f.deploy, '.env'), 'utf8');
    assert.match(config, /BIND_ADDRESS=0.0.0.0/);
    assert.match(config, /WEBUI_PORT=6099/);
    assert.match(config, /ONEBOT_HTTP_PORT=3800/);
    assert.match(config, /ONEBOT_WS_PORT=3801/);
    assert.match(result.stdout, /http:\/\/192\.0\.2\.10:6099/);
  }));

test('a repeated install preserves existing .env byte-for-byte and uses its port', () =>
  using({ noInitial: true }, (f) => {
    const config = 'BIND_ADDRESS=127.0.0.1\nWEBUI_PORT=6099\nONEBOT_HTTP_PORT=3800\nCUSTOM=$(touch sourced)\n';
    f.env.NOWLUMA_IMAGE = image; // An ambient override must not switch a legacy checkout to published mode.
    fs.writeFileSync(path.join(f.deploy, '.env'), config);
    const result = f.run('2\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(fs.readFileSync(path.join(f.deploy, '.env'), 'utf8'), config);
    assert.match(result.stdout, /http:\/\/127\.0\.0\.1:6099/);
    assert.match(result.stdout, /Your console password is unchanged/);
    assert.doesNotMatch(result.stdout, /Initial console password:/);
    assert.match(result.calls, /image nowluma:local/);
    assert.doesNotMatch(result.calls, / pull /);
    assert.equal(fs.existsSync(path.join(f.deploy, 'sourced')), false);
  }));

test('startup errors stay failures and preserve generated settings', () =>
  using({ failStart: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Startup failed; data is preserved/);
    assert.doesNotMatch(result.stdout, /Nowluma is running/);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), true);
  }));

test('non-root Docker access uses sudo and reports working daily commands', () =>
  using({ nonRoot: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /sudo docker info/);
    const doctor = f.runBash(['-c', 'cd / && nowluma doctor']);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.calls, /sudo docker compose .* healthcheck|sudo docker compose .*nowluma-healthcheck/);
  }));

test('asks before starting a stopped Docker daemon and checks it again', () =>
  using({ daemonStopped: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /systemctl enable --now docker/);
  }));

test('does not switch an unavailable custom context or DOCKER_HOST to the system daemon', () => {
  for (const options of [{ context: 'remote' }, { dockerHost: 'ssh://server' }]) {
    using({ ...options, daemonStopped: true, nonRoot: true }, (f) => {
      const result = f.run('2\n');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /selected Docker endpoint is unavailable/);
      assert.doesNotMatch(result.calls, /sudo |systemctl |curl | up /);
    });
  }
});

test('refuses to restart an active but unusable Docker service', () =>
  using({ daemonStopped: true, daemonState: 'active' }, (f) => {
    const result = f.run('2\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Check service status and Docker permissions/);
    assert.doesNotMatch(result.calls, /systemctl enable|curl | up /);
  }));

test('declining startup of a stopped system daemon leaves it stopped', () =>
  using({ daemonStopped: true }, (f) => {
    const result = f.run('2\nn\n');
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.calls, /systemctl enable|curl | up /);
  }));

function documentedCommand() {
  const readme = fs.readFileSync(path.join(source, 'README.md'), 'utf8');
  return readme.match(/^bash <\(curl .+\/install\.sh .+\)$/m)[0];
}

test('the documented short command pins latest and reuses the pin without asking for a version', () =>
  using({}, (f) => {
    const target = path.join(f.root, 'downloaded install');
    const result = f.runBash(['-c', documentedCommand()], `2\n${posix(target)}\n\n\n\n\n\n`);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /^\s*Nowluma — 1\. 简体中文 {2}2\. English/);
    const directory = path.join(target, 'deploy');
    assert.deepEqual(fs.readdirSync(directory).sort(), ['.env', 'docker-compose.yml', 'manage.sh']);
    const settings = path.join(directory, '.env');
    const pinned = `wsxyt/nowluma@${f.env.PULL_DIGEST}`;
    const before = fs.readFileSync(settings, 'utf8');
    assert.match(before, /^NOWLUMA_IMAGE=wsxyt\/nowluma@sha256:[a-f0-9]{64}$/m);
    assert.ok(before.includes(`NOWLUMA_IMAGE=${pinned}\n`));
    if (process.platform !== 'win32') assert.equal(fs.statSync(settings).mode & 0o777, 0o600);
    assert.deepEqual(
      [...result.calls.matchAll(/^curl .*?(https:\/\/\S+)/gm)].map((match) => match[1]),
      ['install.sh', 'docker-compose.yml', 'manage.sh'].map((file) => `https://nowluma.github.io/NowLuma/${file}`),
    );
    assert.match(result.calls, /^docker pull wsxyt\/nowluma:latest$/m);
    assert.match(result.stdout, /pull layer progress/);
    assert.ok(result.calls.includes(`image ${pinned}\n`));
    assert.match(result.calls, / up -d --no-build --pull never --wait/);
    assert.doesNotMatch(result.calls, /compose .* pull /);
    f.env.PULL_DIGEST = `sha256:${'b'.repeat(64)}`;
    const rerun = f.cloud(`2\n${posix(target)}\n`);
    assert.equal(rerun.status, 0, rerun.stderr + rerun.stdout);
    assert.doesNotMatch(rerun.calls, /docker pull .*:latest/);
    assert.ok(rerun.calls.includes(`image ${pinned}\n`));
    assert.equal(fs.readFileSync(settings, 'utf8'), before);
    assert.doesNotMatch(result.calls, /codeload|--build|down -v|apt-get|systemctl/);
  }));

test('the documented command does not execute a partial installer transfer', () =>
  using({ failAsset: 'install.sh' }, (f) => {
    const result = f.runBash(['-c', documentedCommand()], '2\n');
    assert.notEqual(result.status, 0);
    assert.match(result.calls, /curl .*https:\/\/nowluma\.github\.io\/NowLuma\/install\.sh/);
    assert.doesNotMatch(result.calls, /docker |manage\.sh/);
    assert.doesNotMatch(result.stderr, /Language/);
  }));

test('a default image pull failure or missing digest never saves a deployment', () => {
  for (const options of [{ failPull: true }, { pullDigest: '' }]) {
    using(options, (f) => {
      const target = path.join(f.root, 'failed default install');
      const result = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`);
      assert.equal(result.status, options.failPull ? 3 : 1);
      assert.match(result.stderr, options.failPull ? /proxyconnect.*no route to host|daemon network and proxy/ : /single image digest/);
      assert.deepEqual(fs.readdirSync(target), []);
      assert.doesNotMatch(result.calls, / up |compose .* pull /);
    });
  }
});

test('an incomplete bundle is not committed or started', () =>
  using({ failAsset: 'manage.sh' }, (f) => {
    const target = path.join(f.root, 'incomplete install');
    const result = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Deployment download failed/);
    assert.deepEqual(fs.readdirSync(target), []);
    assert.doesNotMatch(result.calls, / pull | up /);
  }));

test('a failed first pull leaves the directory ready to retry with another version', () =>
  using({ failPull: true }, (f) => {
    const target = path.join(f.root, 'unpublished image');
    const result = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /manifest unknown/);
    assert.match(result.stderr, /Could not pull wsxyt\/nowluma:2\.5\.0-rc\.1/);
    assert.doesNotMatch(result.stdout, /Nowluma is running/);
    assert.doesNotMatch(result.calls, /--build| up | down /);
    assert.deepEqual(fs.readdirSync(target), []);

    f.env.FAIL_PULL = '0';
    const retry = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`, ['--version', '2.5.0-rc.2']);
    assert.equal(retry.status, 0, retry.stderr + retry.stdout);
    assert.equal(retry.calls.match(/ pull nowluma/g)?.length, 1);
    assert.match(retry.calls, / pull nowluma[\s\S]* up -d --no-build --pull never --wait/);
    assert.match(fs.readFileSync(path.join(target, 'deploy', '.env'), 'utf8'), /NOWLUMA_IMAGE=wsxyt\/nowluma:2\.5\.0-rc\.2\n/);
  }));

test('a new directory cannot replace another Nowluma deployment on the same daemon', () =>
  using({ existingProject: true }, (f) => {
    const target = path.join(f.root, 'another install');
    const result = f.cloud(`2\n${posix(target)}\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already has a Nowluma container/);
    assert.doesNotMatch(result.calls, /curl | pull | up | down /);
    assert.equal(fs.existsSync(target), false);
  }));

test('a cloud rerun preserves a configured source installation and does not fetch over it', () =>
  using({}, (f) => {
    const settings = path.join(f.deploy, '.env');
    const config = 'WEBUI_PORT=6099\nCUSTOM=keep\n';
    fs.writeFileSync(settings, config);
    for (const file of ['manage.sh', 'docker-compose.yml'])
      fs.appendFileSync(path.join(f.deploy, file), '\n# original source deployment\n');
    const result = f.cloud(`2\n${posix(path.dirname(f.deploy))}\n`);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(fs.readFileSync(settings, 'utf8'), config);
    assert.match(result.calls, /image nowluma:local/);
    assert.match(result.calls, /--build/);
    assert.doesNotMatch(result.calls, /curl | pull | down /);
    for (const file of ['manage.sh', 'docker-compose.yml'])
      assert.match(fs.readFileSync(path.join(f.deploy, file), 'utf8'), /# original source deployment/);
    const mismatch = f.cloud(`2\n${posix(path.dirname(f.deploy))}\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(mismatch.status, 1);
    assert.doesNotMatch(mismatch.calls, /curl |--build| pull | up /);
  }));

test('daily published commands reuse the saved image, settings and QQ HOME without rebuilding or pulling', () =>
  using({}, (f) => {
    const target = path.join(f.root, 'daily commands');
    const directory = path.join(target, 'deploy');
    const install = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(install.status, 0, install.stderr + install.stdout);
    const settings = path.join(directory, '.env');
    const before = fs.readFileSync(settings, 'utf8');
    const reinstall = f.cloud(`2\n${posix(target)}\n`);
    assert.equal(reinstall.status, 0, reinstall.stderr + reinstall.stdout);
    assert.doesNotMatch(reinstall.calls, /curl |--build/);
    assert.match(reinstall.calls, / pull nowluma/);
    const mismatch = f.cloud(`2\n${posix(target)}\n`, ['--version', '2.5.0-rc.2']);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /Existing settings will not be overwritten/);
    assert.doesNotMatch(mismatch.calls, /curl | pull | up /);
    const restart = f.manage(directory, 'restart');
    const stop = f.manage(directory, 'stop');
    const start = f.manage(directory, 'start');
    const logs = f.manage(directory, 'logs');
    const doctor = f.manage(directory, 'doctor');
    for (const result of [restart, stop, start, logs, doctor]) {
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.doesNotMatch(result.calls, / pull nowluma|--build|down (-v|--volumes)|volume (rm|prune)/);
    }
    assert.match(restart.calls, / restart[\s\S]* up -d --no-recreate --no-build --pull never --wait/);
    assert.match(stop.calls, / down\n/);
    assert.match(start.calls, / up -d --no-build --pull never --wait/);
    assert.match(logs.calls, / logs --follow --tail=100 nowluma/);
    assert.match(doctor.calls, /--user 1000:1000 -T nowluma/);
    assert.equal(fs.readFileSync(settings, 'utf8'), before);
    const compose = fs.readFileSync(path.join(directory, 'docker-compose.yml'), 'utf8');
    assert.match(compose, /^name: nowluma$/m);
    for (const mapping of ['config:/app/config', 'data:/app/data', 'logs:/app/logs', 'qq-home:/home/nowluma'])
      assert.ok(compose.includes(`- ${mapping}\n`));
    assert.match(compose, /- SYS_PTRACE/);
    assert.doesNotMatch(compose, /^\s+build:|\bprivileged:/m);
  }));

test('public access requires confirmation and publishes only the console', () =>
  using({}, (f) => {
    const settings = path.join(f.deploy, '.env');
    const declined = f.run('2\n3\n\n');
    assert.equal(declined.status, 0);
    assert.equal(fs.existsSync(settings), false);
    assert.doesNotMatch(declined.calls, / up /);
    const accepted = f.run('2\n3\ny\n\n\n\n\n');
    assert.equal(accepted.status, 0, accepted.stderr);
    const config = fs.readFileSync(settings, 'utf8');
    assert.match(config, /^BIND_ADDRESS=127\.0\.0\.1$/m);
    assert.match(config, /^WEBUI_BIND_ADDRESS=0\.0\.0\.0$/m);
    assert.match(accepted.stdout, /HTTPS.*firewall/);
  }));

test('the registered menu works from another directory and an explicit update only persists after health', () =>
  using({ nonRoot: true }, (f) => {
    const target = path.join(f.root, 'console install');
    const setup = f.cloud(`2\n${posix(target)}\n\n\n\n\n\n`, ['--version', '2.5.0-rc.1']);
    assert.equal(setup.status, 0, setup.stderr);
    const menu = f.runBash(['-c', 'cd / && nowluma'], 'invalid\n5\n0\n');
    assert.equal(menu.status, 0, menu.stderr);
    assert.match(menu.stdout, /5\. Diagnostics/);
    assert.match(menu.calls, /nowluma-healthcheck/);
    const settings = path.join(target, 'deploy', '.env');
    const before = fs.readFileSync(settings, 'utf8');
    f.env.FAIL_PULL = '1';
    const pull = f.runBash(['-c', 'nowluma update 2.5.1']);
    assert.equal(pull.status, 3, pull.stderr);
    assert.doesNotMatch(pull.calls, / up /);
    assert.equal(fs.readFileSync(settings, 'utf8'), before);
    f.env.FAIL_PULL = '0';
    f.env.FAIL_START = '1';
    const failed = f.runBash(['-c', 'nowluma update 2.5.1']);
    assert.notEqual(failed.status, 0);
    assert.equal(fs.readFileSync(settings, 'utf8'), before);
    f.env.FAIL_START = '0';
    const updated = f.runBash(['-c', 'nowluma update 2.5.1']);
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(updated.calls, / pull nowluma[\s\S]* up .*--wait/);
    assert.match(updated.calls, / up -d .*--wait[^\n]*\nimage wsxyt\/nowluma:2\.5\.1\n/);
    assert.equal(fs.readFileSync(settings, 'utf8'), before.replace('wsxyt/nowluma:2.5.0-rc.1', 'wsxyt/nowluma:2.5.1'));
  }));

test('registering a legacy installation preserves its scripts and the old manager can read the upgraded pin', () =>
  using({}, (f) => {
    const target = path.join(f.root, 'rc2');
    const directory = path.join(target, 'deploy');
    fs.mkdirSync(directory, { recursive: true });
    const originalManager = '#!/usr/bin/env bash\n# Retained legacy file\n';
    fs.writeFileSync(path.join(directory, 'manage.sh'), originalManager);
    fs.copyFileSync(path.join(f.deploy, 'docker-compose.yml'), path.join(directory, 'docker-compose.yml'));
    const settings = path.join(directory, '.env');
    const originalSettings = `NOWLUMA_IMAGE=${image}\nCUSTOM=preserved\n`;
    fs.writeFileSync(settings, originalSettings);
    const reinstall = f.cloud(`2\n${posix(target)}\n`);
    assert.equal(reinstall.status, 0, reinstall.stderr);
    assert.equal(fs.readFileSync(settings, 'utf8'), originalSettings);
    const update = f.runBash(['-c', 'cd / && nowluma update 2.5.1']);
    assert.equal(update.status, 0, update.stderr);
    assert.equal(fs.readFileSync(settings, 'utf8'), originalSettings.replace('2.5.0-rc.1', '2.5.1'));
    assert.equal(fs.readFileSync(path.join(directory, 'manage.sh'), 'utf8'), originalManager);
  }));
