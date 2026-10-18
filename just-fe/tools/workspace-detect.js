#!/usr/bin/env node
'use strict'
/**
 * 工作区探测：为「⓪ 工作区确认」生成 MEMORY 字段的默认值。
 *
 *   node tools/workspace-detect.js [<.code-workspace 路径> | <工作区父目录>] [--requirement "<需求短名>"]
 *
 * 规则：
 *   - 有 .code-workspace：读 folders[]；否则把目录下的一级子目录当候选
 *   - git 仓 + package.json → lane=fe；git 仓 + pom.xml / build.gradle → lane=be
 *   - 非 git 仓且含 新需求/ 目录（或名为 sessions）→ 会话区；report_dir = 会话区/新需求/<需求短名>
 *   - 读 fe 仓 .env.development 的 VITE_APP_API_TARGET 作为 env.dev.gatewayUrl
 *   - 读 be 仓 .workflow/*-dev.yml 推断 模块 → 流水线 表
 * 输出 JSON 到 stdout。只读，不写任何文件。
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const argv = process.argv.slice(2)
let target = process.cwd()
let requirement = ''
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--requirement') requirement = argv[++i] || ''
  else target = argv[i]
}
target = path.resolve(target)

function sh(cmd, cwd) {
  try { return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() } catch (_) { return '' }
}
const exists = p => fs.existsSync(p)

// .code-workspace 是 JSONC：允许 BOM、// 与 /* */ 注释、尾逗号
function readJsonc(file) {
  const s = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  let out = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      out += c
      if (c === '\\') { out += s[++i]; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue }
    out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const FE_DEPS = ['vue', 'react', 'react-dom', 'preact', '@angular/core', 'svelte', 'solid-js', 'next', 'nuxt']
function detectLane(dir) {
  const hasBe = ['pom.xml', 'build.gradle', 'build.gradle.kts'].some(f => exists(path.join(dir, f)))
  let feDeps = false
  if (exists(path.join(dir, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
      feDeps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).some(d => FE_DEPS.includes(d))
    } catch (_) {}
  }
  // 后端仓里常有只装 husky / commitlint 的 package.json，有构建文件且没有前端框架依赖就判为 be
  if (hasBe && !feDeps) return 'be'
  if (exists(path.join(dir, 'package.json'))) return 'fe'
  return hasBe ? 'be' : 'unknown'
}

let folders = []
let workspaceFile = null
if (target.endsWith('.code-workspace') && exists(target)) {
  workspaceFile = target
  const ws = readJsonc(target)
  const root = path.dirname(target)
  folders = (ws.folders || []).map(f => path.resolve(root, f.path))
} else if (exists(target) && fs.statSync(target).isDirectory()) {
  const wsFiles = fs.readdirSync(target).filter(f => f.endsWith('.code-workspace'))
  if (wsFiles.length === 1) {
    workspaceFile = path.join(target, wsFiles[0])
    const ws = readJsonc(workspaceFile)
    folders = (ws.folders || []).map(f => path.resolve(target, f.path))
  } else {
    folders = fs.readdirSync(target).filter(f => !f.startsWith('.')).map(f => path.join(target, f)).filter(p => fs.statSync(p).isDirectory())
  }
}

const repos = []
let sessions = null
const notes = []

for (const dir of folders) {
  if (!exists(dir)) { notes.push(`目录不存在：${dir}`); continue }
  const isGit = exists(path.join(dir, '.git'))
  if (isGit) {
    const lane = detectLane(dir)
    const branch = sh('git rev-parse --abbrev-ref HEAD', dir)
    const dirty = sh('git status --porcelain', dir) !== ''
    const remoteBranches = sh('git branch -r --format=%(refname:short)', dir).split('\n')
    const guessBase = lane === 'be'
      ? (remoteBranches.find(b => /\/dev$/.test(b)) ? 'dev' : remoteBranches.find(b => /\/develop$/.test(b)) ? 'develop' : 'main')
      : (remoteBranches.find(b => /\/develop$/.test(b)) ? 'develop' : remoteBranches.find(b => /\/dev$/.test(b)) ? 'dev' : 'main')
    const repo = { lane, path: dir, name: path.basename(dir), branch, base: guessBase, dirty, mode: 'write' }
    // 部署流水线的触发分支是最可靠的 base 依据（Gitee Go：.workflow/*-dev.yml → triggers.push.branches.precise）
    const wfDir = path.join(dir, '.workflow')
    if (exists(wfDir)) {
      for (const f of fs.readdirSync(wfDir).filter(f => /-dev\.ya?ml$/.test(f))) {
        const m = fs.readFileSync(path.join(wfDir, f), 'utf8').match(/precise:\s*\n\s*-\s*(\S+)/)
        if (m) { repo.base = m[1]; repo.deployTriggerBranch = m[1]; break }
      }
    }
    if (lane === 'fe') {
      repo.profile = exists(path.join(dir, '.claude', 'fe-profile.md')) ? path.join(dir, '.claude', 'fe-profile.md') : null
      const envFile = path.join(dir, '.env.development')
      if (exists(envFile)) {
        const m = fs.readFileSync(envFile, 'utf8').match(/^\s*VITE_APP_API_TARGET\s*=\s*['"]?([^'"\n]+)['"]?/m)
        if (m) repo.devGatewayUrl = m[1].trim()
      }
    }
    if (lane === 'be') {
      repo.profile = exists(path.join(dir, '.claude', 'be-profile.md')) ? path.join(dir, '.claude', 'be-profile.md') : null
      const wf = path.join(dir, '.workflow')
      if (exists(wf)) {
        repo.pipelines = fs.readdirSync(wf).filter(f => /-dev\.ya?ml$/.test(f)).map(f => {
          const text = fs.readFileSync(path.join(wf, f), 'utf8')
          const branch = (text.match(/precise:\s*\n\s*-\s*(\S+)/) || [])[1] || ''
          const paths = [...text.matchAll(/^\s+-\s+([\w-]+)\/\.\*$/gm)].map(m => m[1])
          return { module: f.replace(/-dev\.ya?ml$/, ''), file: f, triggerBranch: branch, paths }
        })
      }
      const pom = path.join(dir, 'pom.xml')
      const modules = exists(pom) ? (fs.readFileSync(pom, 'utf8').match(/<module>([^<]+)<\/module>/g) || []).map(m => m.replace(/<\/?module>/g, '')) : []
      if (modules.length) repo.modules = modules
    }
    repos.push(repo)
  } else {
    const hasNewReq = exists(path.join(dir, '新需求'))
    if (hasNewReq || /sessions?$/i.test(path.basename(dir))) {
      sessions = { path: dir, newRequirementsDir: hasNewReq ? path.join(dir, '新需求') : null, paradigm: null }
      // 需求处理范式：在会话区任意子目录下找
      const cand = sh(`find "${dir}" -maxdepth 3 -name '需求处理范式.md' 2>/dev/null | head -1`)
      if (cand) sessions.paradigm = cand
    } else {
      notes.push(`非 git 且不像会话区，忽略：${dir}`)
    }
  }
}

const fe = repos.find(r => r.lane === 'fe')
const be = repos.find(r => r.lane === 'be')
if (!fe) notes.push('未发现前端仓（含 package.json 的 git 仓）')
if (!be) notes.push('未发现后端仓（含 pom.xml / build.gradle 的 git 仓）；若需求只涉及前端可忽略')
if (!sessions) notes.push('未发现会话区（含 新需求/ 的非 git 目录）；report_dir 需用户指定')

const out = {
  workspaceFile,
  report_dir: sessions && sessions.newRequirementsDir ? path.join(sessions.newRequirementsDir, requirement || '<需求短名>') : null,
  paradigm: sessions ? sessions.paradigm : null,
  repos: repos.map(r => ({ lane: r.lane, name: r.name, path: r.path, branch: r.branch, base: r.base, deployTriggerBranch: r.deployTriggerBranch || null, mode: r.mode, dirty: r.dirty, profile: r.profile || null })),
  env: { dev: { gatewayUrl: fe && fe.devGatewayUrl ? fe.devGatewayUrl : null } },
  be: be ? { modules: be.modules || [], pipelines: be.pipelines || [] } : null,
  notes,
  nextQuestions: [
    be ? '后端仓本次是「可写」还是「只读参考」？（有需新增/变更接口必须可写）' : null,
    '本期做到哪个阶段（scope）？默认全流程',
    '需求来源优先级（source）？如：需求文档 V2.2 > 在线原型 > PRD',
    repos.some(r => r.dirty) ? `以下仓库工作区有未提交改动，开发前请确认基线：${repos.filter(r => r.dirty).map(r => r.name).join('、')}` : null,
  ].filter(Boolean),
}
console.log(JSON.stringify(out, null, 2))
