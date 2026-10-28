import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

// Exercise real React forms, session guards, API adapters and error handling.
// Network fixtures isolate these checks from production accounts and patient data.
const project = resolve(import.meta.dirname, '..')
const folder = await mkdtemp(join(project, 'node_modules', '.admin-functional-'))
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:8443' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLFormElement', 'Event', 'MouseEvent', 'EventTarget', 'FormData']) globalThis[key] = dom.window[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const files = ['App.tsx', ...['ui.tsx', 'security.ts', 'session.ts', 'apiClient.ts', 'auth.ts', 'adminApi.ts', 'data.ts', 'pdfRender.ts'].map(name => `lib/${name}`), ...['OwnerAccounts', 'OwnerQuota', 'AdminDoctors', 'AdminResponses', 'Login', 'ChangePassword'].map(name => `views/${name}.tsx`), 'components/PdfPreview.tsx']
for (const file of files) {
  let source = await readFile(join(project, 'src', file), 'utf8')
  source = source.replaceAll('import.meta.env.VITE_API_BASE_URL', '"https://fixture.example.test"').replaceAll('import.meta.env.VITE_USE_MOCK_API', '"false"').replaceAll('import.meta.env.DEV', 'false')
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText.replace(/(from\s*["'])(\.{1,2}\/[^"']+)(["'])/g, '$1$2.mjs$3')
  const destination = join(folder, file.replace(/\.tsx?$/, '.mjs'))
  await mkdir(resolve(destination, '..'), { recursive: true })
  await writeFile(destination, output)
}
const load = name => import(pathToFileURL(join(folder, `${name}.mjs`)))
const { default: App } = await load('App')
const { default: OwnerAccounts } = await load('views/OwnerAccounts')
const { default: OwnerQuota } = await load('views/OwnerQuota')
const { default: AdminDoctors } = await load('views/AdminDoctors')
const { default: AdminResponses } = await load('views/AdminResponses')
const { default: ChangePassword } = await load('views/ChangePassword')
const sessions = await load('lib/session')
const client = await load('lib/apiClient')
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = (role = 'ADMIN', extra = {}) => ({ accessToken: 'header.payload.signature', tokenType: 'bearer', expiresIn: 1800, role, hospitalId: role === 'ADMIN' ? null : 1, mustChangePassword: false, ...extra })
const stamp = '2026-10-27T12:00:00+09:00'
const hospital = (id = 1, extra = {}) => ({ id, role: 'STAFF', hospitalId: id, hospitalCode: String(id).padStart(2, '0'), hospitalName: `테스트병원${id}`, name: '담당자', contactPhone: '01012345678', loginId: `staff${id}@example.test`, isActive: true, mustChangePassword: true, allocatedCodeCount: 100, generatedCodeCount: 20, remainingCodeCount: 80, lastLoginAt: null, createdAt: stamp, updatedAt: stamp, ...extra })
const doctor = (id = 1, extra = {}) => ({ id, hospitalId: 1, department: '소아과', name: `테스트의사${id}`, email: `doctor${id}@example.test`, issuedCodeCount: 10, usedCodeCount: 2, isActive: true, createdAt: stamp, updatedAt: stamp, ...extra })
let root, requests, hospitals, doctors, handler, downloads, objectId
const container = () => document.getElementById('root')
const text = () => container().textContent
const dialog = () => container().querySelector('[role="dialog"]')
const button = (label, scope = container()) => {
  const result = [...scope.querySelectorAll('button')].find(element => element.textContent.trim() === label)
  assert.ok(result, `Missing button: ${label}`)
  return result
}
const settle = async () => { await act(async () => { await new Promise(resolve => setImmediate(resolve)) }) }
const mount = async Component => { root = createRoot(container()); await act(async () => root.render(React.createElement(Component))); await settle() }
const click = async element => { assert.equal(element.disabled, false, `Button disabled: ${element.textContent}`); await act(async () => element.click()); await settle() }
const fill = async (name, value, scope = dialog() ?? container()) => {
  const input = scope.querySelector(`[name="${name}"]`)
  assert.ok(input, `Missing input: ${name}`)
  const prototype = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}
const submit = async (form = dialog().querySelector('form')) => { await act(async () => form.requestSubmit()); await settle() }
const accountFields = async (extra = {}) => {
  for (const [name, value] of Object.entries({ hospitalCode: '02', institutionName: '새병원', name: '새담당자', contactPhone: '010-1234-5678', loginId: 'new@example.test', initialPassword: 'Clinic#2026Safe', ...extra })) await fill(name, value)
}
const baseHandler = (path, options) => {
  const url = new URL(path, 'https://fixture.example.test')
  if (options.method === 'GET' && url.pathname === '/admin/staff') {
    const query = url.searchParams.get('search') ?? ''
    const list = hospitals.filter(row => `${row.hospitalName}${row.name}${row.contactPhone}`.includes(query))
    const page = Number(url.searchParams.get('page'))
    return json({ total: list.length, page, pageSize: 20, items: list.slice((page - 1) * 20, page * 20) })
  }
  if (options.method === 'GET' && url.pathname === '/staff/providers') {
    const page = Number(url.searchParams.get('page'))
    return json({ total: doctors.length, page, pageSize: 20, items: doctors.slice((page - 1) * 20, page * 20) })
  }
  throw new Error(`Unexpected fixture request: ${options.method} ${path}`)
}
test.beforeEach(() => {
  sessions.clearSession(); requests = []; hospitals = [hospital()]; doctors = [doctor()]; downloads = []; objectId = 0
  handler = baseHandler
  window.URL.createObjectURL = URL.createObjectURL = () => `blob:fixture-${++objectId}`
  window.URL.revokeObjectURL = URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, filename: this.download }) }
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname + new URL(url).search
    const body = options.body ? JSON.parse(options.body) : undefined
    requests.push({ path, method: options.method, body, authorization: options.headers.get('Authorization') })
    return handler(path, options, body)
  }
})
test.afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; client.cancelRequests(); sessions.clearSession() })
test.after(async () => {
  dom.window.close()
  assert.equal(resolve(folder, '..'), join(project, 'node_modules'))
  await rm(folder, { recursive: true, force: true })
})

test('account creation: formatted phone, successful submit and completion confirmation', async () => {
  sessions.saveSession(session())
  handler = (path, options, body) => {
    if (path === '/admin/staff' && options.method === 'POST') {
      assert.equal(body.contactPhone, '01012345678')
      hospitals.unshift(hospital(2, { hospitalName: body.institutionName, loginId: body.loginId }))
      return json(hospitals[0], 201)
    }
    return baseHandler(path, options)
  }
  await mount(OwnerAccounts)
  await click(button('+ 신규 완화의료 계정 생성'))
  await accountFields(); await submit()
  assert.match(dialog().textContent, /계정 생성 완료/)
  await click(button('확인', dialog()))
  assert.equal(dialog(), null)
  assert.match(text(), /새병원/)
  assert.match(text(), /총 2건/)
})

test('account creation: weak password explains failure inside the open form', async () => {
  sessions.saveSession(session()); await mount(OwnerAccounts)
  await click(button('+ 신규 완화의료 계정 생성'))
  await accountFields({ initialPassword: 'abcdefgh' }); await submit()
  assert.match(dialog().querySelector('[role="alert"]').textContent, /비밀번호는 8~64자/)
  assert.equal(requests.filter(request => request.method === 'POST').length, 0)
  assert.equal(button('계정 생성', dialog()).disabled, false)
})

test('account creation: required-field, phone-format and server failures are visible and retryable', async () => {
  sessions.saveSession(session()); await mount(OwnerAccounts)
  await click(button('+ 신규 완화의료 계정 생성')); await submit()
  assert.ok(dialog().querySelector('[role="alert"]'))
  await accountFields({ contactPhone: '010--12345678' }); await submit()
  assert.match(dialog().querySelector('[role="alert"]').textContent, /연락처/)
  await fill('contactPhone', '02-1234-5678')
  handler = () => json({ detail: 'PRIVATE SERVER DETAIL' }, 409)
  await submit()
  assert.match(dialog().querySelector('[role="alert"]').textContent, /이미 존재/)
  assert.ok(!text().includes('PRIVATE SERVER DETAIL'))
  assert.equal(button('계정 생성', dialog()).disabled, false)
})

test('account editing: formatted existing contact and optional password update', async () => {
  sessions.saveSession(session()); hospitals[0].contactPhone = '010-1234-5678'
  handler = (path, options, body) => {
    if (path === '/admin/staff/1' && options.method === 'PATCH') {
      assert.equal(body.contactPhone, '01012345678'); assert.ok(!('initialPassword' in body))
      hospitals[0] = hospital(1, { name: body.name }); return json(hospitals[0])
    }
    return baseHandler(path, options)
  }
  await mount(OwnerAccounts); await click(button('수정')); await fill('name', '변경담당자'); await submit()
  assert.equal(dialog(), null); assert.match(text(), /변경담당자/)
})

test('account status and deletion: PATCH/DELETE, modal errors, final-page recovery', async () => {
  sessions.saveSession(session()); hospitals = Array.from({ length: 21 }, (_, i) => hospital(i + 1))
  let rejectDelete = true
  handler = (path, options, body) => {
    if (options.method === 'PATCH') return json(hospital(1, { isActive: body.isActive }))
    if (options.method === 'DELETE') {
      if (rejectDelete) return json({}, 409)
      hospitals = hospitals.filter(row => row.id !== 21); return json({ message: 'ok' })
    }
    return baseHandler(path, options)
  }
  await mount(OwnerAccounts); await click(button('정지'))
  assert.ok(button('활성화'))
  await click(button('다음')); await click(button('삭제')); await click(button('삭제', dialog()))
  assert.ok(dialog().querySelector('[role="alert"]'))
  rejectDelete = false; await click(button('삭제', dialog()))
  assert.equal(dialog(), null); assert.match(text(), /총 20건 · 1 \/ 1 페이지/)
})

test('account search: server query and failed list errors are shown', async () => {
  sessions.saveSession(session()); await mount(OwnerAccounts)
  const input = container().querySelector('input[placeholder="기관, 담당자, 연락처 검색"]')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '없는병원')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await click(button('검색')); assert.match(requests.at(-1).path, /search=/); assert.match(text(), /검색 결과가 없습니다/)
  handler = () => json({}, 503); await click(button('검색'))
  assert.match(container().querySelector('[role="alert"]').textContent, /일시적으로/)
})

test('quota grant: selected staff, positive quantity and updated totals', async () => {
  sessions.saveSession(session())
  handler = (path, options, body) => {
    if (path === '/admin/codes') return json({ total: { allocatedCodeCount: 100, generatedCodeCount: 20, redeemedCodeCount: 5, remainingCodeCount: 80 }, institutions: [{ staffId: 1, hospitalId: 1, hospitalName: '테스트병원', staffName: '담당자', allocatedCodeCount: 100, generatedCodeCount: 20, redeemedCodeCount: 5, remainingCodeCount: 80, updatedAt: stamp }] })
    assert.equal(path, '/admin/staff/1/quota'); assert.deepEqual(body, { count: 50 })
    return json(hospital(1, { allocatedCodeCount: 150, remainingCodeCount: 130 }))
  }
  await mount(OwnerQuota)
  const count = container().querySelector('input[type="number"]'); count.name = 'count'
  await fill('count', '50'); await submit(container().querySelector('form'))
  assert.match(text(), /150/); assert.match(text(), /130/); assert.equal(count.value, '')
})

test('doctor creation: returns to first page, reloads total and bounds rows', async () => {
  sessions.saveSession(session('STAFF')); doctors = Array.from({ length: 21 }, (_, i) => doctor(i + 1))
  handler = (path, options, body) => {
    if (path === '/staff/providers' && options.method === 'POST') {
      doctors.unshift(doctor(22, { name: body.name, department: body.department, email: body.email })); return json(doctors[0], 201)
    }
    return baseHandler(path, options)
  }
  await mount(AdminDoctors); await click(button('다음')); await click(button('+ 의사 등록'))
  for (const [name, value] of Object.entries({ name: '새의사', department: '소아과', email: 'newdoctor@example.test' })) await fill(name, value)
  await submit(); assert.equal(dialog(), null); assert.match(text(), /총 22명 · 1 \/ 2 페이지/)
  assert.match(text(), /새의사/); assert.equal(container().querySelectorAll('tbody tr').length, 20)
})

test('doctor edit and detail: error feedback, update and latest detail', async () => {
  sessions.saveSession(session('STAFF')); let rejected = true
  handler = (path, options, body) => {
    if (path === '/staff/providers/1') {
      if (options.method === 'PATCH') {
        if (rejected) return json({}, 422)
        doctors[0] = doctor(1, { name: body.name, department: body.department, email: body.email, isActive: body.isActive }); return json(doctors[0])
      }
      return json(doctors[0])
    }
    return baseHandler(path, options)
  }
  await mount(AdminDoctors); await click(button('수정')); await fill('name', '수정의사'); await submit()
  assert.ok(dialog().querySelector('[role="alert"]')); rejected = false; await submit()
  assert.equal(dialog(), null); assert.match(text(), /수정의사/)
  await click([...container().querySelectorAll('button')].find(item => item.textContent.includes('수정의사')))
  assert.match(dialog().textContent, /의사 상세 정보/); assert.match(dialog().textContent, /doctor1@example.test/)
})

test('PIN issuance: quantity validation, result confirmation, and Excel/QR download', async () => {
  sessions.saveSession(session('STAFF'))
  handler = (path, options, body) => {
    if (path === '/staff/code_batches') {
      assert.deepEqual(body, { count: 3, providerId: 1 })
      return json({ batchId: 7, hospitalId: 1, providerId: 1, count: 3, codes: ['010001', '010002', '010003'], remainingCodeCount: 77, excelUrl: '/ignored', createdAt: stamp }, 201)
    }
    if (path.endsWith('/codes.xlsx')) return new Response(new Uint8Array([80, 75, 3, 4, 0]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } })
    if (path === '/auth/qr') return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]), { headers: { 'Content-Type': 'image/png' } })
    return baseHandler(path, options)
  }
  await mount(AdminDoctors); await click(button('일괄 발급'))
  assert.ok(container().querySelector('[role="alert"]'))
  container().querySelector('input[type="number"]').name = 'quantity'; await fill('quantity', '3'); await click(button('일괄 발급'))
  assert.match(dialog().textContent, /3건/); await click(button('미사용 PIN Excel', dialog()))
  assert.match(downloads.at(-1).filename, /\.xlsx$/); await click(button('확인', dialog()))
  await click(button('회원가입 QR 발급')); assert.match(downloads.at(-1).filename, /\.png$/)
  assert.equal(requests.find(request => request.path === '/auth/qr').authorization, null)
})

test('inactive doctors cannot issue new PINs', async () => {
  sessions.saveSession(session('STAFF')); doctors[0].isActive = false; await mount(AdminDoctors)
  assert.equal(button('일괄 발급').disabled, true)
})

test('result board: categories, pagination, PDF download and recoverable PDF errors', async () => {
  sessions.saveSession(session('STAFF')); let rejectPdf = false
  handler = (path, options) => {
    if (path.startsWith('/staff/results?')) return json({ total: 21, page: 1, pageSize: 20, stats: { totalIssuedCount: 21, responseCompletedCount: 1, unusedCount: 20 }, items: [{ codeId: 10, pin: '010001', userId: 5, providerId: 1, providerName: '테스트의사', patientName: '테스트환자', registrationNumber: null, submittedAt: stamp, state: 'COMPLETED', recordId: 42, resultAvailable: true }] })
    assert.equal(path, '/staff/results/42/pdf')
    if (rejectPdf) return json({}, 503)
    return new Response('%PDF-1.7\n', { headers: { 'Content-Type': 'application/pdf' } })
  }
  await mount(AdminResponses); await click(button('응답완료')); assert.match(requests.at(-1).path, /category=COMPLETED/)
  await click(button('다음')); assert.match(requests.at(-1).path, /page=2/)
  await click(button('미사용')); assert.match(requests.at(-1).path, /category=UNUSED&page=1/)
  await click(button('PDF')); assert.ok(dialog().querySelector('a[download="PDA-응답결과.pdf"]'))
  await click(dialog().querySelector('button[aria-label="닫기"]'))
  rejectPdf = true; await click(button('PDF')); assert.equal(dialog(), null); assert.ok(container().querySelector('[role="alert"]'))
})

test('login 401: specific visible failure, consumed response and retry enabled', async () => {
  let cancelled = false
  handler = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"detail":"PRIVATE"}')); controller.close() }, cancel() { cancelled = true } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  await mount(App)
  const inputs = container().querySelectorAll('input'); inputs[0].name = 'loginId'; inputs[1].name = 'password'
  await fill('loginId', 'admin@example.test'); await fill('password', 'Example#2026')
  await submit(container().querySelector('form'))
  assert.equal(requests[0].path, '/manage/sign-in'); assert.equal(requests[0].authorization, null)
  assert.match(container().querySelector('[role="alert"]').textContent, /이메일·비밀번호와 계정 활성 상태/)
  assert.ok(!text().includes('PRIVATE')); assert.equal(cancelled, false); assert.equal(button('로그인').disabled, false)
})

test('ADMIN login, menu navigation and server logout clear the session', async () => {
  handler = (path, options) => {
    if (path === '/manage/sign-in' || path === '/manage/me') return json(session())
    if (path === '/auth/sign-out') return json({ message: 'ok' })
    if (path === '/admin/codes') return json({ total: { allocatedCodeCount: 0, generatedCodeCount: 0, redeemedCodeCount: 0, remainingCodeCount: 0 }, institutions: [] })
    return baseHandler(path, options)
  }
  await mount(App)
  const inputs = container().querySelectorAll('input'); inputs[0].name = 'loginId'; inputs[1].name = 'password'
  await fill('loginId', 'admin@example.test'); await fill('password', 'Example#2026'); await submit(container().querySelector('form'))
  assert.match(text(), /완화의료 계정 관리/); await click(button('고유번호 할당 & 현황'))
  assert.match(text(), /현황 대시보드/); await click(button('로그아웃'))
  assert.ok(button('로그인')); assert.equal(sessions.restoreSession(), null)
})

test('STAFF initial-password gate, confirmation mismatch, and rotated session', async () => {
  sessions.saveSession(session('STAFF', { mustChangePassword: true }))
  let completed = false
  handler = (path, options, body) => {
    if (path === '/manage/password') { assert.equal(body.newPassword, 'NewClinic#2026'); return json(session('STAFF', { accessToken: 'new.payload.signature' })) }
    if (path === '/manage/me') return json(session('STAFF', { accessToken: 'new.payload.signature' }))
    throw new Error(`Unexpected ${path}`)
  }
  const Wrapped = () => React.createElement(ChangePassword, { onComplete: () => { completed = true }, onLogout: () => {} })
  await mount(Wrapped)
  for (const [name, value] of Object.entries({ currentPassword: 'OldClinic#2026', newPassword: 'NewClinic#2026', confirmation: 'Mismatch#2026' })) await fill(name, value)
  await submit(container().querySelector('form')); assert.match(text(), /일치하지 않습니다/); assert.equal(requests.length, 0)
  await fill('confirmation', 'NewClinic#2026'); await submit(container().querySelector('form'))
  assert.equal(completed, true); assert.equal(sessions.restoreSession().mustChangePassword, false)
})

test('login identity 401 clears the token and explains the failing verification step', async () => {
  handler = path => path === '/manage/sign-in' ? json(session('STAFF')) : json({}, 401)
  await mount(App)
  const inputs = container().querySelectorAll('input'); inputs[0].name = 'loginId'; inputs[1].name = 'password'
  await fill('loginId', 'staff@example.test'); await fill('password', 'Example#2026'); await submit(container().querySelector('form'))
  assert.match(container().querySelector('[role="alert"]').textContent, /로그인 후 계정 인증/)
  assert.equal(sessions.restoreSession(), null)
})

test('STAFF login uses only staff menus and session expiry returns to login', async () => {
  handler = (path, options) => {
    if (path === '/manage/sign-in' || path === '/manage/me') return json(session('STAFF'))
    if (path.startsWith('/staff/results?')) return json({ total: 0, page: 1, pageSize: 20, stats: { totalIssuedCount: 0, responseCompletedCount: 0, unusedCount: 0 }, items: [] })
    return baseHandler(path, options)
  }
  await mount(App); await fill('loginId', 'staff@example.test'); await fill('password', 'Example#2026'); await submit(container().querySelector('form'))
  assert.match(text(), /의사 관리 & 고유번호 발급/)
  assert.ok(!text().includes('신규 완화의료 계정 생성'))
  await click(button('통합 응답 결과 게시판')); assert.match(text(), /해당 상태의 항목이 없습니다/)
  await act(async () => window.dispatchEvent(new window.Event('pda:unauthorized')))
  assert.ok(button('로그인')); assert.match(text(), /세션이 만료/)
})

test('pending account creation blocks duplicate submission and modal dismissal', async () => {
  sessions.saveSession(session()); let complete
  handler = (path, options) => {
    if (path === '/admin/staff' && options.method === 'POST') return new Promise(resolve => { complete = () => resolve(json(hospital(2), 201)) })
    return baseHandler(path, options)
  }
  await mount(OwnerAccounts); await click(button('+ 신규 완화의료 계정 생성')); await accountFields(); await submit()
  assert.equal(button('생성 중...', dialog()).disabled, true)
  assert.equal(button('취소', dialog()).disabled, true)
  assert.equal(dialog().querySelector('button[aria-label="닫기"]').disabled, true)
  await submit(); assert.equal(requests.filter(request => request.method === 'POST').length, 1)
  await act(async () => complete()); await settle(); assert.match(dialog().textContent, /계정 생성 완료/)
})
