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

test('--repo 不是仓库根目录 → 退出码 2', () => {
  const ctx = setupRepo()
  fs.mkdirSync(path.join(ctx.repo, 'src'))
  const r = runTool('scope.js', ['baseline', '--repo', path.join(ctx.repo, 'src'), '--out', ctx.base])
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /--repo 必须是仓库根目录：/)
  assert.ok(!fs.existsSync(ctx.base))
})

test('基线与 --repo 不是同一个仓 → 退出码 2', () => {
  const a = setupRepo()
  const b = setupRepo()
  baseline(a)
  fs.writeFileSync(b.files, '')
  const r = runTool('scope.js', ['diff', '--repo', b.repo, '--baseline', a.base, '--files', b.files, '--out', b.out])
  assert.equal(r.code, 2, r.stderr)
  assert.ok(!fs.existsSync(b.out))
})

test('files.txt 与 --exclude 用同一套路径规范化：目录不带 / 也按前缀匹配，./ 前缀被去掉', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, 'src/views/list.vue', 'v')
  write(ctx.repo, 'tmp/x.log', 'x')
  fs.writeFileSync(ctx.files, 'src/views\n')
  const r = runTool('scope.js', ['diff', '--repo', ctx.repo, '--baseline', ctx.base, '--files', ctx.files, '--out', ctx.out, '--exclude', './tmp'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(r.json.changed, ['src/views/list.vue'])
  assert.deepEqual(r.json.outOfScope, [])
})

test('子命令后的 --help 也输出说明并退出 0', () => {
  const r = runTool('scope.js', ['diff', '--help'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /scope\.js diff/)
})

test('diff 不给 --files → requirementFiles / outOfScope 为 null，changed 照常计算', () => {
  const ctx = setupRepo()
  baseline(ctx)
  write(ctx.repo, 'in.js', 'x')
  const r = runTool('scope.js', ['diff', '--repo', ctx.repo, '--baseline', ctx.base, '--out', ctx.out])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(r.json.changed, ['in.js'])
  assert.equal(r.json.requirementFiles, null)
  assert.equal(r.json.outOfScope, null)
})
