// PR gate for `.github/workflows/pr.yml`.
//
//   PR_TITLE="feat(webui): ..." PR_BODY="$(cat body.md)" node .github/scripts/pr-check.cjs
//
// The workflow checks out the pull request's *base* commit and passes the title
// and body as environment variables, so this policy runs from trusted code with
// the read-only token and never needs a secret — forks included.

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = path.resolve(__dirname, '..', 'pull_request_template.md');
const TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];
const TITLE =
  /^([a-z]+)(?:\(([a-z0-9][a-z0-9._/-]*)\))?(!)?: (\S(?:.*\S)?)$/;

// The template must carry every entry; pr-check.test.cjs fails if it drifts.
const REQUIRED_CHECKS = [
  '`pnpm typecheck` 与 `pnpm lint` 通过',
  '`pnpm test` 通过，相关测试已补充或更新',
  '已在本地或隔离环境中复现本次改动（附命令与结果）',
  '未包含真实账号、令牌、密码、用户 HOME 或未脱敏抓包',
  'PR 标题符合 Conventional Commits',
];
const SECTIONS = ['## 关联 Issue', '## 变更说明', '## 验证'];

/** Markdown with HTML comments and fenced code removed, so placeholders never count. */
function prose(markdown) {
  let fence = null;
  return (markdown || '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .split(/\r?\n/)
    .filter((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        return false;
      }
      if (marker) {
        fence = marker[1];
        return false;
      }
      return true;
    })
    .join('\n');
}

function section(body, heading) {
  const lines = prose(body).split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const content = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##?[^#]/.test(line.trim())) break;
    content.push(line);
  }
  return content.join('\n');
}

function titleProblem(title) {
  const match = TITLE.exec((title || '').trim());
  if (!match) {
    return 'PR 标题必须是 Conventional Commits，例如 `feat(webui): add demo console`。';
  }
  if (!TYPES.includes(match[1])) {
    return `PR 标题类型 \`${match[1]}\` 不在允许范围内：${TYPES.join('、')}。`;
  }
  return null;
}

function bodyProblems(body) {
  const problems = [];
  const text = prose(body);

  for (const heading of SECTIONS) {
    if (!text.split('\n').some((line) => line.trim() === heading)) {
      problems.push(`PR 正文缺少 \`${heading}\` 小节。`);
    }
  }

  const description = section(body, '## 变更说明');
  if (description !== null && !description.trim()) {
    problems.push('`## 变更说明` 需要写明本 PR 做了什么、为什么。');
  }

  for (const label of REQUIRED_CHECKS) {
    const line = text.split('\n').find((candidate) => {
      const item = /^\s*-\s*\[([ xX])\]\s*(.*)$/.exec(candidate);
      return item && item[2].includes(label);
    });
    if (!line) {
      problems.push(`PR 正文缺少检查项：${label}。`);
    } else if (/^\s*-\s*\[ \]/.test(line)) {
      problems.push(`PR 检查项尚未勾选：${label}。`);
    }
  }

  const verification = section(body, '## 验证');
  if (
    verification !== null &&
    !verification
      .split('\n')
      .filter((line) => !/^\s*-\s*\[[ xX]\]/.test(line))
      .join('')
      .trim()
  ) {
    problems.push('`## 验证` 需要写下实际运行的命令与结果。');
  }

  return problems;
}

function main() {
  const title = process.env.PR_TITLE ?? '';
  const body = process.env.PR_BODY ?? '';
  const problems = [titleProblem(title), ...bodyProblems(body)].filter(Boolean);
  if (problems.length === 0) {
    console.log(`PR check passed: ${title.trim()}`);
    return;
  }
  console.error('PR 检查未通过：');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`模板：${TEMPLATE}`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = { REQUIRED_CHECKS, SECTIONS, TYPES, bodyProblems, prose, titleProblem, TEMPLATE };
