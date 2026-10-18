#!/usr/bin/env node
'use strict'
/**
 * just-flf 流程状态的唯一入口。状态存于 <需求产物目录>/state.json；每次写入后自动重新生成同目录的 MEMORY.md（只读视图）。
 *
 *   init    --workspace-json <workspace.js 的输出文件> --requirement <需求短名>
 *   status  --dir <d>
 *   get     --dir <d> --key <a.b.c>
 *   set     --dir <d> --key <a.b.c> --value <JSON 或纯文本>
 *   start   --dir <d> --stage <阶段|profile> [--lane fe|be]          轮次 +1，输出本轮产物路径
 *   receipt --dir <d> --stage <阶段|profile> [--lane fe|be] --role <角色卡名> --json <回执 JSON | @文件>
 *           [--reviewer <评审员 key> --checklist <清单文件> --groups <组1,组2> [--min-severity major]]
 *   score   --dir <d> --stage <阶段> [--lane fe|be] --expect <评审员 key,…>
 *   finish  --dir <d> --stage <阶段|profile> [--lane fe|be]          进入「等待闸门」
 *   gate    --dir <d> --stage <阶段|profile> [--lane fe|be] --choice next|adjust|stop|fix|accept|skip|confirm [--note <文字>]
 *   decide  --dir <d> --card <决策卡 id> --choice <裁定>
 *   deliver --dir <d>                                                组装 deliver.md
 *
 * 泳道阶段（design / dev / review / test）不带 --lane 时，finish / gate 作用于所有启用的泳道。
 * 退出码：0 正常；1 回执校验不通过（输出 errors，编排者带着它重派一次）；2 参数或环境错误。
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const SKILL_DIR = path.resolve(__dirname, '..')
const STAGES = ['triage', 'api', 'design', 'dev', 'review', 'test', 'deliver', 'integrate']
const LANE_STAGES = ['design', 'dev', 'review', 'test']
const ROUTES = {
  lite: ['triage', 'api', 'dev', 'review', 'test', 'deliver'],
  full: ['triage', 'api', 'design', 'dev', 'review', 'test', 'deliver'],
}
const DOWNSTREAM = {
  triage: ['api', 'design', 'dev', 'review', 'test', 'deliver'],
  api: ['design', 'dev', 'review', 'test', 'deliver'],
  design: ['dev', 'review', 'test', 'deliver'],
  dev: ['review', 'test', 'deliver'],
  review: ['test', 'deliver'],
  test: ['deliver'],
}
const WEIGHT = { critical: 3, major: 2, minor: 1 }
const FINISHED = ['done', 'skipped', 'na']
const CRITERION_WEIGHT = 3

function fail(msg, code = 2) {
  process.stderr.write(`${msg}\n`)
  process.exit(code)
}

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
}

function now() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function parseArgs(argv) {
  const o = { cmd: argv[0] }
  if (!o.cmd || o.cmd === '-h' || o.cmd === '--help') {
    process.stdout.write(`${fs.readFileSync(__filename, 'utf8').split('*/')[0]}*/\n`)
    process.exit(0)
  }
  for (let i = 1; i < argv.length; i += 2) {
    const a = argv[i]
    const v = argv[i + 1]
    if (!a.startsWith('--')) fail(`无法识别的参数 ${a}`)
    if (v === undefined) fail(`${a} 缺少值`)
    o[a.slice(2)] = v
  }
  return o
}

function need(o, ...keys) {
  for (const k of keys) if (!o[k]) fail(`缺 --${k}`)
}

function load(dir) {
  const f = path.join(dir, 'state.json')
  if (!fs.existsSync(f)) fail(`找不到 ${f}，先运行 init`)
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}

function save(st) {
  st.updatedAt = now()
  fs.writeFileSync(path.join(st.dir, 'state.json'), `${JSON.stringify(st, null, 2)}\n`)
  fs.writeFileSync(path.join(st.dir, 'MEMORY.md'), render(st))
}

function getPath(obj, key) {
  return key.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj)
}

function setPath(obj, key, val) {
  const ks = key.split('.')
  let cur = obj
  for (const k of ks.slice(0, -1)) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[ks[ks.length - 1]] = val
}

function activeLanes(st) {
  const lanes = []
  if (st.repos.fe && ['fe', 'fullstack'].includes(st.stackScope)) lanes.push('fe')
  if (st.repos.be && st.repos.be.mode === 'write' && ['be', 'fullstack'].includes(st.stackScope)) lanes.push('be')
  return lanes
}

function slot(st, stage, lane) {
  if (stage === 'profile') {
    if (!lane || !st.repos[lane]) fail('profile 需要 --lane，且该泳道的仓库存在')
    st.profiles = st.profiles || {}
    st.profiles[lane] = st.profiles[lane] || { status: 'pending', round: 0, receipts: [] }
    return st.profiles[lane]
  }
  if (!STAGES.includes(stage)) fail(`未知阶段 ${stage}`)
  st.stages[stage] = st.stages[stage] || { status: 'pending', round: 0, receipts: [] }
  if (!LANE_STAGES.includes(stage)) return st.stages[stage]
  if (!lane) fail(`${stage} 是泳道阶段，需要 --lane fe|be`)
  const s = st.stages[stage]
  s.lanes = s.lanes || {}
  s.lanes[lane] = s.lanes[lane] || { status: 'pending', round: 0, receipts: [] }
  return s.lanes[lane]
}

function slotsFor(st, stage, lane) {
  if (LANE_STAGES.includes(stage) && !lane) {
    const lanes = activeLanes(st)
    if (!lanes.length) fail(`${stage} 没有启用的泳道（stackScope=${st.stackScope}）`)
    return lanes.map(l => [l, slot(st, stage, l)])
  }
  return [[lane || null, slot(st, stage, lane)]]
}

function laneStatus(st, stage, lane) {
  const s = st.stages[stage]
  return s && s.lanes && s.lanes[lane] ? s.lanes[lane].status : 'pending'
}

function stageStatus(st, stage) {
  if (!LANE_STAGES.includes(stage)) return st.stages[stage] ? st.stages[stage].status : 'pending'
  const lanes = activeLanes(st)
  if (!lanes.length) return 'na'
  const ss = lanes.map(l => laneStatus(st, stage, l))
  for (const k of ['stale', 'failed', 'running', 'awaiting_gate', 'pending']) if (ss.includes(k)) return k
  return ss.every(x => FINISHED.includes(x)) ? 'done' : ss[0]
}

function markStale(st, stage, lane) {
  for (const down of DOWNSTREAM[stage] || []) {
    const targets = LANE_STAGES.includes(down) ? (lane ? [lane] : activeLanes(st)) : [null]
    for (const l of targets) {
      const s = l ? (st.stages[down] && st.stages[down].lanes && st.stages[down].lanes[l]) : st.stages[down]
      if (s && ['done', 'awaiting_gate', 'failed', 'running'].includes(s.status)) s.status = 'stale'
    }
  }
}

function pathsFor(st, stage, lane, n) {
  const j = (...p) => path.join(st.dir, ...p)
  const v = st.apiVersion
  switch (stage) {
    case 'profile': return { report: j(`profile-${lane}-r${n}.md`), profile: path.join(st.repos[lane].path, '.claude', `${lane}-profile.md`) }
    case 'triage': return { requirement: j('requirement.md'), report: j(`triage-r${n}.md`) }
    case 'api': return { report: j(`api-v${v}.md`), apiJson: j(`api-v${v}.json`), review: j(`api-v${v}-review-r${n}-{reviewer}.md`), summary: j(`api-v${v}-review-r${n}.md`) }
    case 'design': return { report: j(lane, `design-r${n}.md`), files: j(lane, 'files.txt'), review: j(lane, `design-review-r${n}-{reviewer}.md`), summary: j(lane, `design-review-r${n}.md`) }
    case 'dev': return { report: j(lane, `dev-r${n}.md`), baseline: j(lane, 'baseline.json'), files: j(lane, 'files.txt') }
    case 'review': return { scope: j(lane, `scope-r${n}.json`), review: j(lane, `review-r${n}-{reviewer}.md`), summary: j(lane, `review-r${n}.md`) }
    case 'test': return { verify: j(lane, `test-r${n}-verify.md`), review: j(lane, `test-r${n}-{reviewer}.md`), summary: j(lane, `test-r${n}.md`) }
    case 'deliver': return { report: j('deliver.md') }
    case 'integrate': return { baseline: j('integrate', 'baseline.json'), conformance: j('integrate', `conformance-r${n}.json`), report: j('integrate', `integrate-r${n}.md`), scope: j('integrate', `scope-r${n}.json`), review: j('integrate', `review-r${n}-{reviewer}.md`), summary: j('integrate', `review-r${n}.md`) }
    default: return {}
  }
}

// ---------- 角色卡与清单解析 ----------

function templateHeadings(role) {
  const file = path.join(SKILL_DIR, 'roles', `${role}.md`)
  if (!fs.existsSync(file)) fail(`找不到角色卡 ${file}`)
  const text = fs.readFileSync(file, 'utf8')
  const h = text.match(/\n#{2,3} 报告模板\n/)
  if (!h) return []
  const m = text.slice(h.index).match(/\n~~~markdown\n([\s\S]*?)\n~~~/)
  if (!m) return []
  return m[1].split('\n').filter(l => /^## /.test(l)).map(l => l.trim())
}

function resolveSkillPath(p) {
  return path.isAbsolute(p) ? p : path.join(SKILL_DIR, p)
}

function parseChecklist(file) {
  const abs = resolveSkillPath(file)
  if (!fs.existsSync(abs)) fail(`找不到清单 ${abs}`)
  const items = {}
  for (const line of fs.readFileSync(abs, 'utf8').split('\n')) {
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length !== 5 || !/^[A-Z]+-\d+$/.test(cells[0])) continue
    const [id, group, text, severity, applies] = cells
    if (!WEIGHT[severity]) fail(`清单 ${abs} 中 ${id} 的严重度无效：${severity}`)
    items[id] = { id, group, text, severity, applies }
  }
  return items
}

function assignedItems(items, groups, lane, minSeverity) {
  const min = WEIGHT[minSeverity || 'minor']
  return Object.values(items).filter(it =>
    groups.includes(it.group) &&
    (it.applies === 'all' || !lane || it.applies === lane) &&
    WEIGHT[it.severity] >= min)
}

// ---------- 命令 ----------

function writeExclude(root) {
  let top
  let gitDir
  try {
    const opt = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    top = execFileSync('git', ['rev-parse', '--show-toplevel'], opt).trim()
    gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], opt).trim()
  } catch (_) {
    return null
  }
  const rel = path.relative(fs.realpathSync(top), fs.realpathSync(root)).split(path.sep).join('/')
  const pattern = rel ? `/${rel}/.just-flf/` : '/.just-flf/'
  const file = path.join(gitDir, 'info', 'exclude')
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (!cur.split(/\r?\n/).includes(pattern)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${cur && !cur.endsWith('\n') ? '\n' : ''}${pattern}\n`)
  }
  return file
}

function cmdInit(o) {
  need(o, 'workspace-json', 'requirement')
  const ws = JSON.parse(fs.readFileSync(o['workspace-json'], 'utf8'))
  if (!ws.workspaceRoot) fail('workspace.js 的输出里没有 workspaceRoot，先处理它的 questions')
  if (/[\\/]/.test(o.requirement) || o.requirement.startsWith('.')) fail('需求短名不能包含路径分隔符，也不能以 . 开头')
  const dir = path.join(ws.workspaceRoot, '.just-flf', o.requirement)
  if (fs.existsSync(path.join(dir, 'state.json'))) fail(`${dir} 已有 state.json；续接请用 status`)
  fs.mkdirSync(dir, { recursive: true })
  const repos = {}
  for (const r of ws.repos || []) {
    if ((r.lane === 'fe' || r.lane === 'be') && !repos[r.lane]) repos[r.lane] = { path: r.path, profile: r.profile || null, mode: 'write' }
  }
  const st = {
    requirement: o.requirement, dir, workspaceRoot: ws.workspaceRoot, workspaceMode: ws.workspaceMode,
    paradigm: ws.paradigm || null, createdAt: now(), route: null, stackScope: null, needsBackendWrite: false,
    repos, apiVersion: 0, design: { url: null, noDesignReason: null }, triage: null,
    stages: {}, profiles: {}, decisions: [], gates: [], integrate: { gatewayUrl: null, authFile: null },
  }
  const exclude = writeExclude(ws.workspaceRoot)
  save(st)
  out({ dir, repos, exclude })
}

function cmdStatus(o) {
  need(o, 'dir')
  const st = load(o.dir)
  const rows = STAGES.map(s => {
    const row = { stage: s, status: stageStatus(st, s) }
    if (LANE_STAGES.includes(s)) row.lanes = Object.fromEntries(activeLanes(st).map(l => [l, laneStatus(st, s, l)]))
    return row
  })
  const actions = {
    pending: '开始本阶段',
    running: '本阶段进行中：继续派发或处理回执',
    awaiting_gate: '向用户汇报并等待闸门选择',
    stale: '上游已变更：重跑本阶段，或经用户确认后 gate confirm 沿用',
    failed: '评审未通过：按闸门选择处理',
  }
  let next = null
  const order = !st.route || st.route === 'blocked' ? ['triage'] : ROUTES[st.route]
  for (const s of order) {
    const ss = stageStatus(st, s)
    if (FINISHED.includes(ss)) continue
    next = { stage: s, status: ss, action: actions[ss] || '' }
    break
  }
  if (!next) next = { stage: 'integrate', status: stageStatus(st, 'integrate'), action: '主线已完成；用户自行部署后可选联调' }
  const missingProfiles = Object.entries(st.repos).filter(([, r]) => !r.profile).map(([l]) => l)
  out({
    dir: st.dir, requirement: st.requirement, route: st.route, stackScope: st.stackScope,
    lanes: activeLanes(st), backendMode: st.repos.be ? st.repos.be.mode : null,
    needsBackendWrite: st.needsBackendWrite, apiVersion: st.apiVersion, missingProfiles,
    next, stale: rows.filter(r => r.status === 'stale').map(r => r.stage), stages: rows,
  })
}

function cmdGet(o) {
  need(o, 'dir', 'key')
  out({ key: o.key, value: getPath(load(o.dir), o.key) ?? null })
}

function cmdSet(o) {
  need(o, 'dir', 'key')
  if (o.value === undefined) fail('缺 --value')
  const st = load(o.dir)
  let val
  try { val = JSON.parse(o.value) } catch (_) { val = o.value }
  setPath(st, o.key, val)
  save(st)
  out({ key: o.key, value: val })
}

function cmdStart(o) {
  need(o, 'dir', 'stage')
  const st = load(o.dir)
  if (LANE_STAGES.includes(o.stage) && o.lane && !activeLanes(st).includes(o.lane)) {
    fail(`泳道 ${o.lane} 未启用（stackScope=${st.stackScope}，后端 mode=${st.repos.be ? st.repos.be.mode : '无后端仓'}）`)
  }
  const s = slot(st, o.stage, o.lane)
  const rerun = s.round > 0
  if (o.stage === 'api') {
    if (st.apiVersion === 0 || ['done', 'stale'].includes(s.status)) {
      st.apiVersion += 1
      s.round = 0
    }
  }
  if (rerun && DOWNSTREAM[o.stage]) markStale(st, o.stage, o.lane)
  s.round += 1
  s.status = 'running'
  s.startedAt = now()
  s.score = null
  s.paths = pathsFor(st, o.stage, o.lane, s.round)
  for (const p of Object.values(s.paths)) fs.mkdirSync(path.dirname(p), { recursive: true })
  save(st)
  out({ stage: o.stage, lane: o.lane || null, round: s.round, apiVersion: st.apiVersion, paths: s.paths })
}

function kindOf(role, stage) {
  if (['analyst', 'api-designer', 'profiler', 'verifier', 'reviewer'].includes(role)) return role
  if (role === 'fe-developer' || role === 'be-developer') return 'developer'
  if (role === 'fe-architect' || role === 'be-architect') return stage === 'design' ? 'author' : 'reviewer'
  fail(`未知角色 ${role}`)
}

function readJsonFile(p, errors, label) {
  if (typeof p !== 'string' || !fs.existsSync(p)) { errors.push(`${label} 文件不存在：${p}`); return null }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { errors.push(`${label} 不是合法 JSON：${e.message}`); return null }
}

const isStr = v => typeof v === 'string' && v.trim() !== ''
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const isArr = Array.isArray

function checkCounts(obj, keys, label, errors) {
  if (!obj || typeof obj !== 'object') { errors.push(`缺 ${label}`); return }
  for (const k of keys) if (!isNum(obj[k])) errors.push(`${label}.${k} 必须是数字`)
}

function validateReviewerItems(r, o, errors, record) {
  const items = readJsonFile(r.items, errors, 'items')
  if (!o.checklist || !o.groups) { errors.push('评审回执需要编排者提供 --checklist 与 --groups'); return }
  const groups = o.groups.split(',').map(s => s.trim()).filter(Boolean)
  const checklist = parseChecklist(o.checklist)
  const assigned = assignedItems(checklist, groups, o.lane, o['min-severity'])
  record.assignment = { checklist: o.checklist, groups, minSeverity: o['min-severity'] || 'minor', lane: o.lane || null }
  if (!isArr(items)) { if (items) errors.push('items 必须是数组'); return }
  const got = new Map(items.map(it => [it && it.id, it]))
  const missing = assigned.filter(a => !got.has(a.id)).map(a => a.id)
  const extra = items.map(it => it && it.id).filter(id => !assigned.some(a => a.id === id))
  if (missing.length) errors.push(`漏判的清单项：${missing.join(', ')}`)
  if (extra.length) errors.push(`不属于本次指派的清单项：${extra.join(', ')}`)
  for (const a of assigned) {
    const it = got.get(a.id)
    if (!it) continue
    if (!['pass', 'fail', 'na'].includes(it.verdict)) { errors.push(`${a.id} 的 verdict 必须是 pass / fail / na`); continue }
    if (it.verdict === 'fail' && (!isStr(it.location) || !isStr(it.fix))) errors.push(`${a.id} 判 fail 必须给 location 与 fix`)
    if (it.verdict === 'fail' && a.severity === 'critical' && !isStr(it.consequence)) errors.push(`${a.id} 是 critical，判 fail 必须写 consequence`)
    if (it.verdict === 'pass' && a.severity === 'critical' && !isStr(it.evidence)) errors.push(`${a.id} 是 critical，判 pass 必须写 evidence（查了哪里）`)
    if (it.verdict === 'na' && !isStr(it.reason)) errors.push(`${a.id} 判 na 必须写 reason`)
  }
  if (groups.includes('BLAST')) {
    if (!isStr(r.changeSummary)) errors.push('负责 BLAST 组时必须给 changeSummary')
    if (!isStr(r.commitMessage)) errors.push('负责 BLAST 组时必须给 commitMessage')
    if (!isArr(r.manualChecks)) errors.push('负责 BLAST 组时必须给 manualChecks 数组')
  }
}

function cmdReceipt(o) {
  need(o, 'dir', 'stage', 'role', 'json')
  const st = load(o.dir)
  const s = slot(st, o.stage, o.lane)
  if (s.status !== 'running') fail(`${o.stage}${o.lane ? `/${o.lane}` : ''} 不在进行中（当前 ${s.status}），先 start`)
  let r
  try {
    r = JSON.parse(o.json.startsWith('@') ? fs.readFileSync(o.json.slice(1), 'utf8') : o.json)
  } catch (e) {
    out({ valid: false, errors: [`回执不是合法 JSON：${e.message}`] })
    process.exit(1)
  }
  const kind = kindOf(o.role, o.stage)
  const errors = []
  const record = { role: o.role, kind, reviewer: o.reviewer || null, round: s.round, at: now() }

  if (!['ok', 'blocked', 'needs_input', 'failed'].includes(r.status)) errors.push('status 必须是 ok / blocked / needs_input / failed')
  if (!isStr(r.summary)) errors.push('缺 summary')
  if (!isArr(r.questions)) errors.push('questions 必须是数组')
  if (!isStr(r.report)) errors.push('缺 report')
  else {
    r.report = path.isAbsolute(r.report) ? r.report : path.join(st.dir, r.report)
    if (!fs.existsSync(r.report)) errors.push(`报告文件不存在：${r.report}`)
    else {
      const lines = new Set(fs.readFileSync(r.report, 'utf8').split('\n').map(l => l.trim()))
      const missing = templateHeadings(kind === 'reviewer' ? 'reviewer' : o.role).filter(h => !lines.has(h))
      if (missing.length) errors.push(`报告缺少模板段落：${missing.join('、')}`)
    }
  }

  if (r.status === 'ok') {
    switch (kind) {
      case 'analyst':
        if (!['lite', 'full', 'blocked'].includes(r.route)) errors.push('route 必须是 lite / full / blocked')
        if (!['fe', 'be', 'fullstack'].includes(r.stackScope)) errors.push('stackScope 必须是 fe / be / fullstack')
        checkCounts(r.apis, ['existing', 'new', 'change'], 'apis', errors)
        if (typeof r.needsBackendWrite !== 'boolean') errors.push('needsBackendWrite 必须是布尔值')
        if (typeof r.uiChange !== 'boolean') errors.push('uiChange 必须是布尔值')
        if (!isArr(r.designAssets)) errors.push('designAssets 必须是数组')
        if (!isArr(r.decisionCards) || r.decisionCards.some(c => !c || !isStr(c.id) || !isStr(c.title) || !isStr(c.recommendation))) errors.push('decisionCards 每项必须有 id / title / recommendation')
        if (r.apis && r.needsBackendWrite !== (r.apis.new + r.apis.change > 0)) errors.push('needsBackendWrite 必须等于「存在 new 或 change 接口」')
        if (r.needsBackendWrite && r.stackScope === 'fe') errors.push('存在 new / change 接口时 stackScope 不能是 fe')
        break
      case 'api-designer': {
        if (r.version !== st.apiVersion) errors.push(`version 必须是当前版本 ${st.apiVersion}`)
        checkCounts(r.endpoints, ['existing', 'new', 'change'], 'endpoints', errors)
        const api = readJsonFile(r.apiJson, errors, 'apiJson')
        if (api && !isArr(api)) errors.push('apiJson 必须是数组')
        if (isArr(api)) api.forEach((e, i) => {
          if (!e || !isStr(e.id) || !isStr(e.method) || !isStr(e.path) || !e.path.startsWith('/')) errors.push(`apiJson[${i}] 必须有 id、method、以 / 开头的 path`)
        })
        break
      }
      case 'author': {
        if (!['fe', 'be'].includes(o.lane)) errors.push('方案回执需要 --lane fe|be')
        if (!isStr(r.filesList) || !fs.existsSync(r.filesList)) errors.push(`filesList 文件不存在：${r.filesList}`)
        else if (!fs.readFileSync(r.filesList, 'utf8').split('\n').some(l => l.trim() && !l.trim().startsWith('#'))) errors.push('filesList 是空的')
        if (!isNum(r.taskCount)) errors.push('taskCount 必须是数字')
        if (!isArr(r.needsClarification)) errors.push('needsClarification 必须是数组')
        break
      }
      case 'developer':
        if (!isArr(r.commands) || r.commands.some(c => !c || !isStr(c.cmd) || !isNum(c.exit))) errors.push('commands 每项必须有 cmd 与数字 exit')
        if (!isArr(r.outOfScopeClaimed)) errors.push('outOfScopeClaimed 必须是数组')
        if (o.role === 'be-developer') checkCounts(r.contractTests, ['expected', 'written', 'passed'], 'contractTests', errors)
        break
      case 'reviewer':
        validateReviewerItems(r, o, errors, record)
        break
      case 'verifier': {
        const criteria = readJsonFile(r.criteria, errors, 'criteria')
        if (criteria && !isArr(criteria)) errors.push('criteria 必须是数组')
        if (isArr(criteria)) criteria.forEach((c, i) => {
          if (!c || !isStr(c.id) || !isStr(c.criterion) || !['pass', 'fail', 'unverified'].includes(c.result)) errors.push(`criteria[${i}] 必须有 id、criterion、result（pass / fail / unverified）`)
          else if (c.result !== 'unverified' && !isStr(c.evidence)) errors.push(`criteria[${i}] 判 ${c.result} 必须有 evidence`)
        })
        for (const k of ['regressionFailures', 'contractTestFailures', 'blockers']) if (!isArr(r[k])) errors.push(`${k} 必须是数组`)
        break
      }
      case 'profiler':
        if (!isStr(r.profilePath) || !fs.existsSync(r.profilePath)) errors.push(`profilePath 文件不存在：${r.profilePath}`)
        if (!isArr(r.unknowns)) errors.push('unknowns 必须是数组')
        break
      default:
        break
    }
  }

  if (errors.length) {
    out({ valid: false, errors })
    process.exit(1)
  }

  const keep = ['status', 'report', 'summary', 'questions', 'items', 'counts', 'criticalFails', 'changeSummary', 'commitMessage',
    'manualChecks', 'criteria', 'regressionFailures', 'contractTestFailures', 'blockers', 'commands', 'outOfScopeClaimed',
    'contractTests', 'filesList', 'taskCount', 'needsClarification', 'apiJson', 'endpoints', 'version', 'profilePath', 'unknowns', 'envelope']
  for (const k of keep) if (r[k] !== undefined) record[k] = r[k]
  s.receipts.push(record)

  const hints = []
  if (r.status === 'ok' && kind === 'analyst') {
    st.route = r.route
    st.stackScope = r.stackScope
    st.needsBackendWrite = r.needsBackendWrite
    st.triage = { apis: r.apis, uiChange: r.uiChange, designAssets: r.designAssets, decisionCards: r.decisionCards }
    if (r.needsBackendWrite && (!st.repos.be || st.repos.be.mode !== 'write')) hints.push('需要新增 / 变更接口：先问用户后端仓是否可写（state.js set --key repos.be.mode）')
  }
  if (r.status === 'ok' && kind === 'profiler') {
    st.repos[o.lane].profile = r.profilePath
    if (r.envelope) st.repos[o.lane].envelope = r.envelope
  }
  if (r.status === 'ok' && kind === 'api-designer') st.apiCounts = r.endpoints
  if (kind === 'developer' && isArr(r.commands) && r.commands.some(c => c.exit !== 0)) hints.push('有自验收命令未通过，本阶段不能算完成')
  save(st)
  out({ valid: true, stage: o.stage, lane: o.lane || null, round: s.round, status: r.status, hints })
}

function cmdScore(o) {
  need(o, 'dir', 'stage', 'expect')
  const st = load(o.dir)
  const s = slot(st, o.stage, o.lane)
  const expected = o.expect.split(',').map(x => x.trim()).filter(Boolean)
  const recs = s.receipts.filter(r => r.round === s.round && (r.kind === 'reviewer' || r.kind === 'verifier') && r.status === 'ok')
  const missing = expected.filter(k => !recs.some(r => r.reviewer === k))
  const res = { stage: o.stage, lane: o.lane || null, round: s.round, score: null, passed: false, incomplete: missing.length > 0, missing, criticalFails: [], fails: [], veto: [], unverified: [] }
  let passW = 0
  let totalW = 0
  if (!res.incomplete) {
    for (const r of recs) {
      if (r.kind === 'reviewer') {
        const checklist = parseChecklist(r.assignment.checklist)
        for (const it of JSON.parse(fs.readFileSync(r.items, 'utf8'))) {
          const meta = checklist[it.id]
          const w = WEIGHT[meta.severity]
          if (it.verdict === 'na') continue
          totalW += w
          if (it.verdict === 'pass') { passW += w; continue }
          res.fails.push({ reviewer: r.reviewer, id: it.id, severity: meta.severity, text: meta.text, location: it.location, fix: it.fix, consequence: it.consequence || '' })
          if (meta.severity === 'critical') res.criticalFails.push(it.id)
        }
      } else {
        for (const c of JSON.parse(fs.readFileSync(r.criteria, 'utf8'))) {
          totalW += CRITERION_WEIGHT
          if (c.result === 'pass') passW += CRITERION_WEIGHT
          else if (c.result === 'fail') res.veto.push(`验收标准取证失败：${c.id} ${c.criterion}`)
          else res.unverified.push(`${c.id} ${c.criterion}`)
        }
        for (const f of r.regressionFailures || []) res.veto.push(`回归失败：${f}`)
        for (const f of r.contractTestFailures || []) res.veto.push(`契约测试失败：${f}`)
      }
    }
    res.score = totalW ? Math.round((passW / totalW) * 100) : 100
    res.passed = res.score >= 80 && res.criticalFails.length === 0 && res.veto.length === 0
  }
  s.score = res
  if (s.paths && s.paths.summary) {
    res.summary = s.paths.summary
    fs.writeFileSync(s.paths.summary, renderScore(st, o, res, recs))
  }
  save(st)
  out(res)
}

function renderScore(st, o, res, recs) {
  const L = []
  L.push(`# 评审汇总 · ${o.stage}${o.lane ? ` · ${o.lane}` : ''} · 第 ${res.round} 轮`, '')
  L.push('| 项 | 值 |', '|----|----|')
  L.push(`| 分数 | ${res.score === null ? '无法计算' : `${res.score}/100`} |`)
  L.push(`| 结论 | ${res.incomplete ? '⚠️ 无法完成（评审员缺失）' : res.passed ? '✅ 通过' : '❌ 不通过'} |`)
  L.push(`| 规则 | ≥ 80 分，且无 critical 不通过项、无一票否决项 |`, '')
  if (res.missing.length) L.push(`缺失的评审员：${res.missing.join('、')}`, '')
  L.push('## 评审员', '')
  for (const r of recs) L.push(`- ${r.reviewer}（${r.role}）：${r.report}`)
  L.push('', '## 不通过项', '')
  if (!res.fails.length) L.push('无')
  else {
    L.push('| 评审员 | 编号 | 严重度 | 检查项 | 位置 | 修法 | 后果 |', '|---|---|---|---|---|---|---|')
    for (const f of res.fails) L.push(`| ${f.reviewer} | ${f.id} | ${f.severity} | ${f.text} | ${f.location} | ${f.fix} | ${f.consequence} |`)
  }
  L.push('', '## 一票否决', '', ...(res.veto.length ? res.veto.map(v => `- ${v}`) : ['无']))
  L.push('', '## 未验证（进入人工验证清单）', '', ...(res.unverified.length ? res.unverified.map(v => `- ${v}`) : ['无']), '')
  return L.join('\n')
}

function cmdFinish(o) {
  need(o, 'dir', 'stage')
  const st = load(o.dir)
  const done = []
  for (const [lane, s] of slotsFor(st, o.stage, o.lane)) {
    s.status = 'awaiting_gate'
    s.finishedAt = now()
    done.push(lane)
  }
  save(st)
  out({ stage: o.stage, lanes: done, status: 'awaiting_gate' })
}

function cmdGate(o) {
  need(o, 'dir', 'stage', 'choice')
  const choices = ['next', 'adjust', 'stop', 'fix', 'accept', 'skip', 'confirm']
  if (!choices.includes(o.choice)) fail(`--choice 必须是 ${choices.join(' / ')}`)
  const st = load(o.dir)
  const changed = []
  for (const [lane, s] of slotsFor(st, o.stage, o.lane)) {
    let choice = o.choice
    if (choice === 'next' && s.score && !s.score.passed) choice = 'accept'
    if (choice === 'next' || choice === 'confirm') s.status = 'done'
    else if (choice === 'accept') {
      s.status = 'done'
      st.tradeoffs = st.tradeoffs || []
      st.tradeoffs.push({ stage: o.stage, lane, note: o.note || '用户选择接受现状', at: now() })
    } else if (choice === 'adjust') s.status = 'running'
    else if (choice === 'skip') s.status = 'skipped'
    else if (choice === 'fix') {
      if (!['review', 'test', 'integrate'].includes(o.stage)) fail('fix 只用于 review / test / integrate')
      if (o.stage === 'integrate') s.status = 'running'
      else {
        s.status = 'stale'
        const dev = slot(st, 'dev', lane)
        dev.status = 'pending'
      }
    }
    st.gates.push({ stage: o.stage, lane, choice, note: o.note || '', at: now() })
    changed.push({ lane, status: s.status, choice })
  }
  save(st)
  out({ stage: o.stage, changed })
}

function cmdDecide(o) {
  need(o, 'dir', 'card', 'choice')
  const st = load(o.dir)
  st.decisions = st.decisions.filter(d => d.card !== o.card)
  st.decisions.push({ card: o.card, choice: o.choice, at: now() })
  save(st)
  out({ decisions: st.decisions })
}

function latestReceipt(s, pred) {
  if (!s) return null
  const list = (s.receipts || []).filter(r => r.round === s.round && pred(r))
  return list.length ? list[list.length - 1] : null
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) { return null }
}

function cmdDeliver(o) {
  need(o, 'dir')
  const st = load(o.dir)
  const s = slot(st, 'deliver')
  s.round += 1
  s.paths = pathsFor(st, 'deliver', null, s.round)
  const L = []
  L.push(`# 交付说明 · ${st.requirement}`, '')
  L.push('> 由 state.js 根据流程状态生成。流程不执行任何 git 写操作：是否提交、怎样提交、何时合入，全部由你决定。', '')
  L.push('## 阶段结果', '', '| 阶段 | 泳道 | 状态 | 轮次 | 分数 |', '|------|------|------|------|------|')
  for (const stage of STAGES.filter(x => x !== 'deliver')) {
    const entries = LANE_STAGES.includes(stage) ? activeLanes(st).map(l => [l, st.stages[stage] && st.stages[stage].lanes && st.stages[stage].lanes[l]]) : [['—', st.stages[stage]]]
    for (const [lane, x] of entries) {
      if (!x) continue
      L.push(`| ${stage} | ${lane} | ${x.status} | ${x.round} | ${x.score && x.score.score !== null ? x.score.score : '—'} |`)
    }
  }
  L.push('', '## 决策卡裁定', '', ...(st.decisions.length ? st.decisions.map(d => `- ${d.card}：${d.choice}`) : ['无']))
  L.push('', '## 接受现状的取舍', '', ...((st.tradeoffs || []).length ? st.tradeoffs.map(t => `- ${t.stage}${t.lane ? `/${t.lane}` : ''}：${t.note}`) : ['无']))
  const manual = []
  for (const lane of activeLanes(st)) {
    const rv = st.stages.review && st.stages.review.lanes && st.stages.review.lanes[lane]
    const blast = latestReceipt(rv, r => r.changeSummary)
    const scope = rv && rv.paths ? readJsonSafe(rv.paths.scope) : null
    L.push('', `## ${lane === 'fe' ? '前端' : '后端'}仓 · ${st.repos[lane].path}`, '')
    L.push(`**改动摘要**：${blast ? blast.changeSummary : '（未取得代码评审结论）'}`, '')
    if (scope) {
      L.push(`**改动文件（${scope.changed.length}）**`, '```', ...scope.changed, '```')
      if (scope.outOfScope === null) L.push('**越界文件**：未提供需求涉及文件清单，未判越界（lite 档常见），请你自行核对上面的改动文件')
      else L.push('**越界文件（建议先回退再提交）**', '```', ...(scope.outOfScope.length ? scope.outOfScope : ['无']), '```')
      if (scope.preexisting.length) L.push('**开工前已有的改动（不属于本次需求，未纳入）**', '```', ...scope.preexisting, '```')
    } else L.push('**改动文件**：未找到 scope 结果（review 阶段应先运行 scope.js diff）')
    if (blast) {
      L.push('**建议 commit message**', '```', blast.commitMessage, '```')
      for (const m of blast.manualChecks || []) manual.push(`[${lane}] ${m}`)
    }
    const ts = st.stages.test && st.stages.test.lanes && st.stages.test.lanes[lane]
    const verify = latestReceipt(ts, r => r.kind === 'verifier')
    const criteria = verify ? readJsonSafe(verify.criteria) : null
    for (const c of criteria || []) if (c.result === 'unverified') manual.push(`[${lane}] 【未验证的验收标准】${c.id} ${c.criterion}`)
  }
  const ig = st.stages.integrate
  if (ig && ig.paths) {
    const conf = readJsonSafe(ig.paths.conformance)
    L.push('', '## 联调', '')
    if (conf) {
      L.push(`联调环境 ${conf.baseUrl}：✅ ${conf.summary.pass} · 🟡 ${conf.summary.partial} · ❌ ${conf.summary.fail} · ⏳ ${conf.summary.unverified}`)
      for (const r of conf.results) if (r.status === 'PARTIAL' || r.status === 'UNVERIFIED') manual.push(`[联调] ${r.id} ${r.method} ${r.path}：${r.status} ${r.reason || r.unchecked.join('；')}`)
    }
    const igScope = readJsonSafe(ig.paths.scope)
    if (igScope) L.push('联调改动文件：', '```', ...igScope.changed, '```')
  }
  L.push('', '## 必须人工验证的点（提交前逐条确认）', '', ...(manual.length ? manual.map(m => `- [ ] ${m}`) : ['无']), '')
  fs.writeFileSync(s.paths.report, L.join('\n'))
  if (s.status !== 'done') s.status = 'awaiting_gate'
  save(st)
  out({ report: s.paths.report, manualChecks: manual.length })
}

function render(st) {
  const L = []
  L.push(`# MEMORY · ${st.requirement}`, '', '> 由 state.js 根据 state.json 生成，请勿手改。查看下一步：`node <skill>/tools/state.js status --dir <本目录>`。', '')
  L.push('| 字段 | 值 |', '|------|-----|')
  L.push(`| 分档 | ${st.route || '待定'} |`, `| 技术栈范围 | ${st.stackScope || '待定'} |`, `| 工作区 | ${st.workspaceRoot}（${st.workspaceMode}） |`)
  L.push(`| 接口定义版本 | ${st.apiVersion ? `v${st.apiVersion}` : '—'} |`, `| 设计稿 | ${st.design.url || st.design.noDesignReason || '—'} |`, `| 更新时间 | ${st.updatedAt} |`, '')
  L.push('## 仓库', '', '| 泳道 | 路径 | 模式 | 画像 |', '|------|------|------|------|')
  for (const [lane, r] of Object.entries(st.repos)) L.push(`| ${lane} | ${r.path} | ${r.mode} | ${r.profile || '缺失'} |`)
  L.push('', '## 阶段', '', '| 阶段 | 泳道 | 状态 | 轮次 | 分数 |', '|------|------|------|------|------|')
  for (const stage of STAGES) {
    const x = st.stages[stage]
    if (!x) { L.push(`| ${stage} | — | pending | 0 | — |`); continue }
    if (x.lanes) for (const [lane, y] of Object.entries(x.lanes)) L.push(`| ${stage} | ${lane} | ${y.status} | ${y.round} | ${y.score && y.score.score !== null ? y.score.score : '—'} |`)
    else L.push(`| ${stage} | — | ${x.status} | ${x.round} | ${x.score && x.score.score !== null ? x.score.score : '—'} |`)
  }
  L.push('', '## 决策卡裁定', '', ...(st.decisions.length ? st.decisions.map(d => `- ${d.card}：${d.choice}（${d.at}）`) : ['无']))
  L.push('', '## 闸门记录', '', ...(st.gates.length ? st.gates.map(g => `- ${g.at} ${g.stage}${g.lane ? `/${g.lane}` : ''}：${g.choice}${g.note ? ` — ${g.note}` : ''}`) : ['无']), '')
  return L.join('\n')
}

const COMMANDS = {
  init: cmdInit, status: cmdStatus, get: cmdGet, set: cmdSet, start: cmdStart, receipt: cmdReceipt,
  score: cmdScore, finish: cmdFinish, gate: cmdGate, decide: cmdDecide, deliver: cmdDeliver,
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2))
  const fn = COMMANDS[o.cmd]
  if (!fn) fail(`未知命令 ${o.cmd}；--help 查看用法`)
  fn(o)
}

module.exports = { templateHeadings, parseChecklist, assignedItems }
