#!/usr/bin/env node
'use strict'
/**
 * 契约符合性校验：读契约文档里的 ```json contract 块，对联调环境逐接口请求，比对响应体与契约。
 *
 *   node tools/contract-conformance.js \
 *     --contract <report_dir>/contract-v1.md \
 *     --base-url https://aicreator-dev-platform-gateway.youmanvideo.com \
 *     --header "Authorization: Bearer xxx" [--header "X-Space-Id: ..."] \
 *     [--only fav.add,fav.list] [--timeout 15000] [--success-codes 0,200] \
 *     [--code-field code --data-field data] \
 *     [--out <report_dir>/conformance-20261016.json] [--dry-run]
 *
 * 输出 JSON（stdout 或 --out）：
 *   { baseUrl, checkedAt, results: [{ id, method, path, status: PASS|FAIL|UNVERIFIED, httpStatus, diffs[], reason }], summary }
 * 退出码：有 FAIL → 1；否则 0（UNVERIFIED 不算失败，由 ⑦ 进人工清单）
 *
 * 零依赖，Node ≥ 18（用全局 fetch）。本脚本在 Workflow 运行时之外执行，允许用 Date。
 *
 * 契约 JSON 块结构（由 contract-designer 人设定义）：
 *   {
 *     "id": "points.summary", "path": "/api/platform/points/summary", "method": "GET",
 *     "module": "platform-points", "entry": "controller", "status": "existing|new|change",
 *     "request": { "query": { "spaceId": { "type": "string", "required": true, "example": "..." } },
 *                  "path":  { "id": { "type": "string", "required": true, "example": "..." } },
 *                  "body":  { "name": { "type": "string", "required": true, "example": "..." } } },
 *     "response": { "data": { "total": { "type": "integer", "required": true, "nullable": false },
 *                             "items": { "type": "array", "required": true, "items": { "type": "object", "fields": { "id": { "type": "string", "required": true } } } },
 *                             "owner": { "type": "object", "required": false, "nullable": true, "fields": { ... } } } },
 *     "errors": [{ "code": "...", "when": "..." }],
 *     "envelope": { "codeField": "code", "successCodes": [200], "dataField": "data" }   // 可选，覆盖命令行默认
 *   }
 */

const fs = require('fs')
const path = require('path')

// ---------- 参数 ----------
const argv = process.argv.slice(2)
const opts = { headers: [], timeout: 15000, successCodes: [0, 200], codeField: 'code', dataField: 'data', only: null, dryRun: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const next = () => argv[++i]
  if (a === '--contract') opts.contract = next()
  else if (a === '--contract-json') opts.contractJson = next()
  else if (a === '--base-url') opts.baseUrl = next()
  else if (a === '--header' || a === '--auth') opts.headers.push(next())
  else if (a === '--only') opts.only = next().split(',').map(s => s.trim()).filter(Boolean)
  else if (a === '--timeout') opts.timeout = Number(next())
  else if (a === '--success-codes') opts.successCodes = next().split(',').map(s => Number(s.trim()))
  else if (a === '--code-field') opts.codeField = next()
  else if (a === '--data-field') opts.dataField = next()
  else if (a === '--out') opts.out = next()
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0) }
  else { console.error(`未知参数 ${a}`); process.exit(2) }
}
if (!opts.contract && !opts.contractJson) { console.error('缺 --contract 或 --contract-json'); process.exit(2) }
if (!opts.baseUrl && !opts.dryRun) { console.error('缺 --base-url'); process.exit(2) }

// ---------- 读契约 ----------
function loadEndpoints() {
  if (opts.contractJson) {
    const j = JSON.parse(fs.readFileSync(opts.contractJson, 'utf8'))
    return Array.isArray(j) ? j : (j.contractJson || j.endpoints || [])
  }
  const md = fs.readFileSync(opts.contract, 'utf8')
  const blocks = [...md.matchAll(/```json contract\s*\n([\s\S]*?)\n```/g)]
  const out = []
  for (const b of blocks) {
    try { out.push(JSON.parse(b[1])) } catch (e) { console.error(`⚠️ 契约块解析失败，跳过：${e.message}\n${b[1].slice(0, 200)}`) }
  }
  return out
}

let endpoints = loadEndpoints().filter(e => e && e.id && e.path && e.method)
if (opts.only) endpoints = endpoints.filter(e => opts.only.includes(e.id))
if (endpoints.length === 0) { console.error('契约里没有可校验的接口（需要 id / path / method）'); process.exit(2) }

const headers = { Accept: 'application/json' }
for (const h of opts.headers) {
  const idx = h.indexOf(':')
  if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim()
}

// ---------- 类型比对 ----------
function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}
function typeMatches(expected, actual) {
  if (!expected) return true
  const exp = String(expected).toLowerCase()
  if (exp === 'number') return actual === 'number' || actual === 'integer'
  if (exp === 'integer' || exp === 'long' || exp === 'int') return actual === 'integer'
  if (exp === 'string' || exp === 'enum' || exp === 'datetime' || exp === 'date') return actual === 'string'
  if (exp === 'boolean') return actual === 'boolean'
  if (exp === 'array' || exp === 'list') return actual === 'array'
  if (exp === 'object') return actual === 'object'
  return true // 未知类型名不判
}
function compareFields(spec, data, prefix, diffs) {
  if (!spec || typeof spec !== 'object') return
  if (data === null || data === undefined || typeof data !== 'object') {
    if (Object.keys(spec).length) diffs.push(`${prefix || 'data'} 不是对象，无法核对字段`)
    return
  }
  for (const [name, f] of Object.entries(spec)) {
    const p = prefix ? `${prefix}.${name}` : name
    const has = Object.prototype.hasOwnProperty.call(data, name)
    const v = data[name]
    if (!has) { if (f.required) diffs.push(`缺必填字段 ${p}`); continue }
    if (v === null) { if (f.nullable === false) diffs.push(`字段 ${p} 为 null 但契约 nullable=false`); continue }
    const t = typeOf(v)
    if (!typeMatches(f.type, t)) diffs.push(`字段 ${p} 类型 ${t}，契约为 ${f.type}`)
    if (f.fields && t === 'object') compareFields(f.fields, v, p, diffs)
    if (f.items && t === 'array' && v.length) {
      if (f.items.fields && typeof v[0] === 'object') compareFields(f.items.fields, v[0], `${p}[0]`, diffs)
      else if (f.items.type && !typeMatches(f.items.type, typeOf(v[0]))) diffs.push(`字段 ${p}[0] 类型 ${typeOf(v[0])}，契约为 ${f.items.type}`)
    }
  }
}

// ---------- 构造请求 ----------
function sampleFor(f) {
  if (f.example !== undefined) return f.example
  if (f.default !== undefined) return f.default
  return undefined
}
function buildRequest(e) {
  const req = e.request || {}
  const missing = []
  let urlPath = e.path
  for (const [k, f] of Object.entries(req.path || {})) {
    const v = sampleFor(f)
    if (v === undefined) { missing.push(`path.${k}`); continue }
    urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(v)).replace(`:${k}`, encodeURIComponent(v))
  }
  if (/[{:][A-Za-z_]/.test(urlPath.replace(/^https?:/, ''))) {
    for (const m of urlPath.matchAll(/\{([^}]+)\}/g)) if (!missing.includes(`path.${m[1]}`)) missing.push(`path.${m[1]}`)
  }
  const qs = new URLSearchParams()
  for (const [k, f] of Object.entries(req.query || {})) {
    const v = sampleFor(f)
    if (v === undefined) { if (f.required) missing.push(`query.${k}`); continue }
    qs.set(k, String(v))
  }
  let body
  if (req.body && Object.keys(req.body).length) {
    body = {}
    for (const [k, f] of Object.entries(req.body)) {
      const v = sampleFor(f)
      if (v === undefined) { if (f.required) missing.push(`body.${k}`); continue }
      body[k] = v
    }
  }
  const url = opts.baseUrl ? `${opts.baseUrl.replace(/\/$/, '')}${urlPath}${qs.toString() ? `?${qs}` : ''}` : urlPath
  return { url, body, missing }
}

// ---------- 执行 ----------
async function checkOne(e) {
  const r = { id: e.id, method: e.method.toUpperCase(), path: e.path, module: e.module, contractStatus: e.status, status: 'UNVERIFIED', httpStatus: null, diffs: [], reason: '' }
  const { url, body, missing } = buildRequest(e)
  r.url = url
  if (missing.length) { r.reason = `缺示例值无法构造请求：${missing.join(', ')}`; return r }
  if (opts.dryRun) { r.reason = 'dry-run'; return r }

  const env = Object.assign({ codeField: opts.codeField, successCodes: opts.successCodes, dataField: opts.dataField }, e.envelope || {})
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeout)
  try {
    const res = await fetch(url, {
      method: r.method,
      headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    r.httpStatus = res.status
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch (_) { r.status = 'FAIL'; r.diffs.push(`响应不是 JSON（HTTP ${res.status}）：${text.slice(0, 120)}`); return r }
    if (res.status === 401 || res.status === 403) { r.reason = `HTTP ${res.status}，鉴权不足，无法验证`; return r }
    if (res.status >= 500) { r.status = 'FAIL'; r.diffs.push(`HTTP ${res.status} 服务端错误`); return r }
    if (env.codeField && Object.prototype.hasOwnProperty.call(json, env.codeField)) {
      const code = json[env.codeField]
      if (!env.successCodes.includes(Number(code)) && !env.successCodes.includes(code)) {
        r.status = 'FAIL'
        r.diffs.push(`统一响应体 ${env.codeField}=${JSON.stringify(code)} 不在成功码 ${JSON.stringify(env.successCodes)} 内${json.msg || json.message ? `：${json.msg || json.message}` : ''}`)
        return r
      }
    } else if (res.status < 200 || res.status >= 300) {
      r.status = 'FAIL'; r.diffs.push(`HTTP ${res.status}`); return r
    }
    const data = env.dataField ? json[env.dataField] : json
    const spec = (e.response && (e.response[env.dataField] || e.response.data || e.response)) || {}
    compareFields(spec, data, '', r.diffs)
    r.status = r.diffs.length ? 'FAIL' : 'PASS'
    return r
  } catch (err) {
    r.reason = err.name === 'AbortError' ? `超时 ${opts.timeout}ms` : `请求失败：${err.message}`
    return r
  } finally {
    clearTimeout(timer)
  }
}

;(async () => {
  const results = []
  for (const e of endpoints) {
    const r = await checkOne(e)
    results.push(r)
    const mark = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏳'
    console.error(`${mark} ${r.id} ${r.method} ${r.path}${r.httpStatus ? ` → ${r.httpStatus}` : ''}${r.diffs.length ? `\n   ${r.diffs.join('\n   ')}` : ''}${r.reason ? `\n   ${r.reason}` : ''}`)
  }
  const summary = {
    pass: results.filter(r => r.status === 'PASS').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    unverified: results.filter(r => r.status === 'UNVERIFIED').length,
  }
  const out = { baseUrl: opts.baseUrl || '', checkedAt: new Date().toISOString(), contract: opts.contract || opts.contractJson, results, summary }
  const json = JSON.stringify(out, null, 2)
  if (opts.out) { fs.mkdirSync(path.dirname(opts.out), { recursive: true }); fs.writeFileSync(opts.out, json); console.error(`\n已写入 ${opts.out}`) }
  else console.log(json)
  console.error(`\n✅ ${summary.pass} · ❌ ${summary.fail} · ⏳ ${summary.unverified}`)
  process.exit(summary.fail > 0 ? 1 : 0)
})()
