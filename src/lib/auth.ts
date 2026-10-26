import { apiRequest, cancelRequests, isMockApi } from "./apiClient"
import { boundedText, passwordPolicy } from "./security"
import { clearSession, requireSession, saveSession, validateSession, type SignInResponse } from "./session"
export { clearSession, restoreSession, saveSession } from "./session"
export type { ApiRole, SignInResponse } from "./session"

type StaffMe = Pick<SignInResponse, "role" | "hospitalId" | "mustChangePassword">
async function verifyIdentity(session: SignInResponse) {
  const me = await apiRequest<StaffMe>("/manage/me")
  if (!me || me.role !== session.role || me.hospitalId !== session.hospitalId || me.mustChangePassword !== session.mustChangePassword) {
    throw new Error("계정 권한 정보를 확인할 수 없습니다. 다시 로그인해주세요.")
  }
}
export async function signIn(loginId: string, password: string): Promise<SignInResponse> {
  clearSession()
  cancelRequests()
  if (isMockApi()) throw new Error("관리자 인증에는 실제 API가 필요합니다.")
  boundedText(loginId, 100)
  if ([...password].length < 8 || [...password].length > 64 || /[\u0000-\u001f\u007f]/.test(password)) throw new Error("비밀번호는 8~64자로 입력해주세요.")
  const result = validateSession(await apiRequest<SignInResponse>("/manage/sign-in", { method: "POST", auth: false, body: { loginId: loginId.trim(), password } }))
  saveSession(result)
  try { await verifyIdentity(result); return result } catch (error) { clearSession(); throw error }
}
export async function changePassword(currentPassword: string, newPassword: string) {
  const current = requireSession()
  passwordPolicy(newPassword)
  if (newPassword === currentPassword) throw new Error("현재와 다른 새 비밀번호를 입력해주세요.")
  const response = await apiRequest<SignInResponse>("/manage/password", { method: "PUT", body: { currentPassword, newPassword } })
  let result: SignInResponse
  try { result = validateSession(response) } catch (error) {
    clearSession(); window.dispatchEvent(new Event("pda:unauthorized")); throw error
  }
  if (result.accessToken === current.accessToken || result.mustChangePassword || result.role !== current.role || result.hospitalId !== current.hospitalId) {
    clearSession()
    window.dispatchEvent(new Event("pda:unauthorized"))
    throw new Error("새 로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요.")
  }
  cancelRequests()
  saveSession(result)
  try { await verifyIdentity(result) } catch (error) {
    clearSession(); window.dispatchEvent(new Event("pda:unauthorized")); throw error
  }
}
export async function signOut(): Promise<boolean> {
  cancelRequests()
  try {
    // The shared backend endpoint revokes USER and STAFF tokens by token version.
    await apiRequest("/auth/sign-out", { method: "POST" })
    return true
  } catch { return false } finally { clearSession(); cancelRequests() }
}
