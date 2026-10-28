import React, { useId } from "react"

/* ---------- Status badge ---------- */

type Status = "unused" | "completed" | "active" | "inactive" | "pending"

const badgeMap: Record<Status, { bg: string; text: string; label: string }> = {
  unused: { bg: "bg-[#F1F5F9]", text: "text-[#475569]", label: "미사용" },
  completed: { bg: "bg-[#DCFCE7]", text: "text-[#166534]", label: "응답 완료" },
  active: { bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]", label: "계정 활성" },
  inactive: { bg: "bg-[#FFE4E6]", text: "text-[#9F1239]", label: "계정 정지" },
  pending: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", label: "발송 대기" },
}

export function Badge({ status, children }: { status: Status; children?: React.ReactNode }) {
  const s = badgeMap[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ${s.bg} ${s.text}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children ?? s.label}
    </span>
  )
}

/* ---------- Card ---------- */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  )
}

/* ---------- Button ---------- */

type BtnVariant = "primary" | "ghost" | "outline" | "danger"

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: { variant?: BtnVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-[14px] font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 disabled:opacity-50 disabled:pointer-events-none"
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-[#2563EB] text-white px-4 py-2.5 hover:bg-[#1D4ED8] active:bg-[#1E40AF] shadow-[0_1px_2px_rgba(37,99,235,0.35)]",
    outline:
      "border border-[#E2E8F0] bg-white text-[#0F172A] px-4 py-2.5 hover:bg-[#F8FAFC] hover:border-[#CBD5E1]",
    ghost:
      "text-[#64748B] px-3 py-1.5 hover:bg-[#F1F5F9] hover:text-[#0F172A]",
    danger:
      "text-[#9F1239] px-3 py-1.5 hover:bg-[#FFE4E6]",
  }
  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

/* ---------- Table primitives ---------- */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  )
}

export function Th({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3.5 text-[13px] font-medium text-[#64748B] ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td
      className={`border-b border-[#F1F5F9] px-5 py-4 text-[14px] leading-[1.55] text-[#0F172A] ${className}`}
    >
      {children}
    </td>
  )
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  className = "max-w-lg",
  busy = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  busy?: boolean
}) {
  const titleId = useId()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div
        className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-[2px]"
        onClick={() => { if (!busy) onClose() }}
      />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className={`relative z-10 max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl ${className}`}>
        <div className="mb-5 flex items-start justify-between">
          <h3 id={titleId} className="text-[18px] font-bold text-[#0F172A]">{title}</h3>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md p-1 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return <p role="alert" className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-[13px] text-[#9F1239]">{message}</p>
}

export function formValidationMessage(target: EventTarget): string {
  if (!(target instanceof HTMLInputElement)) return "입력값을 확인해주세요."
  const label = target.labels?.[0]?.querySelector("span")?.textContent ?? "입력값"
  if (target.validity.valueMissing) return `${label}을(를) 입력해주세요.`
  if (target.validity.typeMismatch) return `${label} 형식을 확인해주세요.`
  if (target.validity.patternMismatch && target.title) return target.title
  if (target.validity.tooShort) return `${label}은(는) ${target.minLength}자 이상 입력해주세요.`
  return `${label}을(를) 확인해주세요.`
}

/* ---------- Form field ---------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#334155]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-[#94A3B8]">{hint}</span>}
    </label>
  )
}

export const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/15"
