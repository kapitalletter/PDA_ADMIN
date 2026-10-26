import { requireSession, sessionGeneration } from "./session"
import { safeApiBase, safePath } from "./security"

const apiBaseUrl = safeApiBase(import.meta.env.VITE_API_BASE_URL ?? "", import.meta.env.DEV)
const pending = new Set<AbortController>()
const mutations = new Set<string>()
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ApiError" }
}
type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean }
function errorMessage(status: number): string {
  const messages: Record<number, string> = {
    400: "요청 내용을 확인해주세요.", 401: "로그인 정보 또는 세션을 확인해주세요.",
    403: "이 작업을 수행할 권한이 없습니다.", 404: "요청한 데이터를 찾을 수 없습니다.",
    409: "이미 존재하거나 현재 상태에서는 처리할 수 없습니다.", 413: "허용된 크기를 초과했습니다.",
    422: "입력값을 다시 확인해주세요.", 429: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
    503: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
  }
  return messages[status] ?? "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
}
export function isMockApi() { return import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API === "true" }
export function cancelRequests() { for (const controller of pending) controller.abort() }

async function request(path: string, options: RequestOptions, binary: boolean): Promise<Blob | unknown> {
  safePath(path)
  const { body, auth = true, headers: customHeaders, signal, ...init } = options
  const current = auth ? requireSession() : null
  if (auth && current) {
    if (path.startsWith("/admin/") && current.role !== "ADMIN") throw new ApiError(errorMessage(403), 403)
    if (path.startsWith("/staff/") && current.role !== "STAFF") throw new ApiError(errorMessage(403), 403)
    if (current.mustChangePassword && !["/manage/me", "/manage/password", "/auth/sign-out"].includes(path)) throw new ApiError("먼저 초기 비밀번호를 변경해주세요.", 403)
  }
  const epoch = sessionGeneration()
  const method = (init.method ?? "GET").toUpperCase()
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new ApiError("허용되지 않은 요청입니다.", 0)
  const key = `${epoch}:${method}:${path}`
  const mutating = method !== "GET"
  if (mutating && mutations.has(key)) throw new ApiError("요청을 처리 중입니다. 완료 후 다시 시도해주세요.", 409)
  const encodedBody = body === undefined ? undefined : JSON.stringify(body)
  if (encodedBody && new TextEncoder().encode(encodedBody).length > 64 * 1024) throw new ApiError(errorMessage(413), 413)
  const headers = new Headers(customHeaders)
  headers.delete("Authorization")
  headers.set("Accept", binary ? (headers.get("Accept") ?? "application/octet-stream") : "application/json")
  if (encodedBody !== undefined) headers.set("Content-Type", "application/json")
  if (current) headers.set("Authorization", `Bearer ${current.accessToken}`)
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  const timeout = setTimeout(abort, 30_000)
  pending.add(controller)
  if (mutating) mutations.add(key)
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init, method, headers, body: encodedBody,
      signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 && auth && epoch === sessionGeneration()) window.dispatchEvent(new Event("pda:unauthorized"))
      throw new ApiError(errorMessage(response.status), response.status)
    }
    if (auth && epoch !== sessionGeneration()) throw new ApiError("세션이 변경되었습니다. 다시 시도해주세요.", 401)
    if (response.status === 204) { if (binary) throw new ApiError("다운로드 파일이 없습니다.", 0); return undefined }
    const type = (response.headers.get("Content-Type") ?? "").split(";")[0].toLowerCase()
    if (!binary && type !== "application/json") { await response.body?.cancel(); throw new ApiError("서버 응답 형식이 올바르지 않습니다.", 0) }
    const limit = binary ? 20 * 1024 * 1024 : 2 * 1024 * 1024
    if (Number(response.headers.get("Content-Length")) > limit) { await response.body?.cancel(); throw new ApiError(errorMessage(413), 413) }
    const reader = response.body?.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > limit) { await reader.cancel(); throw new ApiError(errorMessage(413), 413) }
          chunks.push(new Uint8Array(value))
        }
      } finally { reader.releaseLock() }
    }
    if (auth && epoch !== sessionGeneration()) throw new ApiError("세션이 변경되었습니다.", 401)
    if (auth) requireSession()
    const blob = new Blob(chunks, { type })
    if (binary) return blob
    try { return JSON.parse(await blob.text()) } catch { throw new ApiError("서버 응답 형식이 올바르지 않습니다.", 0) }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("요청이 중단되었거나 서버에 연결할 수 없습니다. 다시 시도해주세요.", 0)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
    pending.delete(controller)
    mutations.delete(key)
  }
}
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> { return await request(path, options, false) as T }
export async function apiRequestBlob(path: string, options: Omit<RequestOptions, "body"> = {}): Promise<Blob> { return await request(path, options, true) as Blob }
export function unwrapList<T>(payload: T[] | { items?: T[]; content?: T[]; data?: T[] }): T[] {
  return Array.isArray(payload) ? payload : payload.items ?? payload.content ?? payload.data ?? []
}
