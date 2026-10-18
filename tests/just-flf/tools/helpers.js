'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync, spawn } = require('child_process')

const TOOLS = path.resolve(__dirname, '../../../just-flf/tools')
const GIT_REDIRECT_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_NAMESPACE']

function cleanEnv() {
  const env = { ...process.env }
  for (const k of GIT_REDIRECT_VARS) delete env[k]
  return env
}

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
  return execFileSync('git', [
    '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd: dir, encoding: 'utf8', env: cleanEnv() }).trim()
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
    encoding: 'utf8', cwd: opts.cwd, env: { ...cleanEnv(), ...(opts.env || {}) },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json: parse(r.stdout) }
}

function runToolAsync(name, args, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(TOOLS, name), ...args], {
      cwd: opts.cwd, env: { ...cleanEnv(), ...(opts.env || {}) },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => resolve({ code, stdout, stderr, json: parse(stdout) }))
  })
}

module.exports = { TOOLS, mkTmp, write, git, gitInit, commitAll, runTool, runToolAsync }
