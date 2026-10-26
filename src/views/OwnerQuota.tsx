import { useEffect, useState } from "react"
import { grantStaffQuota, listCodeStatus, type CodeSummary, type InstitutionCodeStatus } from "../lib/adminApi"
import { Button, Card, Field, Table, Td, Th, inputCls } from "../lib/ui"

function Metric({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "brand" | "slate" | "emerald" }) {
  const toneMap = {
    brand: "text-[#2563EB] bg-[#DBEAFE]",
    slate: "text-[#475569] bg-[#F1F5F9]",
    emerald: "text-[#166534] bg-[#DCFCE7]",
  }[tone]

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-[14px] font-medium text-[#64748B]">{label}</span>
        <span className={`rounded-lg px-2 py-1 text-[12px] font-semibold ${toneMap}`}>{sub}</span>
      </div>
      <div className="mt-4 text-[32px] font-bold tabular-nums leading-none tracking-[-0.02em] text-[#0F172A]">
        {value.toLocaleString()}<span className="ml-1 text-[15px] font-medium text-[#94A3B8]">건</span>
      </div>
    </Card>
  )
}

const emptySummary: CodeSummary = {
  allocatedCodeCount: 0,
  generatedCodeCount: 0,
  redeemedCodeCount: 0,
  remainingCodeCount: 0,
}

export default function OwnerQuota() {
  const [rows, setRows] = useState<InstitutionCodeStatus[]>([])
  const [total, setTotal] = useState<CodeSummary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [targetStaffId, setTargetStaffId] = useState("")
  const [count, setCount] = useState("")

  useEffect(() => {
    listCodeStatus()
      .then((result) => {
        setRows(result.institutions)
        setTotal(result.total)
        setTargetStaffId(String(result.institutions[0]?.staffId ?? ""))
      })
      .catch((err) => setError(err instanceof Error ? err.message : "고유번호 현황을 불러오지 못했습니다."))
      .finally(() => setLoading(false))
  }, [])

  const formatDateTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
  }

  const grantQuota = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const staffId = Number(targetStaffId)
    const amount = Number(count)
    if (!Number.isInteger(staffId) || !Number.isInteger(amount) || amount < 1 || amount > 100_000) return

    setSaving(true)
    setError("")
    try {
      const updated = await grantStaffQuota(staffId, amount)
      setRows((institutions) => institutions.map((institution) => institution.staffId === staffId ? {
        ...institution,
        hospitalName: updated.org,
        staffName: updated.manager,
        allocatedCodeCount: updated.allocatedCodeCount ?? institution.allocatedCodeCount + amount,
        generatedCodeCount: updated.generatedCodeCount ?? institution.generatedCodeCount,
        remainingCodeCount: updated.remainingCodeCount ?? institution.remainingCodeCount + amount,
        updatedAt: updated.updatedAt ?? new Date().toISOString(),
      } : institution))
      setTotal((summary) => ({
        ...summary,
        allocatedCodeCount: summary.allocatedCodeCount + amount,
        remainingCodeCount: summary.remainingCodeCount + amount,
      }))
      setCount("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "고유번호 한도를 부여하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[#0F172A]">고유번호 할당 &amp; 현황 대시보드</h1>
        <p className="mt-1 text-[14px] text-[#64748B]">시스템 전체 사용 현황과 완화의료 기관별 고유번호 현황을 조회합니다.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-[13px] text-[#9F1239]">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="시스템 전체 누적 할당 한도" value={total.allocatedCodeCount} sub="Allocated" tone="brand" />
        <Metric label="전체 실제 생성 수량" value={total.generatedCodeCount} sub="Generated" tone="slate" />
        <Metric label="회원가입 사용 완료 수량" value={total.redeemedCodeCount} sub="Redeemed" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="text-[16px] font-bold text-[#0F172A]">고유번호 한도 부여</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">완화의료 계정을 선택해 생성 가능 수량을 추가로 부여합니다.</p>
          <form onSubmit={grantQuota} className="mt-5 space-y-4">
            <Field label="완화의료 계정 선택">
              <select value={targetStaffId} onChange={(event) => setTargetStaffId(event.target.value)} className={inputCls} disabled={loading || rows.length === 0}>
                {rows.map((row) => <option key={row.staffId} value={row.staffId}>{row.hospitalName} · {row.staffName}</option>)}
              </select>
            </Field>
            <Field label="추가 부여 수량" hint="현재 누적 할당 한도에 더해집니다.">
              <input type="number" min={1} max={100000} step={1} value={count} onChange={(event) => setCount(event.target.value)} className={inputCls} placeholder="예) 50" required />
            </Field>
            <Button type="submit" className="w-full" disabled={saving || loading || rows.length === 0}>{saving ? "처리 중..." : "한도 부여"}</Button>
          </form>
        </Card>

      <Card>
        <div className="border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="text-[16px] font-bold text-[#0F172A]">기관별 현황</h2>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>완화의료 기관 (담당자)</Th>
              <Th className="text-right">할당 수량</Th>
              <Th className="text-right">실제 생성</Th>
              <Th className="text-right">사용 완료</Th>
              <Th className="text-right">잔여 수량</Th>
              <Th className="text-right">최종 업데이트</Th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.map((row) => (
              <tr key={row.staffId} className="transition-colors hover:bg-[#F8FAFC]">
                <Td><div className="font-semibold">{row.hospitalName}</div><div className="text-[13px] text-[#64748B]">{row.staffName}</div></Td>
                <Td className="text-right tabular-nums">{row.allocatedCodeCount.toLocaleString()}</Td>
                <Td className="text-right tabular-nums">{row.generatedCodeCount.toLocaleString()}</Td>
                <Td className="text-right tabular-nums text-[#166534]">{row.redeemedCodeCount.toLocaleString()}</Td>
                <Td className="text-right"><span className={`tabular-nums font-semibold ${row.remainingCodeCount <= 20 ? "text-[#9F1239]" : "text-[#2563EB]"}`}>{row.remainingCodeCount.toLocaleString()}</span></Td>
                <Td className="text-right tabular-nums text-[13px] text-[#64748B]">{formatDateTime(row.updatedAt)}</Td>
              </tr>
            ))}
            {loading && <tr><Td className="py-12 text-center text-[#94A3B8]">불러오는 중...</Td></tr>}
            {!loading && rows.length === 0 && <tr><Td className="py-12 text-center text-[#94A3B8]">조회된 기관 현황이 없습니다.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      </div>
    </div>
  )
}
