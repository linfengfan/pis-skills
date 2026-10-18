#!/usr/bin/env node
'use strict'
/**
 * 工作区识别（triage 开头调用）。
 *
 *   node workspace.js [--cwd <dir>] [--home <dir>] [--workspace <.code-workspace 文件>]
 *   node workspace.js config --paradigm <路径|none> [--home <dir>]
 *
 * 识别命令只读，输出 JSON 到 stdout：
 *   { workspaceMode, workspaceFile, workspaceRoot, repos[], paradigm, notes[], questions[] }
 * 工作区根目录：.code-workspace 所在目录。--workspace 显式指定时直接用该文件，不向上查找、不做下面的包含判断。
 * 否则从 --cwd 向上查找到 --home，取最近一层有 .code-workspace 的目录里的候选：
 *   - 当前目录不在 git 仓内：1 个 → 使用；多个 → choose_workspace。
 *   - 当前目录在 git 仓内：候选所在目录是当前仓根的上级目录时，只有 folders 包含当前仓才算数，
 *     否则忽略并记 note（无法解析的也忽略）；候选在当前仓根或其子目录里时一律算数（无法解析 → fix_workspace）。
 *     剩 0 个 → 单仓模式；1 个 → 使用；多个 → choose_workspace。
 * 工作区文件必须是 JSON 对象（允许注释与尾逗号），folders 如有必须是数组，否则 fix_workspace。
 * 当前目录不是 git 仓且找不到 .code-workspace → create_workspace，建议内容列出所有子 git 仓（含泳道未知的），
 * 问题里的 repos 给出各仓泳道。
 * 泳道：后端框架依赖只看 dependencies（前端仓常在 devDependencies 里放 express / koa 做 mock），前端框架依赖两者都看。
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
    else if (a === '--workspace') out.workspace = v
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

function realOrSelf(p) {
  try { return fs.realpathSync(p) } catch (_) { return p }
}

function detectLane(dir) {
  const hasFeProfile = fs.existsSync(path.join(dir, '.claude', 'fe-profile.md'))
  const hasBeProfile = fs.existsSync(path.join(dir, '.claude', 'be-profile.md'))
  if (hasFeProfile !== hasBeProfile) return { lane: hasFeProfile ? 'fe' : 'be', by: 'profile' }
  const hasBeMarker = BE_MARKERS.some(f => fs.existsSync(path.join(dir, f)))
  const pkg = readJson(path.join(dir, 'package.json'))
  const runtimeDeps = pkg ? Object.keys(pkg.dependencies || {}) : []
  const allDeps = pkg ? Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }) : []
  const feDeps = allDeps.some(d => FE_DEPS.includes(d))
  const beDeps = runtimeDeps.some(d => BE_DEPS.includes(d))
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
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) return { error: `无法解析 ${file}：内容不是 JSON 对象` }
  if (ws.folders !== undefined && !Array.isArray(ws.folders)) return { error: `无法解析 ${file}：folders 不是数组` }
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

function isStrictAncestor(dir, of) {
  const rel = path.relative(dir, of)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

function chooseQuestion(candidates) {
  return { id: 'choose_workspace', message: '找到多个 .code-workspace，请指定用哪一个（重新运行时加 --workspace <文件>）', candidates }
}

// 返回 { file, ws, notes }（使用该工作区）、{ question }（需要先问用户）或 null（没有可用的工作区）
function pickWorkspace(opts, cwd, home, topReal, notesOut) {
  if (opts.workspace) {
    const file = realOrSelf(path.resolve(opts.workspace))
    const notes = []
    const ws = readWorkspace(file, notes)
    return ws.error ? { question: { id: 'fix_workspace', message: ws.error } } : { file, ws, notes }
  }
  const files = findWorkspaceFiles(cwd, home)
  if (!topReal && files.length > 1) return { question: chooseQuestion(files) }
  const kept = []
  for (const file of files) {
    const notes = []
    const ws = readWorkspace(file, notes)
    const aboveRepo = !!topReal && isStrictAncestor(realOrSelf(path.dirname(file)), topReal)
    if (ws.error) {
      if (!aboveRepo) return { question: { id: 'fix_workspace', message: ws.error } }
      notesOut.push(`忽略无法解析且与当前仓无关的工作区文件：${file}`)
      continue
    }
    if (aboveRepo && !ws.folders.some(d => realOrSelf(d) === topReal)) {
      notesOut.push(`忽略不包含当前仓的工作区文件：${file}`)
      continue
    }
    kept.push({ file, ws, notes })
  }
  if (kept.length > 1) return { question: chooseQuestion(kept.map(k => k.file)) }
  return kept[0] || null
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

  const top = git(cwd, ['rev-parse', '--show-toplevel'])
  const topReal = top ? fs.realpathSync(top) : null
  const picked = pickWorkspace(opts, cwd, home, topReal, out.notes)
  if (picked && picked.question) {
    out.questions.push(picked.question)
    return out
  }
  if (picked) {
    out.notes.push(...picked.notes)
    out.workspaceMode = 'workspace'
    out.workspaceFile = picked.file
    out.workspaceRoot = path.dirname(picked.file)
    for (const dir of picked.ws.folders) {
      if (!fs.existsSync(dir)) { out.notes.push(`目录不存在：${dir}`); continue }
      if (!fs.existsSync(path.join(dir, '.git'))) {
        const owner = git(dir, ['rev-parse', '--show-toplevel'])
        out.notes.push(owner ? `目录不是 git 仓根目录（位于仓库 ${owner} 内），已跳过：${dir}` : `跳过非 git 目录：${dir}`)
        continue
      }
      out.repos.push(describeRepo(dir))
    }
    if (!out.repos.length) {
      out.questions.push({ id: 'no_repos', message: '工作区里没有识别到 git 仓（folders 需要指向仓库根目录），请检查工作区文件', workspaceFile: picked.file })
    }
  } else {
    if (!topReal) {
      const candidates = childGitRepos(cwd).map(dir => ({ path: dir, lane: detectLane(dir).lane }))
      out.questions.push({
        id: 'create_workspace',
        message: '当前目录不是 git 仓，也没有找到 .code-workspace。请按建议创建后重新运行（也可以让编排者按建议内容代为创建）',
        suggestion: {
          path: path.join(cwd, `${path.basename(cwd)}.code-workspace`),
          content: { folders: candidates.map(r => ({ path: path.relative(cwd, r.path) || '.' })) },
        },
        repos: candidates,
      })
      return out
    }
    out.workspaceMode = 'single-repo'
    out.workspaceRoot = topReal
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
