'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { mkTmp, write, gitInit, runTool } = require('./helpers')
const { templateHeadings, parseChecklist, assignedItems } = require('../../../just-flf/tools/state')

function st(args) {
  return runTool('state.js', args)
}
function ok(r) {
  assert.equal(r.code, 0, `${r.stderr}${r.stdout}`)
  return r.json
}
function report(file, role, skip = []) {
  const body = templateHeadings(role).filter(h => !skip.includes(h)).map(h => `${h}\n无\n`).join('\n')
  write(path.dirname(file), path.basename(file), `# 报告\n\n${body}`)
}

function setup() {
  const root = mkTmp()
  const web = gitInit(path.join(root, 'web'))
  write(web, 'package.json', JSON.stringify({ dependencies: { vue: '^3.4.0' } }))
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'web' }] }))
  const ws = runTool('workspace.js', ['--cwd', root, '--home', root])
  const wsFile = write(root, 'ws.json', ws.stdout)
  const init = ok(st(['init', '--workspace-json', wsFile, '--requirement', '积分看板']))
  return { root, web, d: init.dir }
}

function triageToDev(ctx) {
  const { d } = ctx
  const t = ok(st(['start', '--dir', d, '--stage', 'triage']))
  report(t.paths.report, 'analyst')
  const receipt = {
    status: 'ok', report: t.paths.report, summary: 's', questions: [], route: 'lite', stackScope: 'fe',
    apis: { existing: 0, new: 0, change: 0 }, needsBackendWrite: false, uiChange: false, designAssets: [], decisionCards: [],
  }
  ok(st(['receipt', '--dir', d, '--stage', 'triage', '--role', 'analyst', '--json', JSON.stringify(receipt)]))
  ok(st(['finish', '--dir', d, '--stage', 'triage']))
  ok(st(['gate', '--dir', d, '--stage', 'triage', '--choice', 'next']))
  ok(st(['gate', '--dir', d, '--stage', 'api', '--choice', 'skip']))
  const dev = ok(st(['start', '--dir', d, '--stage', 'dev', '--lane', 'fe']))
  report(dev.paths.report, 'fe-developer')
  ok(st(['receipt', '--dir', d, '--stage', 'dev', '--lane', 'fe', '--role', 'fe-developer', '--json',
    JSON.stringify({ status: 'ok', report: dev.paths.report, summary: 's', questions: [], commands: [{ cmd: 'tsc', exit: 0 }], outOfScopeClaimed: [] })]))
  ok(st(['finish', '--dir', d, '--stage', 'dev']))
  ok(st(['gate', '--dir', d, '--stage', 'dev', '--choice', 'next']))
}

function reviewWith(ctx, mutate) {
  const { d } = ctx
  const rv = ok(st(['start', '--dir', d, '--stage', 'review', '--lane', 'fe']))
  write(path.dirname(rv.paths.scope), path.basename(rv.paths.scope), JSON.stringify({ changed: ['src/a.vue'], preexisting: [], requirementFiles: null, outOfScope: null }))
  const groups = ['DESIGN', 'ARCH', 'BLAST', 'LOGIC', 'ROBUST', 'TYPE', 'CONV', 'SEC']
  const items = assignedItems(parseChecklist('checklists/code.md'), groups, 'fe', 'major')
    .map(it => ({ id: it.id, verdict: 'pass', evidence: 'src/a.vue:1' }))
  mutate(items)
  const file = rv.paths.review.replace('{reviewer}', 'all')
  report(file, 'reviewer')
  const itemsFile = write(path.dirname(file), path.basename(file).replace(/\.md$/, '.items.json'), JSON.stringify(items))
  const r = st(['receipt', '--dir', d, '--stage', 'review', '--lane', 'fe', '--role', 'reviewer', '--reviewer', 'all',
    '--checklist', 'checklists/code.md', '--groups', groups.join(','), '--min-severity', 'major', '--json',
    JSON.stringify({ status: 'ok', report: file, summary: 's', questions: [], items: itemsFile, counts: {}, criticalFails: [],
      changeSummary: '新增积分看板页', commitMessage: 'feat(points): 积分看板', manualChecks: ['打开积分看板页确认空态'] })])
  return { rv, r }
}

test('回执缺少模板段落 → 退出码 1 并列出缺的段落', () => {
  const { d } = setup()
  const t = ok(st(['start', '--dir', d, '--stage', 'triage']))
  report(t.paths.report, 'analyst', ['## 决策卡'])
  const r = st(['receipt', '--dir', d, '--stage', 'triage', '--role', 'analyst', '--json', JSON.stringify({
    status: 'ok', report: t.paths.report, summary: 's', questions: [], route: 'lite', stackScope: 'fe',
    apis: { existing: 0, new: 0, change: 0 }, needsBackendWrite: false, uiChange: false, designAssets: [], decisionCards: [] })])
  assert.equal(r.code, 1)
  assert.match(r.json.errors.join(), /## 决策卡/)
})

test('lite 流程：评审通过 → 交付说明含 commit message 与人工验证点', () => {
  const ctx = setup()
  triageToDev(ctx)
  assert.equal(ok(st(['status', '--dir', ctx.d])).next.stage, 'review')
  const { r } = reviewWith(ctx, items => {
    const major = items.find(it => it.id === 'ARCH-01')
    Object.assign(major, { verdict: 'fail', location: 'src/a.vue:10', fix: '拆分文件' })
  })
  ok(r)
  const sc = ok(st(['score', '--dir', ctx.d, '--stage', 'review', '--lane', 'fe', '--expect', 'all']))
  assert.equal(sc.passed, true)
  assert.ok(sc.score >= 80 && sc.score < 100)
  assert.ok(fs.existsSync(sc.summary))
  ok(st(['finish', '--dir', ctx.d, '--stage', 'review']))
  ok(st(['gate', '--dir', ctx.d, '--stage', 'review', '--choice', 'next']))
  const out = ok(st(['deliver', '--dir', ctx.d]))
  const text = fs.readFileSync(out.report, 'utf8')
  assert.match(text, /feat\(points\): 积分看板/)
  assert.match(text, /未判越界/)
  assert.match(text, /打开积分看板页确认空态/)
  assert.ok(fs.existsSync(path.join(ctx.d, 'MEMORY.md')))
})

test('critical 不通过 → 不通过；gate fix 后下一步回到 dev，review 标为过期', () => {
  const ctx = setup()
  triageToDev(ctx)
  const { r } = reviewWith(ctx, items => {
    const crit = items.find(it => it.id === 'SEC-01')
    Object.assign(crit, { verdict: 'fail', location: 'src/a.vue:3', fix: '移除硬编码 token', consequence: 'token 泄露' })
    delete crit.evidence
  })
  ok(r)
  const sc = ok(st(['score', '--dir', ctx.d, '--stage', 'review', '--lane', 'fe', '--expect', 'all']))
  assert.equal(sc.passed, false)
  assert.deepEqual(sc.criticalFails, ['SEC-01'])
  ok(st(['finish', '--dir', ctx.d, '--stage', 'review']))
  ok(st(['gate', '--dir', ctx.d, '--stage', 'review', '--choice', 'fix']))
  const s = ok(st(['status', '--dir', ctx.d]))
  assert.equal(s.next.stage, 'dev')
  assert.deepEqual(s.stale, ['review'])
})

test('评审回执漏判清单项、critical 通过不写 evidence → 退出码 1', () => {
  const ctx = setup()
  triageToDev(ctx)
  const { r } = reviewWith(ctx, items => {
    items.pop()
    delete items.find(it => it.id === 'SEC-01').evidence
  })
  assert.equal(r.code, 1)
  const errs = r.json.errors.join('\n')
  assert.match(errs, /漏判的清单项/)
  assert.match(errs, /SEC-01 是 critical，判 pass 必须写 evidence/)
})

test('项目规则红线可把 major 项升级为 critical → 一票否决', () => {
  const ctx = setup()
  triageToDev(ctx)
  const { r } = reviewWith(ctx, items => {
    Object.assign(items.find(it => it.id === 'ARCH-01'), {
      verdict: 'fail', location: 'src/a.vue:10', fix: '拆分', escalate: 'critical', rule: 'fe-rules.mdc R3', consequence: '首屏卡顿',
    })
  })
  ok(r)
  const sc = ok(st(['score', '--dir', ctx.d, '--stage', 'review', '--lane', 'fe', '--expect', 'all']))
  assert.equal(sc.passed, false)
  assert.deepEqual(sc.criticalFails, ['ARCH-01'])
  assert.match(sc.fails[0].severity, /fe-rules\.mdc R3 红线升级/)
})

test('escalate 缺少 rule → 回执不合格', () => {
  const ctx = setup()
  triageToDev(ctx)
  const { r } = reviewWith(ctx, items => {
    Object.assign(items.find(it => it.id === 'ARCH-01'), { verdict: 'fail', location: 'x:1', fix: 'y', escalate: 'critical', consequence: 'z' })
  })
  assert.equal(r.code, 1)
  assert.match(r.json.errors.join(), /escalate 必须写 rule/)
})

test('评审员缺失 → 无法完成，不计分', () => {
  const ctx = setup()
  triageToDev(ctx)
  ok(reviewWith(ctx, () => {}).r)
  const sc = ok(st(['score', '--dir', ctx.d, '--stage', 'review', '--lane', 'fe', '--expect', 'all,extra']))
  assert.equal(sc.incomplete, true)
  assert.equal(sc.passed, false)
  assert.deepEqual(sc.missing, ['extra'])
})

test('api 阶段完成后重跑 → 版本 +1，下游已完成的阶段标为过期', () => {
  const ctx = setup()
  triageToDev(ctx)
  const a1 = ok(st(['start', '--dir', ctx.d, '--stage', 'api']))
  assert.equal(a1.apiVersion, 1)
  ok(st(['finish', '--dir', ctx.d, '--stage', 'api']))
  ok(st(['gate', '--dir', ctx.d, '--stage', 'api', '--choice', 'next']))
  const a2 = ok(st(['start', '--dir', ctx.d, '--stage', 'api']))
  assert.equal(a2.apiVersion, 2)
  assert.match(a2.paths.report, /api-v2\.md$/)
  assert.ok(ok(st(['status', '--dir', ctx.d])).stale.includes('dev'))
})

test('工作区在 git 仓内时，init 写入本地 exclude', () => {
  const root = mkTmp()
  const web = gitInit(path.join(root, 'web'))
  write(web, 'package.json', JSON.stringify({ dependencies: { vue: '^3.4.0' } }))
  const ws = runTool('workspace.js', ['--cwd', web, '--home', root])
  const wsFile = write(root, 'ws.json', ws.stdout)
  ok(st(['init', '--workspace-json', wsFile, '--requirement', 'r1']))
  assert.match(fs.readFileSync(path.join(web, '.git', 'info', 'exclude'), 'utf8'), /^\/\.just-flf\/$/m)
})
