import { useState } from "react"
import { changePassword } from "../lib/auth"
import { Button, Card, Field, inputCls } from "../lib/ui"

export default function ChangePassword({ onComplete, onLogout }: { onComplete: () => void; onLogout: () => void }) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get("currentPassword") ?? "")
    const newPassword = String(form.get("newPassword") ?? "")
    const confirmation = String(form.get("confirmation") ?? "")
    if (newPassword !== confirmation) return setError("새 비밀번호 확인이 일치하지 않습니다.")
    setSaving(true)
    setError("")
    try {
      await changePassword(currentPassword, newPassword)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호를 변경하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid h-full place-items-center bg-[#F8FAFC] p-6">
      <Card className="w-full max-w-md p-7">
        <h1 className="text-[22px] font-bold">초기 비밀번호 변경</h1>
        <p className="mt-2 text-[14px] text-[#64748B]">계속하려면 임시 비밀번호를 새 비밀번호로 변경해주세요.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="현재 비밀번호"><input name="currentPassword" type="password" minLength={8} maxLength={64} autoComplete="current-password" className={inputCls} required /></Field>
          <Field label="새 비밀번호" hint="8~64자, 8~9자는 3종류·10자 이상은 2종류 조합"><input name="newPassword" type="password" minLength={8} maxLength={64} autoComplete="new-password" className={inputCls} required /></Field>
          <Field label="새 비밀번호 확인"><input name="confirmation" type="password" minLength={8} maxLength={64} autoComplete="new-password" className={inputCls} required /></Field>
          {error && <p className="text-[13px] text-[#BE123C]">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "변경 중..." : "비밀번호 변경"}</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onLogout}>로그아웃</Button>
        </form>
      </Card>
    </div>
  )
}
