#!/usr/bin/env node
'use strict'
/**
 * 改动范围与越界检测（只读 git）。
 *
 *   node scope.js baseline --repo <path> --out <baseline.json>
 *   node scope.js diff --repo <path> --baseline <baseline.json> [--files <files.txt>] --out <scope.json> [--exclude <相对路径>]...
 *
 * --repo 必须是仓库根目录（git rev-parse --show-toplevel），否则退出码 2。任意位置出现 -h / --help 都输出本说明。
 * baseline：记录 HEAD 与开工时所有已修改 / 已暂存 / 未跟踪文件的内容哈希。
 * diff：基线记录的仓库与 --repo 不一致 → 退出码 2。
 *       changed = 自基线 HEAD 以来已提交的变化 ∪ 工作区变化 ∪ 未跟踪文件；
 *       基线里已有的文件仅当内容哈希变化时计入 changed，否则归入 preexisting；
 *       outOfScope = changed − files.txt；不给 --files 时 requirementFiles 与 outOfScope 输出 null。
 *       files.txt 的行与 --exclude 用同一套规范化：去掉首尾空白与开头的 ./ 或 /；
 *       与文件路径完全相同，或是其所在目录（结尾带不带 / 都行）即匹配。始终排除 .just-flf/。
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
  if (argv.includes('-h') || argv.includes('--help')) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0] + '*/\n'); process.exit(0) }
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
  if (out.cmd === 'diff' && !out.baseline) fail('diff 需要 --baseline')
  return out
}

function realOrSelf(p) {
  try { return fs.realpathSync(p) } catch (_) { return p }
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

function normalizeEntry(p) {
  return p.trim().replace(/^(?:\.\/|\/)+/, '')
}

function matchesEntry(rel, r) {
  return rel === r || rel.startsWith(`${r.replace(/\/$/, '')}/`)
}

function isExcluded(rel, excludes) {
  return excludes.map(normalizeEntry).some(r => matchesEntry(rel, r))
}

function readRequirementFiles(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(normalizeEntry)
    .filter(Boolean)
}

function inScope(rel, req) {
  return req.some(r => matchesEntry(rel, r))
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
  if (base.repo && realOrSelf(path.resolve(base.repo)) !== realOrSelf(repo)) fail(`基线属于 ${base.repo}，与 --repo ${repo} 不是同一个仓`)
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
  const requirementFiles = opts.files ? readRequirementFiles(opts.files) : null
  const outOfScope = requirementFiles ? changed.filter(f => !inScope(f, requirementFiles)) : null
  writeOut(opts.out, { repo, baselineHead: base.head, head, changed, preexisting, requirementFiles, outOfScope })
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2))
  const repo = path.resolve(opts.repo)
  let top
  try { top = git(repo, ['rev-parse', '--show-toplevel']).trim() } catch (_) { fail(`不是 git 仓：${repo}`) }
  if (realOrSelf(top) !== realOrSelf(repo)) fail(`--repo 必须是仓库根目录：${top}`)
  try {
    if (opts.cmd === 'baseline') baseline(repo, opts)
    else diff(repo, opts)
  } catch (e) {
    fail(`执行失败：${e.message}`)
  }
}

module.exports = { readRequirementFiles, inScope, isExcluded }
