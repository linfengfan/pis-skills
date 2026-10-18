#!/usr/bin/env node
'use strict'
/**
 * 契约校验：读 api-v<N>.json，对联调环境逐接口请求，比对响应与接口定义。
 *
 *   node conformance.js --api <api-vN.json> --base-url <http(s) 地址>
 *     [--auth-file <文件，每行一个 "Header: value">] [--allow-write <id,id>] [--only <id,id>]
 *     [--timeout 15000] [--code-field code] [--success-codes 0,200] [--auth-codes 401,403]
 *     [--data-field data] [--out <conformance.json>] [--dry-run]
 *
 * 默认只发送 GET / HEAD；写接口需要 --allow-write 显式放行。
 * 凭证只从 --auth-file 读取：文件不存在 → 退出码 2；不是 "Header: value" 的行告警后忽略（不回显内容）。
 * 接口 path 必须以 / 开头；每次发送前核对请求地址与 --base-url 同源，不同源则不发送、判 UNVERIFIED。
 * 不跟随重定向（防止凭证被转发到别的地址），3xx 一律判 UNVERIFIED。
 * 以下情况判 UNVERIFIED 而不是 FAIL：HTTP 401/403、HTTP 502/503/504（联调环境不可用）、2xx 的 HTML 页面、
 * 统一响应体的 code 属于鉴权码（--auth-codes，可被接口的 envelope.authCodes 覆盖）。
 * 没有统一响应体的 REST 接口用 --code-field '' --data-field ''（不核对 code，整个响应体当作 data）。
 * response.data 是对象型 data 的字段表；data 为数组或基本类型时用 response.schema
 * （单个字段描述，按名为 data 的必填字段核对，两者都有时以 schema 为准）。
 * 字段类型可用：string / enum / date / datetime / number / decimal / float / double / integer / int / long /
 * boolean / array / list / object（不区分大小写）；未声明或不在其中的类型记入 unchecked，不算通过。
 * 2xx 且响应体为空（如 204）：接口没有 schema 且 data 字段表为空 → PASS，否则 FAIL「响应体为空」。
 * errorProbes：每项必须有 expectCode 或 expectHttp（否则退出码 2）；HTTP 状态等于 expectHttp 即满足
 * HTTP 期望（包括 401/403）；expectCode 与响应体 code 相同即满足（包括鉴权码）；空响应体只能靠 expectHttp 满足。
 * 结果四态：PASS / PARTIAL（有字段因空数组、类型未识别等无法核对）/ FAIL / UNVERIFIED。
 * 退出码：有 FAIL → 1；否则 0；参数错误、接口定义缺 id / method / path、path 不以 / 开头、
 * errorProbes 缺期望 → 2。
 */
const fs = require('fs')
const path = require('path')

const READ_METHODS = ['GET', 'HEAD']
const MAX_ARRAY_CHECK = 20
const MAX_TIMEOUT = 2147483647
const KNOWN_TYPES = ['string', 'enum', 'date', 'datetime', 'number', 'decimal', 'float', 'double', 'integer', 'int', 'long', 'boolean', 'array', 'list', 'object']
const GATEWAY_DOWN = [502, 503, 504]

function usage(msg) {
  process.stderr.write(`${msg}\n`)
  process.exit(2)
}

function list(s) {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

function parseArgs(argv) {
  const o = { timeout: 15000, codeField: 'code', successCodes: ['0', '200'], authCodes: ['401', '403'], dataField: 'data', allowWrite: [], only: null, dryRun: false }
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
    else if (a === '--auth-codes') o.authCodes = list(next())
    else if (a === '--data-field') o.dataField = next()
    else if (a === '--out') o.out = next()
    else if (a === '--dry-run') o.dryRun = true
    else usage(`未知参数 ${a}`)
  }
  if (!o.api) usage('缺 --api')
  if (!(Number.isFinite(o.timeout) && o.timeout > 0 && o.timeout <= MAX_TIMEOUT)) usage(`--timeout 必须是 1～${MAX_TIMEOUT} 之间的毫秒数`)
  if (!o.baseUrl && !o.dryRun) usage('缺 --base-url')
  if (o.baseUrl) {
    let u
    try { u = new URL(o.baseUrl) } catch (_) { usage(`--base-url 不是合法 URL：${o.baseUrl}（需要带 http:// 或 https://）`) }
    if (!['http:', 'https:'].includes(u.protocol)) usage(`--base-url 只支持 http / https：${o.baseUrl}`)
  }
  return o
}

function readAuth(file) {
  const headers = {}
  if (!file) return headers
  let st
  try {
    st = fs.statSync(file)
  } catch (err) {
    usage(err.code === 'ENOENT' ? `凭证文件不存在：${file}` : `无法读取凭证文件：${file}（${err.code || err.message}）`)
  }
  if (process.platform !== 'win32' && (st.mode & 0o077)) process.stderr.write(`⚠️ ${file} 权限过宽，建议 chmod 600\n`)
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return
    const idx = t.indexOf(':')
    if (idx > 0) headers[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    else process.stderr.write(`⚠️ 凭证文件第 ${i + 1} 行不是 "Header: value" 格式，已忽略\n`)
  })
  return headers
}

function loadEndpoints(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'))
  const arr = Array.isArray(j) ? j : (j && Array.isArray(j.endpoints) ? j.endpoints : null)
  if (!arr) usage(`${file} 必须是接口数组，或带 endpoints 数组的对象`)
  const bad = []
  const invalid = []
  arr.forEach((e, i) => {
    const missing = ['id', 'method', 'path'].filter(k => !(e && typeof e === 'object' && e[k]))
    if (missing.length) { bad.push(`  [${i}] 缺 ${missing.join(' / ')}`); return }
    if (typeof e.path !== 'string' || !e.path.startsWith('/')) invalid.push(`第 ${i} 个接口的 path 必须以 / 开头`)
    if (!Array.isArray(e.errorProbes)) return
    e.errorProbes.forEach((p, j) => {
      if (!p || typeof p !== 'object' || (p.expectCode === undefined && p.expectHttp === undefined)) {
        invalid.push(`第 ${i} 个接口的 errorProbes[${j}] 缺少 expectCode 或 expectHttp`)
      }
    })
  })
  if (bad.length) usage(`${file} 有 ${bad.length} 个接口缺必填字段：\n${bad.join('\n')}`)
  if (invalid.length) usage(`${file} 接口定义有误：\n${invalid.map(s => `  ${s}`).join('\n')}`)
  return arr
}

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

function knownType(t) {
  return typeof t === 'string' && KNOWN_TYPES.includes(t.toLowerCase())
}

function unknownType(p, t) {
  return `字段 ${p} 类型 ${t === undefined || t === null || t === '' ? '「未声明」' : t} 未识别，未核对`
}

function typeMatches(expected, actual) {
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
    if (!knownType(f.type)) acc.unchecked.push(unknownType(p, f.type))
    else if (!typeMatches(f.type, t)) {
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
      if (!f.items.fields && !knownType(f.items.type)) {
        acc.unchecked.push(unknownType(`${p}[]`, f.items.type))
        continue
      }
      v.slice(0, MAX_ARRAY_CHECK).forEach((item, i) => {
        if (f.items.fields) compare(f.items.fields, item, `${p}[${i}]`, acc)
        else if (!typeMatches(f.items.type, typeOf(item))) acc.diffs.push(`字段 ${p}[${i}] 类型为 ${typeOf(item)}，接口定义为 ${f.items.type}`)
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

function sameOrigin(url, baseUrl) {
  try { return new URL(url).origin === new URL(baseUrl).origin } catch (_) { return false }
}

async function send(o, method, url, body, headers) {
  if (!sameOrigin(url, o.baseUrl)) return { error: '请求地址偏离 --base-url，已拒绝发送' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), o.timeout)
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: ctrl.signal,
    })
    const text = method === 'HEAD' ? '' : await res.text()
    return { status: res.status, contentType: res.headers.get('content-type') || '', location: res.headers.get('location') || '', text }
  } catch (err) {
    if (err.name === 'AbortError') return { error: `超时 ${o.timeout}ms` }
    const cause = err.cause && (err.cause.code || err.cause.message)
    return { error: `请求失败：${err.message}${cause ? `（${cause}）` : ''}` }
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch (_) { return undefined }
}

function envelopeCode(body, env) {
  if (!env.codeField || body === null || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, env.codeField)) return undefined
  return String(body[env.codeField])
}

function authCodeReason(env, code) {
  return `统一响应体 ${env.codeField}=${code}，鉴权不足，无法验证`
}

function blockedReason(res) {
  if (res.error) return res.error
  if (res.status >= 300 && res.status < 400) return `返回重定向（HTTP ${res.status}）${res.location ? `→ ${res.location}` : ''}，未跟随，无法验证`
  if (res.status === 401 || res.status === 403) return `HTTP ${res.status}，鉴权不足，无法验证`
  if (GATEWAY_DOWN.includes(res.status)) return `HTTP ${res.status}，联调环境不可用`
  return null
}

function isEmptyOk(res) {
  return res.status >= 200 && res.status < 300 && !res.text.trim()
}

function hasResponseSpec(e) {
  const resp = e.response || {}
  return !!(resp.schema && typeof resp.schema === 'object') || Object.keys(resp.data || resp.body || {}).length > 0
}

function classify(res) {
  const reason = blockedReason(res)
  if (reason) return { verdict: 'UNVERIFIED', reason }
  const json = parseJson(res.text)
  if (json !== undefined) return { json }
  const isHtml = /text\/html/i.test(res.contentType) || /^\s*</.test(res.text)
  if (isHtml && res.status >= 200 && res.status < 400) return { verdict: 'UNVERIFIED', reason: `返回 HTML 页面（HTTP ${res.status}），常见于未登录被重定向` }
  return { verdict: 'FAIL', diffs: [`响应不是 JSON（HTTP ${res.status}）：${res.text.slice(0, 120)}`] }
}

async function runProbe(o, e, p, env, headers, method) {
  const out = { name: p.name || '未命名', status: 'UNVERIFIED', detail: '' }
  const pass = () => Object.assign(out, { status: 'PASS' })
  const fail = detail => Object.assign(out, { status: 'FAIL', detail })
  const codeMismatch = code => `期望 ${env.codeField}=${p.expectCode}，实际 ${code === undefined ? '无该字段' : code}`
  const req = buildRequest(o.baseUrl, e, p.request || {})
  if (req.missing.length) { out.detail = `缺示例值：${req.missing.join(', ')}`; return out }
  const res = await send(o, method, req.url, req.body, headers)
  if (res.error) { out.detail = res.error; return out }

  if (p.expectHttp !== undefined && res.status === p.expectHttp) {
    if (p.expectCode === undefined) return pass()
    const json = parseJson(res.text)
    if (json === undefined) return fail(`期望 ${env.codeField}=${p.expectCode}，但响应不是 JSON（HTTP ${res.status}）`)
    const code = envelopeCode(json, env)
    return code === String(p.expectCode) ? pass() : fail(codeMismatch(code))
  }
  if (isEmptyOk(res)) {
    return fail(p.expectHttp !== undefined ? `期望 HTTP ${p.expectHttp}，实际 ${res.status}` : `期望 ${env.codeField}=${p.expectCode}，但响应体为空（HTTP ${res.status}）`)
  }

  const c = classify(res)
  if (c.verdict === 'UNVERIFIED') { out.detail = c.reason; return out }
  const code = envelopeCode(c.json, env)
  const codeMatched = p.expectCode !== undefined && code === String(p.expectCode)
  if (code !== undefined && env.authCodes.includes(code) && !codeMatched) { out.detail = authCodeReason(env, code); return out }
  if (p.expectHttp !== undefined) return fail(`期望 HTTP ${p.expectHttp}，实际 ${res.status}`)
  if (c.verdict === 'FAIL') return fail(c.diffs.join('；'))
  if (p.expectCode !== undefined && !codeMatched) return fail(codeMismatch(code))
  return pass()
}

// 返回 true 表示结论已定（r 已写好），不再跑错误探针
function checkBody(e, res, env, r) {
  const c = classify(res)
  if (c.verdict) {
    r.status = c.verdict
    if (c.reason) r.reason = c.reason
    if (c.diffs) r.diffs.push(...c.diffs)
    return true
  }
  const body = c.json
  const code = envelopeCode(body, env)
  if (code !== undefined && env.authCodes.includes(code)) { r.reason = authCodeReason(env, code); return true }
  if (code !== undefined) {
    if (!env.successCodes.includes(code)) {
      r.status = 'FAIL'
      const msg = body.msg || body.message
      r.diffs.push(`统一响应体 ${env.codeField}=${code} 不在成功码 [${env.successCodes.join(',')}] 内${msg ? `：${msg}` : ''}`)
      return true
    }
  } else if (res.status < 200 || res.status >= 300) {
    r.status = 'FAIL'
    r.diffs.push(`HTTP ${res.status}`)
    return true
  }
  const data = env.dataField ? (body || {})[env.dataField] : body
  const resp = e.response || {}
  if (resp.schema && typeof resp.schema === 'object') compare({ data: { required: true, ...resp.schema } }, data === undefined ? {} : { data }, '', r)
  else compare(resp.data || resp.body || {}, data, '', r)
  return false
}

async function checkOne(o, e, headers) {
  const method = String(e.method).toUpperCase()
  const r = { id: e.id, method, path: e.path, url: null, status: 'UNVERIFIED', httpStatus: null, diffs: [], unchecked: [], probes: [], reason: '' }
  const env = { codeField: o.codeField, successCodes: o.successCodes, authCodes: o.authCodes, dataField: o.dataField, ...(e.envelope || {}) }
  env.successCodes = (env.successCodes || []).map(String)
  env.authCodes = (env.authCodes || []).map(String)
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
    const reason = blockedReason(res)
    if (reason) { r.reason = reason; return r }
    r.status = res.status >= 200 && res.status < 300 ? 'PASS' : 'FAIL'
    if (r.status === 'FAIL') r.diffs.push(`HTTP ${res.status}`)
    return r
  }
  if (isEmptyOk(res)) {
    if (hasResponseSpec(e)) { r.status = 'FAIL'; r.diffs.push('响应体为空'); return r }
  } else if (checkBody(e, res, env, r)) return r
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
  if (!endpoints.length) usage(o.only ? `--only ${o.only.join(',')} 没有匹配到任何接口` : '接口定义里没有接口')
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
