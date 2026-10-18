# just-flf 计划 1：仓库清理与三个独立工具

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理仓库里的内部信息与历史文档位置，并交付 `workspace.js`、`scope.js`、`conformance.js` 三个零依赖工具及其单测。

**Architecture:** 新 skill 目录 `just-flf/` 与旧 `just-fe/` 并存，本计划只往 `just-flf/tools/` 写新工具；旧目录只做内部信息清理，在计划 4 安装切换时删除。每个工具是一个独立的 CommonJS CLI，输出 JSON 到 stdout、日志到 stderr，全部用 `execFileSync` 调只读 git 命令，测试在系统临时目录里造 git 仓。

**Tech Stack:** Node ≥ 18（本机 22）、`node:test`、`node:assert/strict`、git ≥ 2.30；无任何 npm 依赖。

**Spec:** `docs/specs/2026-10-18-just-flf-design.md`（第 7.1、7.3、7.4、7.5、8.1、9 节）

**计划拆分：** 本计划是 4 份中的第 1 份。后续：计划 2 `state.js` 与角色卡 / 清单格式约定；计划 3 编排层与执行层文档；计划 4 场景测试、安装卸载、真实试跑。

## 执行结果与偏差（2026-10-18）

本计划已按「子 agent 实现 + 逐任务评审 + 整体终审」执行完毕，未提交（提交由用户决定），工具测试 57 条全部通过。执行中经评审发现计划内代码的缺陷并作出裁定，**最终接口以规格第 7.1、7.3、7.4、7.5 节为准**，下文各任务的 Interfaces 与代码块保留为原始计划，与最终实现存在以下差异：

- 测试命令改为 `node --test tests/just-flf/tools/*.test.js`（Node 22 不接受直接传目录）。
- `workspace.js`：新增 `--workspace <file>`；多个候选按「是否包含当前仓」过滤；新增问题 id `no_repos`；工作区结构异常 → `fix_workspace`；`devDependencies` 里的后端框架不计入泳道判定；`create_workspace` 问题附带 `repos[{ path, lane }]`。
- `scope.js`：`--files` 可选（缺省时 `requirementFiles` / `outOfScope` 为 `null`，表示未判越界）；`--repo` 必须是仓库根；基线与仓库不符 → 退出码 2；目录前缀无需尾斜杠；任意位置 `--help`。
- `conformance.js`：path 必须以 `/` 开头且发送前校验同源；不跟随重定向；未知类型 → `PARTIAL`；响应体鉴权码（`--auth-codes` / `envelope.authCodes`）→ `UNVERIFIED`；新增 `response.schema`；502–504 → `UNVERIFIED`；204 空响应处理；错误探针必须有期望值；参数与输入非法 → 退出码 2。
- 测试辅助 `helpers.js`：子进程清除 `GIT_DIR` 等重定向变量，测试用 git 关闭签名与 hooks。
- 留给计划 2：画像中的响应体格式如何传给 `conformance.js`；`lane_unknown` / `lane_conflict` 的回答如何回传（`state.js init` 参数）；`scope.json` 的 `outOfScope: null` 必须按「未判越界」处理。

## Global Constraints

- Node ≥ 18，零 npm 依赖，文件头 `#!/usr/bin/env node` + `'use strict'`，CommonJS。
- 测试命令：`node --test tests/just-flf/tools/*.test.js`；只用 `node:test` 与 `node:assert/strict`。
- 工具里的 git 调用只允许只读命令（`rev-parse` / `status` / `diff` / `ls-files` / `ls-tree`），一律 `execFileSync('git', [...])`，不经 shell。
- 退出码：0 正常；1 仅 `conformance.js` 有 FAIL 时使用；2 参数或环境错误。
- 不写死任何项目值：不出现具体域名、`VITE_APP_API_TARGET`、`新需求/`、Gitee Go 格式。
- 文件名全部英文。
- 流程与本计划都不替用户执行 git 写操作；每个任务末尾的「检查点」列出建议的提交命令，由用户执行。
- 在 Cursor 沙箱里跑测试时，需要允许写系统临时目录并监听 `127.0.0.1`（`conformance` 测试），否则会出现 `Operation not permitted`。

## Review Focus

1. 工作区或仓库路径含中文与空格 → 工具必须原样处理路径，不转义、不拆分（Task 2 测试「中文目录名与绝对路径」、Task 3 测试「中文路径原样输出」）。
2. 刚 `git init`、还没有任何提交的仓库 → `scope.js` 能拍基线、能对比，不报错（Task 3 测试「没有任何提交的新仓」）。
3. `.code-workspace` 里 `folders` 用绝对路径或缺少 `path` → 正常识别或记入 notes，不崩溃（Task 2 测试「中文目录名与绝对路径」）。
4. 联调环境连不上或超时 → 判 `UNVERIFIED` 并给原因，不崩溃（Task 4 测试「连接被拒绝」）。
5. `files.txt` 带 CRLF、`./` 前缀、注释行 → 规范化后再比对（Task 3 测试「files.txt 支持目录前缀…」）。

---

### Task 1: 仓库清理（历史文档迁移与内部信息清除）

**Files:**
- Move: `just-fe/docs/全栈流程设计-20261016.md` → `docs/history/2026-10-16-fullstack-design.md`
- Move: `just-fe/docs/研讨纪要-混合编排-20260922.md` → `docs/history/2026-09-22-hybrid-orchestration-notes.md`
- Move: `just-fe/todo.md` → `docs/CHANGELOG.md`
- Modify: `docs/history/2026-10-16-fullstack-design.md`、`docs/CHANGELOG.md`、`just-fe/README.md:77`、`just-fe/tools/contract-conformance.js:8`
- Delete: `.DS_Store`
- Create: `.gitignore`

**Interfaces:**
- Consumes: 无
- Produces: 仓库根目录 `docs/history/`、`docs/CHANGELOG.md`、`.gitignore`；后续计划在 `docs/CHANGELOG.md` 追加记录。

> 本任务已于 2026-10-18 执行完毕。为避免本计划文件自身把内部信息带回仓库，下文的检索模式与映射表原文已改为描述性占位；执行时使用的原文只保存在不入库的 `.superpowers/sdd/` 任务说明里。

- [ ] **Step 1: 确认清理前的命中情况**

Run:
```bash
rg -n "<内部检索模式：原内部域名 | 凭证位置关键词 | 原前端仓名 | 原后端仓名 | 原工作区名 | 本机用户路径 | 原业务名>" .
```
Expected: 命中 `just-fe/todo.md`（4 处）、`just-fe/README.md`（1 处）、`just-fe/docs/全栈流程设计-20261016.md`（31 处）、`just-fe/tools/contract-conformance.js`（1 处）。

- [ ] **Step 2: 迁移文件**

```bash
mkdir -p docs/history
mv "just-fe/docs/全栈流程设计-20261016.md" docs/history/2026-10-16-fullstack-design.md
mv "just-fe/docs/研讨纪要-混合编排-20260922.md" docs/history/2026-09-22-hybrid-orchestration-notes.md
rmdir just-fe/docs
mv just-fe/todo.md docs/CHANGELOG.md
rm -f .DS_Store
```

- [ ] **Step 3: 删除凭证位置描述**

删除以下两行（整行删除）：
- `docs/CHANGELOG.md` 中「待观察」列表里描述部署流水线配置含明文凭证的那一条
- `docs/history/2026-10-16-fullstack-design.md` 中「十一、开放问题」表里描述同一问题的那一行

- [ ] **Step 4: 按映射表替换内部信息**

在 `docs/CHANGELOG.md`、`docs/history/2026-10-16-fullstack-design.md`、`just-fe/README.md`、`just-fe/tools/contract-conformance.js` 中按顺序全文替换（先替换长串）：

| 原文 | 替换为 |
|------|--------|
| 原内部网关域名 | `dev-gateway.example.com` |
| 原内部模块域名模式 | `dev-{module}.example.com` |
| 原工作区名 | `team-fullstack` |
| 原前端仓名 | `web-app` |
| 原后端仓名 | `server-platform` |
| 本机用户路径前缀 | `~/dev/` |
| 原业务需求名 | `示例需求` |

- [ ] **Step 5: 创建 `.gitignore`**

```gitignore
.DS_Store
node_modules/
.just-flf/
```

- [ ] **Step 6: 验证清理结果**

Run:
```bash
rg -n "<同 Step 1 的内部检索模式>" .
ls docs/history docs/CHANGELOG.md .gitignore && test ! -e just-fe/docs && test ! -e just-fe/todo.md && test ! -e .DS_Store && echo CLEAN
```
Expected: `rg` 无输出；最后一行输出 `CLEAN`。

- [ ] **Step 7: 检查点（由用户提交）**

```bash
git add -A docs .gitignore just-fe
git commit -m "chore: 历史文档迁至仓库根 docs/，清除内部域名与仓库名，新增 .gitignore"
```

---

### Task 2: 测试辅助与 `workspace.js`

**Files:**
- Create: `tests/just-flf/tools/helpers.js`
- Create: `tests/just-flf/tools/workspace.test.js`
- Create: `just-flf/tools/workspace.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `helpers.js` 导出 `{ TOOLS, mkTmp(prefix?) → string(realpath), write(dir, rel, content?) → string(绝对路径), git(dir, ...args) → string, gitInit(dir) → dir, commitAll(dir, msg?) → sha, runTool(name, args, opts?) → { code, stdout, stderr, json }, runToolAsync(name, args, opts?) → Promise<同上> }`
  - `workspace.js` CLI：`node workspace.js [--cwd <dir>] [--home <dir>]` 输出 `{ workspaceMode: "workspace"|"single-repo"|null, workspaceFile, workspaceRoot, repos: [{ lane: "fe"|"be"|"unknown", laneBy, name, path, profile, dirty }], paradigm, notes: string[], questions: [{ id, message, ... }] }`；question id 取值 `paradigm_path` / `choose_workspace` / `fix_workspace` / `create_workspace` / `lane_unknown` / `lane_conflict`
  - `node workspace.js config --paradigm <路径|none> [--home <dir>]` 写 `<home>/.just-flf.json` 的 `paradigmPath`
  - 模块导出 `{ stripJsonc(text) → string, detectLane(dir) → { lane, by }, detect(opts) → 上述对象 }`

- [ ] **Step 1: 写测试辅助 `tests/just-flf/tools/helpers.js`**

```js
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync, spawn } = require('child_process')

const TOOLS = path.resolve(__dirname, '../../../just-flf/tools')

function mkTmp(prefix = 'flf-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

function write(dir, rel, content = '') {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  return p
}

function git(dir, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' }).trim()
}

function gitInit(dir) {
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '--template=')
  return dir
}

function commitAll(dir, msg = 'c') {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '--allow-empty', '-m', msg)
  return git(dir, 'rev-parse', 'HEAD')
}

function parse(stdout) {
  try { return JSON.parse(stdout) } catch (_) { return null }
}

function runTool(name, args, opts = {}) {
  const r = spawnSync(process.execPath, [path.join(TOOLS, name), ...args], {
    encoding: 'utf8', cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json: parse(r.stdout) }
}

function runToolAsync(name, args, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(TOOLS, name), ...args], {
      cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => resolve({ code, stdout, stderr, json: parse(stdout) }))
  })
}

module.exports = { TOOLS, mkTmp, write, git, gitInit, commitAll, runTool, runToolAsync }
```

- [ ] **Step 2: 写失败的测试 `tests/just-flf/tools/workspace.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { mkTmp, write, gitInit, runTool } = require('./helpers')

function feRepo(dir) {
  gitInit(dir)
  write(dir, 'package.json', JSON.stringify({ dependencies: { vue: '^3.4.0' } }))
  return dir
}
function beRepo(dir) {
  gitInit(dir)
  write(dir, 'pom.xml', '<project/>')
  return dir
}
function detect(cwd, home) {
  return runTool('workspace.js', ['--cwd', cwd, '--home', home])
}

test('JSONC 格式的 .code-workspace（注释 + 尾逗号）能解析', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'web'))
  beRepo(path.join(root, 'server'))
  write(root, 'team.code-workspace', '{\n  // 工作区\n  "folders": [\n    {"path": "web"},\n    {"path": "server"}, /* 后端 */\n  ],\n}\n')
  const r = detect(root, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'workspace')
  assert.equal(r.json.workspaceRoot, root)
  assert.deepEqual(r.json.repos.map(x => [x.name, x.lane]), [['web', 'fe'], ['server', 'be']])
})

test('只有 build.gradle 的后端仓判为 be，不崩溃', () => {
  const root = mkTmp()
  const be = path.join(root, 'svc')
  gitInit(be)
  write(be, 'build.gradle', '')
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'svc' }] }))
  const r = detect(root, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.repos[0].lane, 'be')
})

test('带 package.json（仅工具链依赖）的 Java 仓判为 be', () => {
  const root = mkTmp()
  const be = beRepo(path.join(root, 'svc'))
  write(be, 'package.json', JSON.stringify({ devDependencies: { husky: '^9.0.0' } }))
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'svc' }] }))
  assert.equal(detect(root, root).json.repos[0].lane, 'be')
})

test('有画像时以画像为准', () => {
  const root = mkTmp()
  const repo = feRepo(path.join(root, 'app'))
  write(repo, '.claude/be-profile.md', '# be')
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'app' }] }))
  const r = detect(root, root).json.repos[0]
  assert.equal(r.lane, 'be')
  assert.equal(r.laneBy, 'profile')
  assert.equal(r.profile, path.join(repo, '.claude', 'be-profile.md'))
})

test('没有 .code-workspace 且当前目录是 git 仓 → 单仓模式', () => {
  const root = mkTmp()
  const repo = feRepo(path.join(root, 'web'))
  const r = detect(repo, root).json
  assert.equal(r.workspaceMode, 'single-repo')
  assert.equal(r.workspaceRoot, repo)
  assert.equal(r.repos[0].lane, 'fe')
})

test('没有 .code-workspace 且当前目录不是 git 仓 → 提示创建，不给 workspaceRoot', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'web'))
  beRepo(path.join(root, 'server'))
  const r = detect(root, root).json
  assert.equal(r.workspaceRoot, null)
  const q = r.questions.find(x => x.id === 'create_workspace')
  assert.ok(q, JSON.stringify(r.questions))
  assert.equal(q.suggestion.path, path.join(root, `${path.basename(root)}.code-workspace`))
  assert.deepEqual(q.suggestion.content.folders.map(f => f.path).sort(), ['server', 'web'])
})

test('找到多个 .code-workspace → 请用户选择', () => {
  const root = mkTmp()
  write(root, 'a.code-workspace', '{"folders":[]}')
  write(root, 'b.code-workspace', '{"folders":[]}')
  const r = detect(root, root).json
  assert.equal(r.workspaceRoot, null)
  assert.equal(r.questions.find(x => x.id === 'choose_workspace').candidates.length, 2)
})

test('需求处理范式：未配置时提问，配置后返回路径，配置 none 后不再提问', () => {
  const root = mkTmp()
  const repo = feRepo(path.join(root, 'web'))
  assert.ok(detect(repo, root).json.questions.some(q => q.id === 'paradigm_path'))
  const p = write(root, 'notes/需求处理范式.md', '# 范式')
  assert.equal(runTool('workspace.js', ['config', '--paradigm', p, '--home', root]).code, 0)
  let r = detect(repo, root).json
  assert.equal(r.paradigm, p)
  assert.ok(!r.questions.some(q => q.id === 'paradigm_path'))
  assert.equal(runTool('workspace.js', ['config', '--paradigm', 'none', '--home', root]).code, 0)
  r = detect(repo, root).json
  assert.equal(r.paradigm, null)
  assert.ok(!r.questions.some(q => q.id === 'paradigm_path'))
})

test('中文目录名与绝对路径的 folders 项；缺 path 的项记入 notes', () => {
  const root = mkTmp()
  const fe = feRepo(path.join(root, '前端 仓'))
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: fe }, { name: '只有名字' }] }))
  const r = detect(root, root).json
  assert.equal(r.repos.length, 1)
  assert.equal(r.repos[0].path, fe)
  assert.ok(r.notes.some(n => n.includes('缺少 path')))
})

test('无法判定泳道时提问', () => {
  const root = mkTmp()
  const repo = path.join(root, 'misc')
  gitInit(repo)
  write(repo, 'README.md', 'x')
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'misc' }] }))
  assert.ok(detect(root, root).json.questions.some(q => q.id === 'lane_unknown'))
})

test('识别到两个前端仓 → 提问选择', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'web1'))
  feRepo(path.join(root, 'web2'))
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'web1' }, { path: 'web2' }] }))
  assert.ok(detect(root, root).json.questions.some(q => q.id === 'lane_conflict'))
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test tests/just-flf/tools/workspace.test.js`
Expected: FAIL（脚本不存在，`r.code` 为 1、`r.json` 为 null）

- [ ] **Step 4: 实现 `just-flf/tools/workspace.js`**

```js
#!/usr/bin/env node
'use strict'
/**
 * 工作区识别（triage 开头调用）。
 *
 *   node workspace.js [--cwd <dir>] [--home <dir>]
 *   node workspace.js config --paradigm <路径|none> [--home <dir>]
 *
 * 识别命令只读，输出 JSON 到 stdout：
 *   { workspaceMode, workspaceFile, workspaceRoot, repos[], paradigm, notes[], questions[] }
 * 工作区根目录：.code-workspace 所在目录；找不到时若当前目录在 git 仓内则为单仓模式；否则提示创建。
 * config 子命令写用户级配置 <home>/.just-flf.json。
 * 退出码：0 正常（有 questions 也是 0）；2 参数错误。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const FE_DEPS = ['vue', 'react', 'react-dom', 'preact', '@angular/core', 'svelte', 'solid-js', 'next', 'nuxt']
const BE_DEPS = ['express', 'koa', '@nestjs/core', 'fastify', '@hapi/hapi', 'egg', 'hono']
const BE_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod', 'pyproject.toml']

function usage(msg) {
  process.stderr.write(`${msg}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const out = { cmd: 'detect', cwd: process.cwd(), home: os.homedir() }
  let i = 0
  if (argv[0] === 'config') { out.cmd = 'config'; i = 1 }
  for (; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if (a === '-h' || a === '--help') { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0] + '*/\n'); process.exit(0) }
    if (v === undefined) usage(`${a} 缺少值`)
    if (a === '--cwd') out.cwd = v
    else if (a === '--home') out.home = v
    else if (a === '--paradigm') out.paradigm = v
    else usage(`未知参数 ${a}`)
    i++
  }
  return out
}

function skipWsAndComments(s, j) {
  for (;;) {
    while (j < s.length && /\s/.test(s[j])) j++
    if (s[j] === '/' && s[j + 1] === '/') { while (j < s.length && s[j] !== '\n') j++; continue }
    if (s[j] === '/' && s[j + 1] === '*') { j += 2; while (j < s.length && !(s[j] === '*' && s[j + 1] === '/')) j++; j += 2; continue }
    return j
  }
}

function stripJsonc(text) {
  const s = text.replace(/^\uFEFF/, '')
  let out = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const n = s[i + 1]
    if (inStr) {
      out += c
      if (c === '\\') { out += n; i++ } else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue }
    if (c === ',') {
      const j = skipWsAndComments(s, i + 1)
      if (s[j] === '}' || s[j] === ']') continue
    }
    out += c
  }
  return out
}

function git(dir, args) {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch (_) {
    return null
  }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return null }
}

function detectLane(dir) {
  const hasFeProfile = fs.existsSync(path.join(dir, '.claude', 'fe-profile.md'))
  const hasBeProfile = fs.existsSync(path.join(dir, '.claude', 'be-profile.md'))
  if (hasFeProfile !== hasBeProfile) return { lane: hasFeProfile ? 'fe' : 'be', by: 'profile' }
  const hasBeMarker = BE_MARKERS.some(f => fs.existsSync(path.join(dir, f)))
  const pkg = readJson(path.join(dir, 'package.json'))
  const deps = pkg ? Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) : []
  const feDeps = deps.some(d => FE_DEPS.includes(d))
  const beDeps = deps.some(d => BE_DEPS.includes(d))
  if (hasBeMarker && !feDeps) return { lane: 'be', by: 'build-file' }
  if (!hasBeMarker && feDeps && !beDeps) return { lane: 'fe', by: 'package.json' }
  if (!hasBeMarker && beDeps && !feDeps) return { lane: 'be', by: 'package.json' }
  return { lane: 'unknown', by: 'ambiguous' }
}

function describeRepo(dir) {
  const { lane, by } = detectLane(dir)
  const profilePath = path.join(dir, '.claude', lane === 'be' ? 'be-profile.md' : 'fe-profile.md')
  return {
    lane,
    laneBy: by,
    name: path.basename(dir),
    path: dir,
    profile: lane !== 'unknown' && fs.existsSync(profilePath) ? profilePath : null,
    dirty: !!git(dir, ['status', '--porcelain']),
  }
}

function findWorkspaceFiles(cwd, home) {
  let dir = cwd
  for (;;) {
    let found = []
    try { found = fs.readdirSync(dir).filter(f => f.endsWith('.code-workspace')) } catch (_) {}
    if (found.length) return found.sort().map(f => path.join(dir, f))
    const parent = path.dirname(dir)
    if (dir === home || parent === dir) return []
    dir = parent
  }
}

function readWorkspace(file, notes) {
  let ws
  try {
    ws = JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8')))
  } catch (e) {
    return { error: `无法解析 ${file}：${e.message}` }
  }
  const root = path.dirname(file)
  const folders = []
  for (const f of ws.folders || []) {
    if (!f || typeof f.path !== 'string') { notes.push(`忽略缺少 path 的 folders 项：${JSON.stringify(f)}`); continue }
    folders.push(path.resolve(root, f.path))
  }
  return { folders }
}

function childGitRepos(dir) {
  let names = []
  try {
    names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name)
  } catch (_) {}
  return names.sort().map(n => path.join(dir, n)).filter(p => fs.existsSync(path.join(p, '.git')))
}

function detect(opts) {
  const cwdAbs = path.resolve(opts.cwd)
  if (!fs.existsSync(cwdAbs)) usage(`目录不存在：${cwdAbs}`)
  const cwd = fs.realpathSync(cwdAbs)
  const home = fs.existsSync(opts.home) ? fs.realpathSync(opts.home) : path.resolve(opts.home)
  const out = { workspaceMode: null, workspaceFile: null, workspaceRoot: null, repos: [], paradigm: null, notes: [], questions: [] }

  const config = readJson(path.join(home, '.just-flf.json')) || {}
  if (config.paradigmPath === undefined) {
    out.questions.push({ id: 'paradigm_path', message: '需求处理范式文件在哪里？没有就回答「无」。确定后运行：node workspace.js config --paradigm <路径|none>' })
  } else if (config.paradigmPath) {
    if (fs.existsSync(config.paradigmPath)) out.paradigm = config.paradigmPath
    else out.notes.push(`配置的需求处理范式不存在：${config.paradigmPath}`)
  }

  const wsFiles = findWorkspaceFiles(cwd, home)
  if (wsFiles.length > 1) {
    out.questions.push({ id: 'choose_workspace', message: '找到多个 .code-workspace，请指定用哪一个', candidates: wsFiles })
    return out
  }
  if (wsFiles.length === 1) {
    const ws = readWorkspace(wsFiles[0], out.notes)
    if (ws.error) {
      out.questions.push({ id: 'fix_workspace', message: ws.error })
      return out
    }
    out.workspaceMode = 'workspace'
    out.workspaceFile = wsFiles[0]
    out.workspaceRoot = path.dirname(wsFiles[0])
    for (const dir of ws.folders) {
      if (!fs.existsSync(dir)) { out.notes.push(`目录不存在：${dir}`); continue }
      if (!fs.existsSync(path.join(dir, '.git'))) continue
      out.repos.push(describeRepo(dir))
    }
  } else {
    const top = git(cwd, ['rev-parse', '--show-toplevel'])
    if (!top) {
      const candidates = childGitRepos(cwd).map(describeRepo).filter(r => r.lane !== 'unknown')
      out.questions.push({
        id: 'create_workspace',
        message: '当前目录不是 git 仓，也没有找到 .code-workspace。请按建议创建后重新运行（也可以让编排者按建议内容代为创建）',
        suggestion: {
          path: path.join(cwd, `${path.basename(cwd)}.code-workspace`),
          content: { folders: candidates.map(r => ({ path: path.relative(cwd, r.path) || '.' })) },
        },
      })
      return out
    }
    out.workspaceMode = 'single-repo'
    out.workspaceRoot = fs.realpathSync(top)
    out.repos.push(describeRepo(out.workspaceRoot))
  }

  for (const r of out.repos.filter(x => x.lane === 'unknown')) {
    out.questions.push({ id: 'lane_unknown', message: `无法判定 ${r.name} 是前端仓还是后端仓，请指定`, repo: r.path })
  }
  for (const lane of ['fe', 'be']) {
    const same = out.repos.filter(r => r.lane === lane)
    if (same.length > 1) {
      out.questions.push({ id: 'lane_conflict', message: `识别到多个${lane === 'fe' ? '前端' : '后端'}仓，本流程一次只支持一个，请指定`, candidates: same.map(r => r.path) })
    }
  }
  return out
}

function writeConfig(opts) {
  if (!opts.paradigm) usage('缺 --paradigm <路径|none>')
  const file = path.join(opts.home, '.just-flf.json')
  const cur = readJson(file) || {}
  cur.paradigmPath = opts.paradigm === 'none' ? null : path.resolve(opts.paradigm)
  fs.writeFileSync(file, `${JSON.stringify(cur, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ written: file, config: cur }, null, 2)}\n`)
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.cmd === 'config') writeConfig(opts)
  else process.stdout.write(`${JSON.stringify(detect(opts), null, 2)}\n`)
}

module.exports = { stripJsonc, detectLane, detect }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test tests/just-flf/tools/workspace.test.js`
Expected: 11 个测试全部 PASS

- [ ] **Step 6: 检查点（由用户提交）**

```bash
git add tests/just-flf/tools/helpers.js tests/just-flf/tools/workspace.test.js just-flf/tools/workspace.js
git commit -m "feat(just-flf): workspace.js 工作区识别（JSONC、单仓模式、画像优先、创建提示）"
```

---

### Task 3: `scope.js`（基线快照与越界检测）

**Files:**
- Create: `tests/just-flf/tools/scope.test.js`
- Create: `just-flf/tools/scope.js`

**Interfaces:**
- Consumes: `helpers.js` 的 `mkTmp / write / gitInit / commitAll / runTool`
- Produces:
  - `node scope.js baseline --repo <path> --out <baseline.json>` → 写入并输出 `{ repo, head: string|null, createdAt, dirty: { "<相对路径>": "<sha1>"|null } }`
  - `node scope.js diff --repo <path> --baseline <baseline.json> --files <files.txt> --out <scope.json> [--exclude <相对路径>]...` → 写入并输出 `{ repo, baselineHead, head, changed: string[], preexisting: string[], requirementFiles: string[], outOfScope: string[] }`（数组均按字典序）
  - 计划 2 的 `state.js deliver` 读取 `scope.json` 的 `changed / preexisting / outOfScope`

- [ ] **Step 1: 写失败的测试 `tests/just-flf/tools/scope.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { mkTmp, write, gitInit, commitAll, runTool } = require('./helpers')

function setupRepo() {
  const root = mkTmp()
  const repo = gitInit(path.join(root, 'repo'))
  write(repo, 'a.txt', 'a\n')
  write(repo, 'b.txt', 'b\n')
  commitAll(repo, 'init')
  return { repo, base: path.join(root, 'baseline.json'), out: path.join(root, 'scope.json'), files: path.join(root, 'files.txt') }
}
function baseline(ctx) {
  const r = runTool('scope.js', ['baseline', '--repo', ctx.repo, '--out', ctx.base])
  assert.equal(r.code, 0, r.stderr)
  return r.json
}
function diff(ctx, filesTxt) {
  fs.writeFileSync(ctx.files, filesTxt)
  const r = runTool('scope.js', ['diff', '--repo', ctx.repo, '--baseline', ctx.base, '--files', ctx.files, '--out', ctx.out])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(ctx.out, 'utf8')), r.json)
  return r.json
}

test('基线之后已提交的越界文件会被检出（不依赖 base 分支）', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, 'in.js', 'x')
  write(ctx.repo, 'out.js', 'y')
  commitAll(ctx.repo, 'work')
  const s = diff(ctx, 'in.js\n')
  assert.deepEqual(s.changed, ['in.js', 'out.js'])
  assert.deepEqual(s.outOfScope, ['out.js'])
})

test('开工前已有且未被改动的脏文件归入 preexisting，不算越界', () => {
  const ctx = setupRepo()
  write(ctx.repo, 'a.txt', 'user wip\n')
  write(ctx.repo, 'wip.md', 'notes')
  baseline(ctx)
  write(ctx.repo, 'in.js', 'x')
  const s = diff(ctx, 'in.js\n')
  assert.deepEqual(s.changed, ['in.js'])
  assert.deepEqual(s.preexisting, ['a.txt', 'wip.md'])
  assert.deepEqual(s.outOfScope, [])
})

test('开工前已有的脏文件被再次改动 → 计入 changed 并判越界', () => {
  const ctx = setupRepo()
  write(ctx.repo, 'a.txt', 'user wip\n')
  baseline(ctx)
  write(ctx.repo, 'a.txt', 'agent touched\n')
  const s = diff(ctx, 'in.js\n')
  assert.deepEqual(s.changed, ['a.txt'])
  assert.deepEqual(s.outOfScope, ['a.txt'])
})

test('files.txt 支持目录前缀、./ 前缀、注释与 CRLF', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, 'src/views/list.vue', 'v')
  write(ctx.repo, 'b.txt', 'b2\n')
  write(ctx.repo, 'c.txt', 'c')
  const s = diff(ctx, '# 需求涉及文件\r\n./src/views/\r\nb.txt\r\n')
  assert.deepEqual(s.requirementFiles, ['src/views/', 'b.txt'])
  assert.deepEqual(s.outOfScope, ['c.txt'])
})

test('重命名的两端都计入 changed', () => {
  const ctx = setupRepo()
  baseline(ctx)
  fs.renameSync(path.join(ctx.repo, 'a.txt'), path.join(ctx.repo, 'a2.txt'))
  assert.deepEqual(diff(ctx, '').changed, ['a.txt', 'a2.txt'])
})

test('中文路径原样输出，不被转义', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, '页面/列表 页.vue', 'v')
  const s = diff(ctx, '页面/\n')
  assert.deepEqual(s.changed, ['页面/列表 页.vue'])
  assert.deepEqual(s.outOfScope, [])
})

test('始终排除 .just-flf/', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, '.just-flf/需求/state.json', '{}')
  assert.deepEqual(diff(ctx, '').changed, [])
})

test('--exclude 追加排除项', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, 'tmp/x.log', 'x')
  fs.writeFileSync(ctx.files, '')
  const r = runTool('scope.js', ['diff', '--repo', ctx.repo, '--baseline', ctx.base, '--files', ctx.files, '--out', ctx.out, '--exclude', 'tmp/'])
  assert.deepEqual(r.json.changed, [])
})

test('没有任何提交的新仓也能拍基线和对比', () => {
  const root = mkTmp()
  const repo = gitInit(path.join(root, 'fresh'))
  const ctx = { repo, base: path.join(root, 'b.json'), out: path.join(root, 's.json'), files: path.join(root, 'f.txt') }
  assert.equal(baseline(ctx).head, null)
  write(repo, 'new.js', 'x')
  const s = diff(ctx, 'new.js\n')
  assert.deepEqual(s.changed, ['new.js'])
  assert.deepEqual(s.outOfScope, [])
})

test('非 git 目录 → 退出码 2', () => {
  const root = mkTmp()
  assert.equal(runTool('scope.js', ['baseline', '--repo', root, '--out', path.join(root, 'b.json')]).code, 2)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/just-flf/tools/scope.test.js`
Expected: FAIL（脚本不存在）

- [ ] **Step 3: 实现 `just-flf/tools/scope.js`**

```js
#!/usr/bin/env node
'use strict'
/**
 * 改动范围与越界检测（只读 git）。
 *
 *   node scope.js baseline --repo <path> --out <baseline.json>
 *   node scope.js diff --repo <path> --baseline <baseline.json> --files <files.txt> --out <scope.json> [--exclude <相对路径>]...
 *
 * baseline：记录 HEAD 与开工时所有已修改 / 已暂存 / 未跟踪文件的内容哈希。
 * diff：changed = 自基线 HEAD 以来已提交的变化 ∪ 工作区变化 ∪ 未跟踪文件；
 *       基线里已有的文件仅当内容哈希变化时计入 changed，否则归入 preexisting；
 *       outOfScope = changed − files.txt（以 / 结尾的行按目录前缀匹配）；始终排除 .just-flf/。
 * 结果写入 --out 并输出到 stdout。退出码：0 正常；2 参数或环境错误。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ALWAYS_EXCLUDE = ['.just-flf/']

function fail(msg) {
  process.stderr.write(`${msg}\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const out = { cmd: argv[0], exclude: [] }
  if (out.cmd === '-h' || out.cmd === '--help') { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0] + '*/\n'); process.exit(0) }
  for (let i = 1; i < argv.length; i += 2) {
    const a = argv[i]
    const v = argv[i + 1]
    if (v === undefined) fail(`${a} 缺少值`)
    if (a === '--repo') out.repo = v
    else if (a === '--out') out.out = v
    else if (a === '--baseline') out.baseline = v
    else if (a === '--files') out.files = v
    else if (a === '--exclude') out.exclude.push(v)
    else fail(`未知参数 ${a}`)
  }
  if (!['baseline', 'diff'].includes(out.cmd)) fail('用法：scope.js baseline|diff …（--help 查看说明）')
  if (!out.repo || !out.out) fail('缺 --repo 或 --out')
  if (out.cmd === 'diff' && (!out.baseline || !out.files)) fail('diff 需要 --baseline 与 --files')
  return out
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

function splitZ(s) {
  return s.split('\0').filter(Boolean)
}

function headOf(repo) {
  try { return git(repo, ['rev-parse', '--verify', '-q', 'HEAD']).trim() || null } catch (_) { return null }
}

function workingChanges(repo, head) {
  const tracked = head
    ? splitZ(git(repo, ['diff', '--name-only', '-z', '--no-renames', 'HEAD']))
    : [
        ...splitZ(git(repo, ['diff', '--name-only', '-z', '--no-renames', '--cached'])),
        ...splitZ(git(repo, ['diff', '--name-only', '-z', '--no-renames'])),
      ]
  const untracked = splitZ(git(repo, ['ls-files', '--others', '--exclude-standard', '-z']))
  return [...new Set([...tracked, ...untracked])]
}

function hashFile(repo, rel) {
  try { return crypto.createHash('sha1').update(fs.readFileSync(path.join(repo, rel))).digest('hex') } catch (_) { return null }
}

function isExcluded(rel, excludes) {
  return excludes.some(e => {
    const dir = e.endsWith('/') ? e : `${e}/`
    return rel === e.replace(/\/$/, '') || rel.startsWith(dir)
  })
}

function readRequirementFiles(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/^\.\//, ''))
}

function inScope(rel, req) {
  return req.some(r => r === rel || (r.endsWith('/') && rel.startsWith(r)))
}

function writeOut(file, obj) {
  const json = `${JSON.stringify(obj, null, 2)}\n`
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(file, json)
  process.stdout.write(json)
}

function baseline(repo, opts) {
  const head = headOf(repo)
  const dirty = {}
  for (const rel of workingChanges(repo, head).sort()) dirty[rel] = hashFile(repo, rel)
  writeOut(opts.out, { repo, head, createdAt: new Date().toISOString(), dirty })
}

function diff(repo, opts) {
  const base = JSON.parse(fs.readFileSync(opts.baseline, 'utf8'))
  if (base.repo && path.resolve(base.repo) !== repo) process.stderr.write(`⚠️ 基线属于 ${base.repo}，当前对比的是 ${repo}\n`)
  const head = headOf(repo)
  const excludes = [...ALWAYS_EXCLUDE, ...opts.exclude]
  const candidates = new Set(workingChanges(repo, head))
  if (base.head && head && base.head !== head) {
    for (const f of splitZ(git(repo, ['diff', '--name-only', '-z', '--no-renames', base.head, head]))) candidates.add(f)
  } else if (!base.head && head) {
    for (const f of splitZ(git(repo, ['ls-tree', '-r', '--name-only', '-z', head]))) candidates.add(f)
  }
  for (const f of Object.keys(base.dirty || {})) candidates.add(f)

  const changed = []
  const preexisting = []
  for (const rel of [...candidates].sort()) {
    if (isExcluded(rel, excludes)) continue
    if (Object.prototype.hasOwnProperty.call(base.dirty || {}, rel) && hashFile(repo, rel) === base.dirty[rel]) {
      preexisting.push(rel)
      continue
    }
    changed.push(rel)
  }
  const requirementFiles = readRequirementFiles(opts.files)
  const outOfScope = changed.filter(f => !inScope(f, requirementFiles))
  writeOut(opts.out, { repo, baselineHead: base.head, head, changed, preexisting, requirementFiles, outOfScope })
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2))
  const repo = path.resolve(opts.repo)
  try { git(repo, ['rev-parse', '--git-dir']) } catch (_) { fail(`不是 git 仓：${repo}`) }
  try {
    if (opts.cmd === 'baseline') baseline(repo, opts)
    else diff(repo, opts)
  } catch (e) {
    fail(`执行失败：${e.message}`)
  }
}

module.exports = { readRequirementFiles, inScope, isExcluded }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/just-flf/tools/scope.test.js`
Expected: 10 个测试全部 PASS

- [ ] **Step 5: 检查点（由用户提交）**

```bash
git add tests/just-flf/tools/scope.test.js just-flf/tools/scope.js
git commit -m "feat(just-flf): scope.js 基线快照与越界检测（不依赖 base 分支，区分原有改动）"
```

---

### Task 4: `conformance.js`（契约校验）

**Files:**
- Create: `tests/just-flf/tools/conformance.test.js`
- Create: `just-flf/tools/conformance.js`

**Interfaces:**
- Consumes: `helpers.js` 的 `mkTmp / write / runToolAsync`
- Produces:
  - CLI：`node conformance.js --api <api-vN.json> --base-url <url> [--auth-file <file>] [--allow-write <id,id>] [--only <id,id>] [--timeout <ms>] [--code-field <name>] [--success-codes <a,b>] [--data-field <name>] [--out <file>] [--dry-run]`
  - 输出 `{ baseUrl, api, checkedAt, results: [{ id, method, path, url, status: "PASS"|"PARTIAL"|"FAIL"|"UNVERIFIED", httpStatus, diffs: string[], unchecked: string[], probes: [{ name, status, detail }], reason }], summary: { pass, partial, fail, unverified } }`
  - 接口定义文件 `api-v<N>.json` 的格式（计划 3 的 `api-designer.md` 必须按此产出）：数组，元素为 `{ id, method, path, request?: { path?, query?, body? }, response?: { data?: <字段表> }, envelope?: { codeField, successCodes, dataField }, errorProbes?: [{ name, request: { path?, query?, body? }, expectCode?, expectHttp? }] }`；字段表的每个字段为 `{ type, required?, nullable?, example?, enum?, fields?, items? }`

- [ ] **Step 1: 写失败的测试 `tests/just-flf/tools/conformance.test.js`**

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const fs = require('fs')
const { mkTmp, write, runToolAsync } = require('./helpers')

function startServer(routes) {
  const hits = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      const key = `${req.method} ${req.url.split('?')[0]}`
      hits.push({ key, headers: req.headers, body })
      const h = routes[key]
      const [status, type, payload] = h ? h(req, body) : [404, 'application/json', '{"code":404,"msg":"not found"}']
      res.writeHead(status, { 'content-type': type })
      res.end(payload)
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, hits, url: `http://127.0.0.1:${server.address().port}` })))
}
const json = (obj, status = 200) => [status, 'application/json', JSON.stringify(obj)]
const html = status => [status, 'text/html', '<html><body>login</body></html>']

function apiFile(endpoints) {
  return write(mkTmp(), 'api-v1.json', JSON.stringify(endpoints))
}
function run(url, endpoints, extra = []) {
  return runToolAsync('conformance.js', ['--api', apiFile(endpoints), '--base-url', url, '--timeout', '3000', ...extra])
}

const LIST = {
  id: 'list', method: 'GET', path: '/api/list',
  response: { data: { items: { type: 'array', required: true, items: { type: 'object', fields: { userId: { type: 'string', required: true } } } } } },
}

test('返回 HTML 登录页的 401 判为 UNVERIFIED，不是 FAIL', async t => {
  const srv = await startServer({ 'GET /api/list': () => html(401) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
})

test('2xx 的 HTML 页面（未登录被重定向）判为 UNVERIFIED', async t => {
  const srv = await startServer({ 'GET /api/list': () => html(200) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
})

test('空数组判为 PARTIAL，元素类型不符判为 FAIL', async t => {
  const srv = await startServer({
    'GET /api/list': () => json({ code: 200, data: { items: [] } }),
    'GET /api/list2': () => json({ code: 200, data: { items: [{ userId: 1 }] } }),
  })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST, { ...LIST, id: 'list2', path: '/api/list2' }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].status, 'PARTIAL')
  assert.match(r.json.results[0].unchecked[0], /items\[\]/)
  assert.equal(r.json.results[1].status, 'FAIL')
  assert.deepEqual(r.json.summary, { pass: 0, partial: 1, fail: 1, unverified: 0 })
})

test('缺必填字段与 nullable=false 却为 null 判为 FAIL', async t => {
  const srv = await startServer({ 'GET /api/sum': () => json({ code: 200, data: { frozen: null } }) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{
    id: 'sum', method: 'GET', path: '/api/sum',
    response: { data: { total: { type: 'integer', required: true }, frozen: { type: 'integer', required: true, nullable: false } } },
  }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].diffs.length, 2)
})

test('写接口默认不发送；--allow-write 放行后才发送', async t => {
  const srv = await startServer({ 'DELETE /api/item/i1': () => json({ code: 200, data: {} }) })
  t.after(() => srv.server.close())
  const del = {
    id: 'del', method: 'DELETE', path: '/api/item/{itemId}',
    request: { path: { itemId: { type: 'string', required: true, example: 'i1' } } },
    response: { data: {} },
  }
  let r = await run(srv.url, [del])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.equal(srv.hits.length, 0)
  r = await run(srv.url, [del], ['--allow-write', 'del'])
  assert.equal(r.json.results[0].status, 'PASS')
  assert.equal(srv.hits.length, 1)
})

test('errorProbes：错误码符合为 PASS，不符为 FAIL', async t => {
  const srv = await startServer({
    'GET /api/space/s1': () => json({ code: 200, data: { name: 'a' } }),
    'GET /api/space/nope': () => json({ code: 'SPACE_NOT_FOUND', data: null }),
  })
  t.after(() => srv.server.close())
  const ep = {
    id: 'space', method: 'GET', path: '/api/space/{spaceId}',
    request: { path: { spaceId: { type: 'string', required: true, example: 's1' } } },
    response: { data: { name: { type: 'string', required: true } } },
  }
  const probe = expectCode => [{ name: '空间不存在', request: { path: { spaceId: 'nope' } }, expectCode }]
  let r = await run(srv.url, [{ ...ep, errorProbes: probe('SPACE_NOT_FOUND') }])
  assert.equal(r.json.results[0].status, 'PASS', JSON.stringify(r.json.results[0]))
  r = await run(srv.url, [{ ...ep, errorProbes: probe('OTHER') }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].status, 'FAIL')
})

test('凭证从 --auth-file 读取；命令行 --header 被拒绝', async t => {
  const srv = await startServer({
    'GET /api/me': req => (req.headers.authorization === 'Bearer t0k' ? json({ code: 200, data: { id: 'u1' } }) : html(401)),
  })
  t.after(() => srv.server.close())
  const auth = write(mkTmp(), 'auth', '# dev 环境\nAuthorization: Bearer t0k\n')
  fs.chmodSync(auth, 0o600)
  const me = { id: 'me', method: 'GET', path: '/api/me', response: { data: { id: { type: 'string', required: true } } } }
  const r = await run(srv.url, [me], ['--auth-file', auth])
  assert.equal(r.json.results[0].status, 'PASS', r.stderr)
  const bad = await run(srv.url, [me], ['--header', 'Authorization: Bearer t0k'])
  assert.equal(bad.code, 2)
})

test('连接被拒绝时判为 UNVERIFIED，不崩溃', async () => {
  const srv = await startServer({})
  await new Promise(resolve => srv.server.close(resolve))
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /请求失败|超时/)
})

test('缺示例值的路径参数 → UNVERIFIED 并说明缺什么', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{ id: 'x', method: 'GET', path: '/api/x/{xId}', response: { data: {} } }])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /path\.xId/)
  assert.equal(srv.hits.length, 0)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/just-flf/tools/conformance.test.js`
Expected: FAIL（脚本不存在）

- [ ] **Step 3: 实现 `just-flf/tools/conformance.js`**

```js
#!/usr/bin/env node
'use strict'
/**
 * 契约校验：读 api-v<N>.json，对联调环境逐接口请求，比对响应与接口定义。
 *
 *   node conformance.js --api <api-vN.json> --base-url <url>
 *     [--auth-file <文件，每行一个 "Header: value">] [--allow-write <id,id>] [--only <id,id>]
 *     [--timeout 15000] [--code-field code] [--success-codes 0,200] [--data-field data]
 *     [--out <conformance.json>] [--dry-run]
 *
 * 默认只发送 GET / HEAD；写接口需要 --allow-write 显式放行。凭证只从 --auth-file 读取。
 * 结果四态：PASS / PARTIAL（有字段因空数组等无法核对）/ FAIL / UNVERIFIED。
 * 退出码：有 FAIL → 1；否则 0；参数错误 → 2。
 */
const fs = require('fs')
const path = require('path')

const READ_METHODS = ['GET', 'HEAD']
const MAX_ARRAY_CHECK = 20

function usage(msg) {
  process.stderr.write(`${msg}\n`)
  process.exit(2)
}

function list(s) {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

function parseArgs(argv) {
  const o = { timeout: 15000, codeField: 'code', successCodes: ['0', '200'], dataField: 'data', allowWrite: [], only: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) usage(`${a} 缺少值`)
      return v
    }
    if (a === '-h' || a === '--help') { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0] + '*/\n'); process.exit(0) }
    else if (a === '--header' || a === '--auth') usage('不接受命令行凭证，请把 Header 写进 --auth-file 指定的文件（权限 600）')
    else if (a === '--api') o.api = next()
    else if (a === '--base-url') o.baseUrl = next()
    else if (a === '--auth-file') o.authFile = next()
    else if (a === '--allow-write') o.allowWrite = list(next())
    else if (a === '--only') o.only = list(next())
    else if (a === '--timeout') o.timeout = Number(next())
    else if (a === '--code-field') o.codeField = next()
    else if (a === '--success-codes') o.successCodes = list(next())
    else if (a === '--data-field') o.dataField = next()
    else if (a === '--out') o.out = next()
    else if (a === '--dry-run') o.dryRun = true
    else usage(`未知参数 ${a}`)
  }
  if (!o.api) usage('缺 --api')
  if (!o.baseUrl && !o.dryRun) usage('缺 --base-url')
  return o
}

function readAuth(file) {
  const headers = {}
  if (!file) return headers
  const st = fs.statSync(file)
  if (process.platform !== 'win32' && (st.mode & 0o077)) process.stderr.write(`⚠️ ${file} 权限过宽，建议 chmod 600\n`)
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf(':')
    if (idx > 0) headers[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
  }
  return headers
}

function loadEndpoints(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'))
  const arr = Array.isArray(j) ? j : (j.endpoints || [])
  return arr.filter(e => e && e.id && e.path && e.method)
}

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

function typeMatches(expected, actual) {
  if (!expected) return true
  const e = String(expected).toLowerCase()
  if (['number', 'decimal', 'float', 'double'].includes(e)) return actual === 'number' || actual === 'integer'
  if (['integer', 'int', 'long'].includes(e)) return actual === 'integer'
  if (['string', 'enum', 'date', 'datetime'].includes(e)) return actual === 'string'
  if (e === 'boolean') return actual === 'boolean'
  if (e === 'array' || e === 'list') return actual === 'array'
  if (e === 'object') return actual === 'object'
  return true
}

function compare(spec, data, prefix, acc) {
  if (!spec || typeof spec !== 'object' || !Object.keys(spec).length) return
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    acc.diffs.push(`${prefix || 'data'} 不是对象，无法核对字段`)
    return
  }
  for (const [name, f] of Object.entries(spec)) {
    const p = prefix ? `${prefix}.${name}` : name
    if (!Object.prototype.hasOwnProperty.call(data, name)) {
      if (f.required) acc.diffs.push(`缺必填字段 ${p}`)
      continue
    }
    const v = data[name]
    if (v === null) {
      if (f.nullable === false) acc.diffs.push(`字段 ${p} 为 null，但接口定义 nullable=false`)
      continue
    }
    const t = typeOf(v)
    if (!typeMatches(f.type, t)) {
      acc.diffs.push(`字段 ${p} 类型为 ${t}，接口定义为 ${f.type}`)
      continue
    }
    if (Array.isArray(f.enum) && !f.enum.includes(v)) acc.diffs.push(`字段 ${p} 值 ${JSON.stringify(v)} 不在枚举 ${JSON.stringify(f.enum)} 内`)
    if (f.fields && t === 'object') compare(f.fields, v, p, acc)
    if (f.items && t === 'array') {
      if (!v.length) {
        if (f.items.fields || f.items.type) acc.unchecked.push(`${p}[]（数组为空，元素未核对）`)
        continue
      }
      v.slice(0, MAX_ARRAY_CHECK).forEach((item, i) => {
        if (f.items.fields) compare(f.items.fields, item, `${p}[${i}]`, acc)
        else if (f.items.type && !typeMatches(f.items.type, typeOf(item))) acc.diffs.push(`字段 ${p}[${i}] 类型为 ${typeOf(item)}，接口定义为 ${f.items.type}`)
      })
    }
  }
}

function sample(f) {
  if (f && typeof f === 'object' && !Array.isArray(f)) return f.example !== undefined ? f.example : f.default
  return f
}

function buildRequest(baseUrl, e, override = {}) {
  const req = e.request || {}
  const missing = []
  const parts = {}
  for (const loc of ['path', 'query', 'body']) {
    const values = {}
    for (const [k, f] of Object.entries(req[loc] || {})) {
      const v = sample(f)
      if (v !== undefined) values[k] = v
      else if (f && f.required && !(override[loc] && k in override[loc])) missing.push(`${loc}.${k}`)
    }
    parts[loc] = { ...values, ...(override[loc] || {}) }
  }
  let urlPath = e.path
  for (const [k, v] of Object.entries(parts.path)) {
    urlPath = urlPath.split(`{${k}}`).join(encodeURIComponent(v)).replace(new RegExp(`:${k}(?=/|$)`), encodeURIComponent(v))
  }
  for (const m of urlPath.matchAll(/\{([^}]+)\}/g)) if (!missing.includes(`path.${m[1]}`)) missing.push(`path.${m[1]}`)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(parts.query)) qs.set(k, String(v))
  const body = Object.keys(parts.body).length ? parts.body : undefined
  const url = `${(baseUrl || '').replace(/\/$/, '')}${urlPath}${qs.toString() ? `?${qs}` : ''}`
  return { url, body, missing }
}

async function send(o, method, url, body, headers) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), o.timeout)
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = method === 'HEAD' ? '' : await res.text()
    return { status: res.status, contentType: res.headers.get('content-type') || '', text }
  } catch (err) {
    return { error: err.name === 'AbortError' ? `超时 ${o.timeout}ms` : `请求失败：${err.message}` }
  } finally {
    clearTimeout(timer)
  }
}

function classify(res) {
  if (res.error) return { verdict: 'UNVERIFIED', reason: res.error }
  if (res.status === 401 || res.status === 403) return { verdict: 'UNVERIFIED', reason: `HTTP ${res.status}，鉴权不足，无法验证` }
  try {
    return { json: JSON.parse(res.text) }
  } catch (_) {
    const isHtml = /text\/html/i.test(res.contentType) || /^\s*</.test(res.text)
    if (isHtml && res.status >= 200 && res.status < 400) return { verdict: 'UNVERIFIED', reason: `返回 HTML 页面（HTTP ${res.status}），常见于未登录被重定向` }
    return { verdict: 'FAIL', diffs: [`响应不是 JSON（HTTP ${res.status}）：${res.text.slice(0, 120)}`] }
  }
}

async function runProbe(o, e, p, env, headers, method) {
  const out = { name: p.name || '未命名', status: 'UNVERIFIED', detail: '' }
  const req = buildRequest(o.baseUrl, e, p.request || {})
  if (req.missing.length) { out.detail = `缺示例值：${req.missing.join(', ')}`; return out }
  const res = await send(o, method, req.url, req.body, headers)
  const c = classify(res)
  if (c.verdict === 'UNVERIFIED') { out.detail = c.reason; return out }
  if (p.expectHttp !== undefined && res.status !== p.expectHttp) { out.status = 'FAIL'; out.detail = `期望 HTTP ${p.expectHttp}，实际 ${res.status}`; return out }
  if (c.verdict === 'FAIL' && p.expectHttp === undefined) { out.status = 'FAIL'; out.detail = c.diffs.join('；'); return out }
  if (p.expectCode !== undefined) {
    const actual = c.json && env.codeField ? c.json[env.codeField] : undefined
    if (String(actual) !== String(p.expectCode)) { out.status = 'FAIL'; out.detail = `期望 ${env.codeField}=${p.expectCode}，实际 ${actual}`; return out }
  }
  out.status = 'PASS'
  return out
}

async function checkOne(o, e, headers) {
  const method = String(e.method).toUpperCase()
  const r = { id: e.id, method, path: e.path, url: null, status: 'UNVERIFIED', httpStatus: null, diffs: [], unchecked: [], probes: [], reason: '' }
  const env = { codeField: o.codeField, successCodes: o.successCodes, dataField: o.dataField, ...(e.envelope || {}) }
  env.successCodes = (env.successCodes || []).map(String)
  if (!READ_METHODS.includes(method) && !o.allowWrite.includes(e.id)) {
    r.reason = '写接口默认不发送（需在闸门处同意后用 --allow-write 放行）'
    return r
  }
  const req = buildRequest(o.baseUrl, e)
  r.url = req.url
  if (req.missing.length) { r.reason = `缺示例值，无法构造请求：${req.missing.join(', ')}`; return r }
  if (o.dryRun) { r.reason = 'dry-run'; return r }

  const res = await send(o, method, req.url, req.body, headers)
  r.httpStatus = res.status || null
  if (method === 'HEAD') {
    if (res.error) { r.reason = res.error; return r }
    if (res.status === 401 || res.status === 403) { r.reason = `HTTP ${res.status}，鉴权不足，无法验证`; return r }
    r.status = res.status >= 200 && res.status < 300 ? 'PASS' : 'FAIL'
    if (r.status === 'FAIL') r.diffs.push(`HTTP ${res.status}`)
    return r
  }
  const c = classify(res)
  if (c.verdict) {
    r.status = c.verdict
    if (c.reason) r.reason = c.reason
    if (c.diffs) r.diffs.push(...c.diffs)
    return r
  }
  const body = c.json
  if (env.codeField && body && Object.prototype.hasOwnProperty.call(body, env.codeField)) {
    const code = String(body[env.codeField])
    if (!env.successCodes.includes(code)) {
      r.status = 'FAIL'
      const msg = body.msg || body.message
      r.diffs.push(`统一响应体 ${env.codeField}=${code} 不在成功码 [${env.successCodes.join(',')}] 内${msg ? `：${msg}` : ''}`)
      return r
    }
  } else if (res.status < 200 || res.status >= 300) {
    r.status = 'FAIL'
    r.diffs.push(`HTTP ${res.status}`)
    return r
  }
  const data = env.dataField ? (body || {})[env.dataField] : body
  const spec = (e.response && (e.response.data || e.response.body)) || {}
  compare(spec, data, '', r)
  for (const p of e.errorProbes || []) r.probes.push(await runProbe(o, e, p, env, headers, method))
  for (const p of r.probes) if (p.status === 'FAIL') r.diffs.push(`错误探针「${p.name}」：${p.detail}`)
  if (r.diffs.length) r.status = 'FAIL'
  else if (r.unchecked.length || r.probes.some(p => p.status === 'UNVERIFIED')) r.status = 'PARTIAL'
  else r.status = 'PASS'
  return r
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  let endpoints = loadEndpoints(o.api)
  if (o.only) endpoints = endpoints.filter(e => o.only.includes(e.id))
  if (!endpoints.length) usage('接口定义里没有可校验的接口（需要 id / method / path）')
  const headers = { Accept: 'application/json', ...readAuth(o.authFile) }
  const results = []
  for (const e of endpoints) {
    const r = await checkOne(o, e, headers)
    results.push(r)
    const mark = { PASS: '✅', PARTIAL: '🟡', FAIL: '❌', UNVERIFIED: '⏳' }[r.status]
    process.stderr.write(`${mark} ${r.id} ${r.method} ${r.path}${r.httpStatus ? ` → ${r.httpStatus}` : ''}\n`)
    for (const d of [...r.diffs, ...r.unchecked]) process.stderr.write(`   ${d}\n`)
    if (r.reason) process.stderr.write(`   ${r.reason}\n`)
  }
  const summary = { pass: 0, partial: 0, fail: 0, unverified: 0 }
  for (const r of results) summary[r.status.toLowerCase()]++
  const out = { baseUrl: o.baseUrl || '', api: o.api, checkedAt: new Date().toISOString(), results, summary }
  const json = `${JSON.stringify(out, null, 2)}\n`
  if (o.out) {
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true })
    fs.writeFileSync(o.out, json)
  }
  process.stdout.write(json)
  process.exit(summary.fail > 0 ? 1 : 0)
}

main().catch(err => {
  process.stderr.write(`${err.stack || err}\n`)
  process.exit(2)
})
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/just-flf/tools/conformance.test.js`
Expected: 9 个测试全部 PASS

- [ ] **Step 5: 跑全部工具测试**

Run: `node --test tests/just-flf/tools/`
Expected: 30 个测试全部 PASS（workspace 11 + scope 10 + conformance 9）

- [ ] **Step 6: 在 `docs/CHANGELOG.md` 顶部追加本计划记录**

在文件第一个 `##` 标题之前插入：

```markdown
## 2026-10-18 just-flf 计划 1：仓库清理与三个独立工具

| # | 问题 | 处理 | 落点 |
|---|------|------|------|
| 29 | 历史文档随 skill 安装、含内部域名与仓库名、凭证位置描述 | 迁至仓库根 `docs/history/`、`docs/CHANGELOG.md`，按映射表替换，删除凭证位置描述 | `docs/`、`.gitignore` |
| 30 | `workspace-detect.js` 遇 gradle-only 崩溃、JSONC 崩溃、Java 仓带 package.json 误判为 fe、写死项目值 | 新 `workspace.js`：JSONC、画像优先、构建文件综合判定、单仓模式、无工作区文件时提示创建、范式路径用户级配置 | `just-flf/tools/workspace.js` |
| 31 | `out-of-scope.sh` 本地无 base 分支时漏报、把用户原有脏文件误报为越界 | 新 `scope.js`：开工基线快照 + 内容哈希，区分 preexisting，排除 `.just-flf/` | `just-flf/tools/scope.js` |
| 32 | `contract-conformance.js` HTML 401 误判 FAIL、空数组 PASS、真实发送写请求、不校验错误码、凭证走命令行 | 新 `conformance.js`：先判鉴权、四态含 PARTIAL、写接口默认不发、errorProbes、`--auth-file` | `just-flf/tools/conformance.js` |
```

- [ ] **Step 7: 检查点（由用户提交）**

```bash
git add tests/just-flf/tools/conformance.test.js just-flf/tools/conformance.js docs/CHANGELOG.md
git commit -m "feat(just-flf): conformance.js 契约校验（只读默认、四态、错误探针、凭证文件）"
```
