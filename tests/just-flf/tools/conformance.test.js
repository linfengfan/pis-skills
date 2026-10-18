'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('http')
const fs = require('fs')
const { mkTmp, write, runToolAsync } = require('./helpers')

function startServer(routes) {
  const hits = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', d => { body += d })
    req.on('end', () => {
      const key = `${req.method} ${req.url.split('?')[0]}`
      hits.push({ key, headers: req.headers, body })
      const h = routes[key]
      const [status, type, payload, extraHeaders] = h ? h(req, body) : [404, 'application/json', '{"code":404,"msg":"not found"}']
      res.writeHead(status, { 'content-type': type, ...extraHeaders })
      res.end(payload)
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, hits, url: `http://127.0.0.1:${server.address().port}` })))
}
const json = (obj, status = 200) => [status, 'application/json', JSON.stringify(obj)]
const html = status => [status, 'text/html', '<html><body>login</body></html>']

function apiFile(endpoints) {
  return write(mkTmp(), 'api-v1.json', JSON.stringify(endpoints))
}
function run(url, endpoints, extra = []) {
  return runToolAsync('conformance.js', ['--api', apiFile(endpoints), '--base-url', url, '--timeout', '3000', ...extra])
}

const LIST = {
  id: 'list', method: 'GET', path: '/api/list',
  response: { data: { items: { type: 'array', required: true, items: { type: 'object', fields: { userId: { type: 'string', required: true } } } } } },
}

test('返回 HTML 登录页的 401 判为 UNVERIFIED，不是 FAIL', async t => {
  const srv = await startServer({ 'GET /api/list': () => html(401) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
})

test('2xx 的 HTML 页面（未登录被重定向）判为 UNVERIFIED', async t => {
  const srv = await startServer({ 'GET /api/list': () => html(200) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
})

test('空数组判为 PARTIAL，元素类型不符判为 FAIL', async t => {
  const srv = await startServer({
    'GET /api/list': () => json({ code: 200, data: { items: [] } }),
    'GET /api/list2': () => json({ code: 200, data: { items: [{ userId: 1 }] } }),
  })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST, { ...LIST, id: 'list2', path: '/api/list2' }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].status, 'PARTIAL')
  assert.match(r.json.results[0].unchecked[0], /items\[\]/)
  assert.equal(r.json.results[1].status, 'FAIL')
  assert.deepEqual(r.json.summary, { pass: 0, partial: 1, fail: 1, unverified: 0 })
})

test('缺必填字段与 nullable=false 却为 null 判为 FAIL', async t => {
  const srv = await startServer({ 'GET /api/sum': () => json({ code: 200, data: { frozen: null } }) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{
    id: 'sum', method: 'GET', path: '/api/sum',
    response: { data: { total: { type: 'integer', required: true }, frozen: { type: 'integer', required: true, nullable: false } } },
  }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].diffs.length, 2)
})

test('写接口默认不发送；--allow-write 放行后才发送', async t => {
  const srv = await startServer({ 'DELETE /api/item/i1': () => json({ code: 200, data: {} }) })
  t.after(() => srv.server.close())
  const del = {
    id: 'del', method: 'DELETE', path: '/api/item/{itemId}',
    request: { path: { itemId: { type: 'string', required: true, example: 'i1' } } },
    response: { data: {} },
  }
  let r = await run(srv.url, [del])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.equal(srv.hits.length, 0)
  r = await run(srv.url, [del], ['--allow-write', 'del'])
  assert.equal(r.json.results[0].status, 'PASS')
  assert.equal(srv.hits.length, 1)
})

test('errorProbes：错误码符合为 PASS，不符为 FAIL', async t => {
  const srv = await startServer({
    'GET /api/space/s1': () => json({ code: 200, data: { name: 'a' } }),
    'GET /api/space/nope': () => json({ code: 'SPACE_NOT_FOUND', data: null }),
  })
  t.after(() => srv.server.close())
  const ep = {
    id: 'space', method: 'GET', path: '/api/space/{spaceId}',
    request: { path: { spaceId: { type: 'string', required: true, example: 's1' } } },
    response: { data: { name: { type: 'string', required: true } } },
  }
  const probe = expectCode => [{ name: '空间不存在', request: { path: { spaceId: 'nope' } }, expectCode }]
  let r = await run(srv.url, [{ ...ep, errorProbes: probe('SPACE_NOT_FOUND') }])
  assert.equal(r.json.results[0].status, 'PASS', JSON.stringify(r.json.results[0]))
  r = await run(srv.url, [{ ...ep, errorProbes: probe('OTHER') }])
  assert.equal(r.code, 1)
  assert.equal(r.json.results[0].status, 'FAIL')
})

test('凭证从 --auth-file 读取；命令行 --header 被拒绝', async t => {
  const srv = await startServer({
    'GET /api/me': req => (req.headers.authorization === 'Bearer t0k' ? json({ code: 200, data: { id: 'u1' } }) : html(401)),
  })
  t.after(() => srv.server.close())
  const tmp = mkTmp()
  const auth = write(tmp, 'auth', '# dev 环境\nAuthorization: Bearer t0k\nX-Leak-t0k-secret\n')
  fs.chmodSync(auth, 0o600)
  const me = { id: 'me', method: 'GET', path: '/api/me', response: { data: { id: { type: 'string', required: true } } } }
  const outFile = `${tmp}/c.json`
  const r = await run(srv.url, [me], ['--auth-file', auth, '--out', outFile])
  assert.equal(r.json.results[0].status, 'PASS', r.stderr)
  assert.ok(!r.stdout.includes('t0k'), r.stdout)
  assert.ok(!fs.readFileSync(outFile, 'utf8').includes('t0k'))
  assert.match(r.stderr, /凭证文件第 3 行不是 "Header: value" 格式，已忽略/)
  assert.ok(!r.stderr.includes('t0k'), r.stderr)
  const bad = await run(srv.url, [me], ['--header', 'Authorization: Bearer t0k'])
  assert.equal(bad.code, 2)
})

test('连接被拒绝时判为 UNVERIFIED，不崩溃', async () => {
  const srv = await startServer({})
  await new Promise(resolve => srv.server.close(resolve))
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /请求失败|超时/)
  assert.match(r.json.results[0].reason, /ECONNREFUSED/)
})

test('缺示例值的路径参数 → UNVERIFIED 并说明缺什么', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{ id: 'x', method: 'GET', path: '/api/x/{xId}', response: { data: {} } }])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /path\.xId/)
  assert.equal(srv.hits.length, 0)
})

test('errorProbes 期望 HTTP 403 时，服务端返回 403 判 PASS', async t => {
  const srv = await startServer({
    'GET /api/space/s1': () => json({ code: 200, data: { name: 'a' } }),
    'GET /api/space/nope': () => html(403),
  })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{
    id: 'space', method: 'GET', path: '/api/space/{spaceId}',
    request: { path: { spaceId: { type: 'string', required: true, example: 's1' } } },
    response: { data: { name: { type: 'string', required: true } } },
    errorProbes: [{ name: '无权限', request: { path: { spaceId: 'nope' } }, expectHttp: 403 }],
  }])
  assert.equal(r.json.results[0].status, 'PASS', JSON.stringify(r.json.results[0]))
  assert.equal(r.json.results[0].probes[0].status, 'PASS')
})

test('接口定义缺 id / method / path → 退出码 2', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST, { id: 'x', method: 'GET' }])
  assert.equal(r.code, 2)
  assert.match(r.stderr, /\[1\].*path/)
  assert.equal(srv.hits.length, 0)
})

test('--timeout 非法或 --base-url 无协议 → 退出码 2', async () => {
  for (const timeout of ['abc', '0']) {
    const r = await run('http://127.0.0.1:1', [LIST], ['--timeout', timeout])
    assert.equal(r.code, 2, `--timeout ${timeout}: ${r.stderr}`)
  }
  const r = await run('example.com', [LIST])
  assert.equal(r.code, 2, r.stderr)
})

test('响应体 code 为鉴权码时判 UNVERIFIED，--auth-codes 可覆盖', async t => {
  const srv = await startServer({
    'GET /api/list': () => json({ code: 401, msg: '未登录' }),
    'GET /api/list2': () => json({ code: 'NOT_LOGIN' }),
  })
  t.after(() => srv.server.close())
  let r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /code=401/)
  const list2 = { ...LIST, id: 'list2', path: '/api/list2' }
  r = await run(srv.url, [list2])
  assert.equal(r.json.results[0].status, 'FAIL')
  r = await run(srv.url, [list2], ['--auth-codes', 'NOT_LOGIN'])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  r = await run(srv.url, [{ ...list2, envelope: { authCodes: ['NOT_LOGIN'] } }])
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
})

test('response.schema 描述数组型 data', async t => {
  const srv = await startServer({
    'GET /api/arr': () => json({ code: 200, data: [{ id: 1 }] }),
    'GET /api/arr2': () => json({ code: 200, data: [{ id: 'a' }] }),
  })
  t.after(() => srv.server.close())
  const arr = {
    id: 'arr', method: 'GET', path: '/api/arr',
    response: { schema: { type: 'array', items: { type: 'object', fields: { id: { type: 'string', required: true } } } } },
  }
  const r = await run(srv.url, [arr, { ...arr, id: 'arr2', path: '/api/arr2' }])
  assert.equal(r.json.results[0].status, 'FAIL')
  assert.match(r.json.results[0].diffs.join('\n'), /data\[0\]\.id/)
  assert.equal(r.json.results[1].status, 'PASS', JSON.stringify(r.json.results[1]))
})

test('不跟随重定向，3xx 判 UNVERIFIED', async t => {
  const srv = await startServer({
    'GET /api/list': () => [302, 'text/plain', '', { location: '/api/target' }],
    'GET /api/target': () => json({ code: 200, data: { items: [] } }),
  })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /^返回重定向（HTTP 302）/)
  assert.match(r.json.results[0].reason, /\/api\/target/)
  assert.ok(!srv.hits.some(h => h.key === 'GET /api/target'), JSON.stringify(srv.hits.map(h => h.key)))
})

test('path 不以 / 开头 → 退出码 2，不发送任何请求', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{ id: 'x', method: 'GET', path: '.evil.com/x', response: { data: {} } }])
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /第 0 个接口的 path 必须以 \/ 开头/)
  assert.equal(srv.hits.length, 0)
})

test('字段类型未识别 → 记入 unchecked，判 PARTIAL', async t => {
  const srv = await startServer({ 'GET /api/amt': () => json({ code: 200, data: { amount: 1.5 } }) })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{ id: 'amt', method: 'GET', path: '/api/amt', response: { data: { amount: { type: 'BigDecimal', required: true } } } }])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'PARTIAL', JSON.stringify(r.json.results[0]))
  assert.match(r.json.results[0].unchecked[0], /BigDecimal/)
})

test('网关 503（HTML）判 UNVERIFIED，不是 FAIL', async t => {
  const srv = await startServer({ 'GET /api/list': () => [503, 'text/html', '<html>busy</html>'] })
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'UNVERIFIED')
  assert.match(r.json.results[0].reason, /HTTP 503，联调环境不可用/)
})

test('204 空响应体且接口无响应定义 → PASS', async t => {
  const srv = await startServer({ 'DELETE /api/item/i1': () => [204, 'text/plain', ''] })
  t.after(() => srv.server.close())
  const del = {
    id: 'del', method: 'DELETE', path: '/api/item/{itemId}',
    request: { path: { itemId: { type: 'string', required: true, example: 'i1' } } },
    response: {},
  }
  const r = await run(srv.url, [del], ['--allow-write', 'del'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.json.results[0].status, 'PASS', JSON.stringify(r.json.results[0]))
  assert.equal(srv.hits.length, 1)
})

test('errorProbes 项缺 expectCode 与 expectHttp → 退出码 2', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [{ ...LIST, errorProbes: [{ name: 'p', request: {} }] }])
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /第 0 个接口的 errorProbes\[0\] 缺少 expectCode 或 expectHttp/)
  assert.equal(srv.hits.length, 0)
})

test('--auth-file 不存在 → 退出码 2，不打印堆栈', async t => {
  const srv = await startServer({})
  t.after(() => srv.server.close())
  const r = await run(srv.url, [LIST], ['--auth-file', '/nonexistent/auth'])
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /凭证文件不存在：\/nonexistent\/auth/)
  assert.ok(!/\n\s+at /.test(r.stderr), r.stderr)
  assert.equal(srv.hits.length, 0)
})
