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

test('祖先目录的 .code-workspace 不包含当前仓 → 忽略它，按单仓模式并记 note', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'other'))
  const mine = feRepo(path.join(root, 'mine'))
  write(root, 'team.code-workspace', JSON.stringify({ folders: [{ path: 'other' }] }))
  const r = detect(mine, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'single-repo')
  assert.equal(r.json.workspaceRoot, mine)
  assert.equal(r.json.repos.length, 1)
  assert.equal(r.json.repos[0].path, mine)
  assert.ok(r.json.notes.some(n => n.includes(path.join(root, 'team.code-workspace'))), JSON.stringify(r.json.notes))
})

test('工作区 folders 指向非仓库根目录 → 记 note，一个仓都没识别到时提问', () => {
  const root = mkTmp()
  const mono = gitInit(path.join(root, 'mono'))
  write(mono, 'frontend/package.json', '{}')
  write(mono, 'backend/pom.xml', '<project/>')
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'mono/frontend' }, { path: 'mono/backend' }] }))
  const r = detect(root, root)
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(r.json.repos, [])
  assert.equal(r.json.notes.filter(n => n.includes('不是 git 仓根目录')).length, 2, JSON.stringify(r.json.notes))
  assert.ok(r.json.questions.some(q => q.id === 'no_repos'), JSON.stringify(r.json.questions))
})

test('工作区文件位于当前仓根目录（元仓库）→ 仍按工作区模式', () => {
  const root = mkTmp()
  const meta = gitInit(path.join(root, 'meta'))
  feRepo(path.join(meta, 'web'))
  write(meta, 'team.code-workspace', JSON.stringify({ folders: [{ path: 'web' }] }))
  const r = detect(meta, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'workspace')
  assert.equal(r.json.workspaceRoot, meta)
  assert.deepEqual(r.json.repos.map(x => x.name), ['web'])
  assert.ok(!r.json.notes.some(n => n.includes('忽略不包含当前仓')), JSON.stringify(r.json.notes))
})

test('从工作区成员仓内运行仍是工作区模式', () => {
  const root = mkTmp()
  const web = feRepo(path.join(root, 'web'))
  beRepo(path.join(root, 'server'))
  write(root, 'w.code-workspace', JSON.stringify({ folders: [{ path: 'web' }, { path: 'server' }] }))
  const r = detect(web, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'workspace')
  assert.equal(r.json.workspaceRoot, root)
  assert.deepEqual(r.json.repos.map(x => x.name), ['web', 'server'])
})

test('工作区文件位于外层 git 仓的子目录中 → 仍按工作区模式', () => {
  const root = mkTmp()
  const encl = gitInit(path.join(root, 'encl'))
  feRepo(path.join(encl, 'work/web'))
  write(encl, 'work/team.code-workspace', JSON.stringify({ folders: [{ path: 'web' }] }))
  const r = detect(path.join(encl, 'work'), root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'workspace', JSON.stringify(r.json))
  assert.equal(r.json.workspaceRoot, path.join(encl, 'work'))
  assert.deepEqual(r.json.repos.map(x => x.name), ['web'])
})

test('祖先目录有两个都不含当前仓的工作区文件 → 单仓模式', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'other'))
  const mine = feRepo(path.join(root, 'mine'))
  write(root, 'a.code-workspace', JSON.stringify({ folders: [{ path: 'other' }] }))
  write(root, 'b.code-workspace', JSON.stringify({ folders: [{ path: 'other' }] }))
  const r = detect(mine, root)
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'single-repo', JSON.stringify(r.json))
  assert.equal(r.json.workspaceRoot, mine)
  assert.ok(!r.json.questions.some(q => q.id === 'choose_workspace'), JSON.stringify(r.json.questions))
  assert.equal(r.json.notes.filter(n => n.includes('忽略不包含当前仓')).length, 2, JSON.stringify(r.json.notes))
})

test('--workspace 显式指定', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'web1'))
  feRepo(path.join(root, 'web2'))
  write(root, 'a.code-workspace', JSON.stringify({ folders: [{ path: 'web1' }] }))
  const b = write(root, 'b.code-workspace', JSON.stringify({ folders: [{ path: 'web2' }] }))
  const choose = detect(root, root).json.questions.find(q => q.id === 'choose_workspace')
  assert.match(choose.message, /--workspace/)
  const r = runTool('workspace.js', ['--cwd', root, '--home', root, '--workspace', b])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.workspaceMode, 'workspace', JSON.stringify(r.json))
  assert.equal(r.json.workspaceFile, b)
  assert.equal(r.json.workspaceRoot, root)
  assert.deepEqual(r.json.repos.map(x => x.name), ['web2'])
})

test('工作区文件内容不是对象或 folders 不是数组 → fix_workspace，不崩溃', () => {
  for (const content of ['null', '{"folders": {}}']) {
    const root = mkTmp()
    write(root, 'w.code-workspace', content)
    const r = detect(root, root)
    assert.equal(r.code, 0, `${content}: ${r.stderr}`)
    assert.ok(r.json.questions.some(q => q.id === 'fix_workspace'), `${content}: ${JSON.stringify(r.json.questions)}`)
  }
})

test('devDependencies 里的后端框架不算后端依赖', () => {
  const root = mkTmp()
  const repo = gitInit(path.join(root, 'web'))
  write(repo, 'package.json', JSON.stringify({ dependencies: { vue: '^3.4.0' }, devDependencies: { express: '^4.0.0' } }))
  assert.equal(detect(repo, root).json.repos[0].lane, 'fe')
})

test('创建提示包含所有子 git 仓（含无法判定泳道的）', () => {
  const root = mkTmp()
  feRepo(path.join(root, 'web'))
  const misc = gitInit(path.join(root, 'misc'))
  write(misc, 'README.md', 'x')
  const q = detect(root, root).json.questions.find(x => x.id === 'create_workspace')
  assert.ok(q)
  assert.deepEqual(q.suggestion.content.folders.map(f => f.path), ['misc', 'web'])
  assert.deepEqual(q.repos.map(x => [path.basename(x.path), x.lane]), [['misc', 'unknown'], ['web', 'fe']])
})
