export type ApiRole = "ADMIN" | "STAFF"
export interface SignInResponse {
  accessToken: string
  tokenType?: string
  expiresIn: number
  role: ApiRole
  hospitalId: number | null
  mustChangePassword: boolean
}

// Browser storage and decoded JWT claims are never an authority for role or scope.
let session: SignInResponse | null = null
let expiresAt = 0
let lastActivity = 0
let generation = 0
export const IDLE_MS = 15 * 60_000
const legacyKeys = ["accessToken", "tokenType", "expiresAt", "role", "hospitalId", "mustChangePassword"]

export function clearSession() {
  session = null
  expiresAt = lastActivity = 0
  generation++
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try { for (const key of legacyKeys) window[name].removeItem(key) } catch { /* Memory session also works when browser storage is disabled. */ }
  }
}

export function validateSession(value: SignInResponse): SignInResponse {
  if (!value || typeof value.accessToken !== "string" || (value.tokenType !== undefined && typeof value.tokenType !== "string") || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.accessToken)
      || value.accessToken.length > 4096 || !Number.isSafeInteger(value.expiresIn) || value.expiresIn < 1
      || (value.tokenType !== undefined && value.tokenType.toLowerCase() !== "bearer")
      || !["ADMIN", "STAFF"].includes(value.role) || typeof value.mustChangePassword !== "boolean"
      || (value.role === "ADMIN" ? value.hospitalId !== null : !Number.isSafeInteger(value.hospitalId) || Number(value.hospitalId) < 1)) {
    throw new Error("로그인 응답을 확인할 수 없습니다. 다시 로그인해주세요.")
  }
  return { ...value, tokenType: "Bearer", expiresIn: Math.min(value.expiresIn, 3600) }
}

export function saveSession(value: SignInResponse) {
  const checked = validateSession(value)
  clearSession()
  session = checked
  expiresAt = Date.now() + checked.expiresIn * 1000
  lastActivity = Date.now()
}

export function restoreSession(): SignInResponse | null {
  if (!session || Date.now() >= expiresAt || Date.now() - lastActivity >= IDLE_MS) {
    if (session) {
      clearSession()
      window.dispatchEvent(new Event("pda:unauthorized"))
    }
    return null
  }
  return { ...session, expiresIn: Math.ceil((expiresAt - Date.now()) / 1000) }
}

export function touchSession() {
  if (restoreSession()) lastActivity = Date.now()
}

export function sessionGeneration() { return generation }

export function requireSession(role?: ApiRole) {
  const current = restoreSession()
  if (!current) throw new Error("로그인이 필요합니다.")
  if (role && current.mustChangePassword) throw new Error("먼저 초기 비밀번호를 변경해주세요.")
  if (role && current.role !== role) throw new Error("이 작업을 수행할 권한이 없습니다.")
  return current
}

// Discard credentials left by previous releases; reload requires a fresh sign-in.
clearSession()
