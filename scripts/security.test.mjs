import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const folder = await mkdtemp(join(tmpdir(), 'pad-admin-security-'))
class Storage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
globalThis.window = Object.assign(new EventTarget(), { sessionStorage: new Storage(), localStorage: new Storage() })
for (const name of ['security', 'session', 'apiClient', 'auth', 'adminApi', 'pdfRender']) {
  let source = await readFile(join(root, `src/lib/${name}.ts`), 'utf8')
  source = source.replaceAll('import.meta.env.VITE_API_BASE_URL', '"https://unit.example.test"').replaceAll('import.meta.env.VITE_USE_MOCK_API', '"false"').replaceAll('import.meta.env.DEV', 'false')
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"')
  await writeFile(join(folder, `${name}.mjs`), output)
}
const security = await import(new URL(`file:///${join(folder, 'security.mjs').replaceAll('\\', '/')}`))
const sessions = await import(new URL(`file:///${join(folder, 'session.mjs').replaceAll('\\', '/')}`))
const client = await import(new URL(`file:///${join(folder, 'apiClient.mjs').replaceAll('\\', '/')}`))
const auth = await import(new URL(`file:///${join(folder, 'auth.mjs').replaceAll('\\', '/')}`))
const admin = await import(new URL(`file:///${join(folder, 'adminApi.mjs').replaceAll('\\', '/')}`))
const fixture = (changes = {}) => ({ accessToken: 'header.payload.signature', tokenType: 'bearer', expiresIn: 1800, role: 'STAFF', hospitalId: 1, mustChangePassword: false, ...changes })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const originalNow = Date.now
test.beforeEach(() => { sessions.clearSession(); Date.now = originalNow; globalThis.fetch = async () => json({ ok: true }) })
test.after(() => { Date.now = originalNow; return rm(folder, { recursive: true, force: true }) })

test('BO: rejects oversized request before fetch', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(client.apiRequest('/staff/providers', { method: 'POST', body: { name: 'a'.repeat(65537) } }), { status: 413 })
})
test('BO: cancels oversized declared response', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '2097153' } })
  await assert.rejects(client.apiRequest('/staff/providers'), { status: 413 })
})
test('BO: streamed response bounded without content length', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2097153)); c.close() } }), { headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(client.apiRequest('/staff/providers'), { status: 413 })
})
test('IL: never exposes server error or details', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => json({ detail: 'Traceback SECRET SQL /srv/app.py' }, 500)
  await assert.rejects(client.apiRequest('/staff/providers'), (e) => !e.message.includes('SECRET') && e.details === undefined)
})
test('CS/FD: valid PDF MIME and signature accepted', async () => {
  await security.validateDownload(new Blob(['%PDF-1.7\n'], { type: 'application/pdf' }), 'pdf')
})
for (const [name, body, type, kind] of [['HTML disguised as PDF', '<script>alert(1)</script>', 'application/pdf', 'pdf'], ['wrong MIME', '%PDF-1.7', 'text/html', 'pdf'], ['empty image', '', 'image/png', 'png'], ['wrong ZIP signature', 'html', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx']]) {
  test(`CS/FD: rejects ${name}`, async () => { await assert.rejects(security.validateDownload(new Blob([body], { type }), kind)) })
}
test('BF: weak/common/repetitive/control passwords rejected', () => {
  for (const value of ['password123', 'a'.repeat(12), 'Test123\n!', 'short', 'a'.repeat(65)]) assert.throws(() => security.passwordPolicy(value))
  assert.equal(security.passwordPolicy('Local-Secure9!2026'), 'Local-Secure9!2026')
})
test('IA: invalid role/scope/token/lifetime rejected', () => {
  for (const changes of [{ role: 'ROOT' }, { role: 'ADMIN', hospitalId: 1 }, { hospitalId: null }, { hospitalId: -1 }, { accessToken: 'injected\r\nvalue' }, { expiresIn: NaN }, { tokenType: 'Basic' }, { mustChangePassword: 'false' }]) assert.throws(() => sessions.saveSession(fixture(changes)))
})
test('IA: protected API refuses anonymous request before fetch', async () => {
  globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(client.apiRequest('/staff/providers'))
})
test('IA/CC: forged storage role/token cannot restore session', () => {
  window.sessionStorage.setItem('accessToken', 'forged.token.signature'); window.sessionStorage.setItem('role', 'ADMIN'); window.sessionStorage.setItem('expiresAt', String(Date.now() + 999999))
  assert.equal(sessions.restoreSession(), null)
  sessions.clearSession(); assert.equal(window.sessionStorage.getItem('accessToken'), null)
})
test('IA: native sign-in requires server me confirmation', async () => {
  const seen = []; globalThis.fetch = async (url, options) => { seen.push([url, options]); return url.endsWith('/sign-in') ? json(fixture()) : json({ role: 'STAFF', hospitalId: 1, mustChangePassword: false }) }
  await auth.signIn('staff@example.test', 'Local-Secure9!2026')
  assert.equal(seen.length, 2); assert.equal(seen[0][1].headers.has('Authorization'), false); assert.equal(seen[1][1].headers.get('Authorization'), 'Bearer header.payload.signature')
  assert.equal(window.sessionStorage.getItem('accessToken'), null)
})
test('IA/IN: me role mismatch rejects login and clears token', async () => {
  globalThis.fetch = async url => url.endsWith('/sign-in') ? json(fixture()) : json({ role: 'ADMIN', hospitalId: null, mustChangePassword: false })
  await assert.rejects(auth.signIn('staff@example.test', 'Local-Secure9!2026')); assert.equal(sessions.restoreSession(), null)
})
test('CF/CC: omits cookies/cache/referrer and blocks redirects', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert.equal(options.referrerPolicy, 'no-referrer'); return json({ ok: true })
  }
  await client.apiRequest('/staff/providers', { credentials: 'include', redirect: 'follow', cache: 'force-cache' })
})
test('IN: STAFF cannot call ADMIN domain APIs', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(admin.listHospitals()); await assert.rejects(admin.grantStaffQuota(1, 1))
})
test('IN: ADMIN cannot call STAFF domain APIs', async () => {
  sessions.saveSession(fixture({ role: 'ADMIN', hospitalId: null })); globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(admin.listDoctors()); await assert.rejects(admin.getPdaResultPdf(1))
})
test('PV: must-change-password blocks business API', async () => {
  sessions.saveSession(fixture({ mustChangePassword: true })); globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(admin.issueCodes(1, 1))
})
test('SC: idle expiry clears session and emits event', () => {
  let now = 100000; Date.now = () => now; sessions.saveSession(fixture()); let expired = 0; const fn = () => expired++
  window.addEventListener('pda:unauthorized', fn); now += sessions.IDLE_MS; assert.equal(sessions.restoreSession(), null); assert.equal(expired, 1); window.removeEventListener('pda:unauthorized', fn)
})
test('SC: activity never extends absolute one-hour cap', () => {
  let now = 100000; Date.now = () => now; sessions.saveSession(fixture({ expiresIn: 7200 }));
  for (let i = 0; i < 6; i++) { now += 10 * 60000; sessions.touchSession() }
  assert.equal(sessions.restoreSession(), null)
})
test('SF: password change consumes rotated token and confirms me', async () => {
  sessions.saveSession(fixture({ mustChangePassword: true }));
  globalThis.fetch = async url => url.endsWith('/password') ? json(fixture({ accessToken: 'rotated.payload.signature' })) : json({ role: 'STAFF', hospitalId: 1, mustChangePassword: false })
  await auth.changePassword('Old-Secure9!2026', 'New-Secure9!2026'); assert.equal(sessions.restoreSession().accessToken, 'rotated.payload.signature')
})
test('SF: unchanged token after password change invalidates browser session', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => json(fixture()); await assert.rejects(auth.changePassword('Old-Secure9!2026', 'New-Secure9!2026')); assert.equal(sessions.restoreSession(), null)
})
test('SC: logout failures reported, local token always removed', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => json({ detail: 'missing endpoint' }, 404)
  assert.equal(await auth.signOut(), false); assert.equal(sessions.restoreSession(), null)
})
test('SC: logout succeeds only on server acceptance', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async (url) => { assert.ok(url.endsWith('/auth/sign-out')); return new Response(null, { status: 204 }) }; assert.equal(await auth.signOut(), true); assert.equal(sessions.restoreSession(), null)
})
test('PV/AU: concurrent mutation rejected', async () => {
  sessions.saveSession(fixture()); let finish; globalThis.fetch = () => new Promise(resolve => { finish = resolve })
  const first = client.apiRequest('/staff/code_batches', { method: 'POST', body: { count: 1 } }); await assert.rejects(client.apiRequest('/staff/code_batches', { method: 'POST', body: { count: 1 } }), { status: 409 }); finish(json({ ok: true })); await first
})
test('SC: late response from previous session discarded', async () => {
  sessions.saveSession(fixture()); let finish; globalThis.fetch = () => new Promise(resolve => { finish = resolve })
  const pending = client.apiRequest('/staff/results'); sessions.clearSession(); sessions.saveSession(fixture({ accessToken: 'different.payload.signature' })); finish(json({ sensitive: 'previous-session' })); await assert.rejects(pending, { status: 401 })
})
test('PV/BO: positive integer boundaries reject partial/exponential/decimal input', () => {
  for (const value of ['1evil', '1e2', 1.5, -1, 0, Infinity, '01', '9'.repeat(50), 101]) assert.throws(() => security.positiveInteger(value, 100)); assert.equal(security.positiveInteger('100', 100), 100)
})
test('PV: excessive PIN issue and invalid IDs rejected before fetch', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = () => assert.fail('must not send'); await assert.rejects(admin.issueCodes(1, 101)); await assert.rejects(admin.getPdaResultPdf(-1)); await assert.rejects(admin.updateDoctor('../2', { name: 'test' }))
})
test('PT: dangerous path and repeated encoded traversal rejected', () => {
  for (const path of ['https://evil.test/', '//evil.test/', '/staff/../admin', '/staff/%2e%2e/admin', '/staff/%252e%252e/admin', '/staff/%5cadmin', '/staff/thing#frag', '/staff/%0aadmin']) assert.throws(() => security.safePath(path))
  assert.equal(security.safePath('/staff/results?page=1&search=%25'), '/staff/results?page=1&search=%25')
})
test('SN: production HTTP/userinfo/hash rejected; local development allowed', () => {
  for (const value of ['http://192.168.1.66:8005', 'javascript:alert(1)', 'https://user:pass@api.test', 'https://api.test/#token']) assert.throws(() => security.safeApiBase(value, false))
  assert.equal(security.safeApiBase('http://127.0.0.1:8005/', true), 'http://127.0.0.1:8005')
})
test('XS: no arbitrary server Excel URL navigation or unsafe HTML sinks', async () => {
  const views = await Promise.all(['AdminDoctors', 'AdminResponses', 'OwnerAccounts', 'OwnerQuota'].map(name => readFile(join(root, `src/views/${name}.tsx`), 'utf8')))
  assert.ok(views.every(s => !/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(/.test(s))); assert.ok(!views[0].includes('href={batchResult.excelUrl}')); assert.ok(!views[1].includes('<iframe')); assert.ok(views[1].includes('<PdfPreview file={pdfFile}'))
})

test('SF: malformed rotated token clears browser identity', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => json(fixture({ role: 'INVALID' })); await assert.rejects(auth.changePassword('Old-Secure9!2026', 'New-Secure9!2026')); assert.equal(sessions.restoreSession(), null)
})
test('FD: empty 204 file response rejected', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = async () => new Response(null, { status: 204 }); await assert.rejects(client.apiRequestBlob('/staff/results/1/pdf'))
})

test('BO/CS/XS: bounded PDF renderer disables evaluation/XFA/WASM', async () => {
  const pdf = await import(new URL(`file:///${join(folder, 'pdfRender.mjs').replaceAll('\\', '/')}`))
  assert.equal(pdf.PDF_DOCUMENT_OPTIONS.isEvalSupported, false)
  assert.equal(pdf.PDF_DOCUMENT_OPTIONS.enableXfa, false)
  assert.equal(pdf.PDF_DOCUMENT_OPTIONS.useWasm, false)
  for (const count of [0, 101, Infinity, 1.5]) assert.throws(() => pdf.assertPdfPageCount(count))
  for (const [width, height] of [[595,842],[1,1000000],[1000000,1],[100000,100000]]) {
    for (const pages of [1,100]) {
      const scale = pdf.boundedPdfScale(width,height,2,pages)
      assert.ok(width * height * scale ** 2 * pages <= pdf.TOTAL_CANVAS_PIXELS + 1)
      assert.ok(width*scale <= 4096 && height*scale <= 4096)
    }
  }
  assert.throws(() => pdf.boundedPdfScale(Infinity,842,1,1))
})

test('IA/IN/PV: direct common-client calls cannot bypass role or initial-password guards', async () => {
  sessions.saveSession(fixture()); globalThis.fetch = () => assert.fail('must not send')
  await assert.rejects(client.apiRequest('/admin/staff'), { status: 403 })
  sessions.saveSession(fixture({ mustChangePassword: true }))
  await assert.rejects(client.apiRequest('/staff/providers'), { status: 403 })
})
test('IA/IL: malformed token metadata rejected with controlled message', () => {
  for (const changes of [{ tokenType: 123 }, { accessToken: {} }, { accessToken: null }]) assert.throws(() => sessions.saveSession(fixture(changes)), /로그인 응답을 확인할 수 없습니다/)
})
