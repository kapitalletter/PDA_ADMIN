import { useState } from "react";
import { signIn, type SignInResponse } from "../lib/auth";
import { Button, Field, inputCls } from "../lib/ui";

export default function Login({ onLogin, message, disabled = false }: { onLogin: (session: SignInResponse) => void; message?: string; disabled?: boolean }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || disabled) return;
    setError("");
    setIsSubmitting(true);

    try {
      const session = await signIn(loginId, password);
      setPassword("");
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid h-full grid-rows-[minmax(120px,1fr)_9fr] overflow-y-auto">
      <div className="relative flex flex-col justify-center overflow-hidden bg-[#0F172A] px-6 py-8 text-white lg:px-12">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#2563EB]/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-[#1E3A8A]/40 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          {/* <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#2563EB]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </div> */}
          {/* <div className="leading-tight text-left">
            <div className="text-[19px] font-bold tracking-[-0.02em]">Palliative</div>
            <div className="text-[14px] font-medium text-white/60">Admin Management System</div>
          </div> */}
          <div className="absolute left-1/2 w-[min(68vw,760px)] -translate-x-1/2 text-center">
            <h1 className="text-[21px] font-bold leading-tight tracking-[-0.025em] sm:text-[28px]">환자 중심 완화의료 통합 관리 플랫폼</h1>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[#F8FAFC] p-6">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-[29px] font-bold tracking-[-0.025em] text-[#0F172A]">로그인</h2>
          </div>

          <div className="space-y-4">
            <Field label="이메일">
              <input name="loginId" type="email" maxLength={100} className={`${inputCls} py-3 text-[16px]`} placeholder="admin@hospice.kr" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="비밀번호">
              <input name="password" type="password" minLength={8} maxLength={64} className={`${inputCls} py-3 text-[16px]`} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          </div>

          {message && <p role="status" className="mt-4 text-[13px] text-[#64748B]">{message}</p>}
          {error && <p role="alert" className="mt-4 text-[13px] text-[#BE123C]">{error}</p>}

          <Button type="submit" className="mt-7 w-full py-3.5 text-[16px]" disabled={isSubmitting || disabled}>
            {isSubmitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </div>
    </div>
  );
}
