import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDoctor, downloadSignupQr, downloadUnusedCodes, getDoctorDetail, issueCodes, listDoctors, updateDoctor, type CodeBatchResult, type ProviderDetail } from "../lib/adminApi";
import { positiveInteger } from "../lib/security";
import type { Doctor } from "../lib/data";
import { Badge, Button, Card, Field, FormError, Modal, Table, Td, Th, formValidationMessage, inputCls } from "../lib/ui";

export default function AdminDoctors() {
  const [rows, setRows] = useState<Doctor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [open, setOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [detailDoctor, setDetailDoctor] = useState<ProviderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [batchResult, setBatchResult] = useState<CodeBatchResult | null>(null);
  const [batchProviderName, setBatchProviderName] = useState("");
  const [revision, setRevision] = useState(0);
  const loadRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const loadDoctors = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const { items, total: resultTotal, pageSize: resultPageSize } = await listDoctors({ page, pageSize });
      if (requestId !== loadRequestId.current) return;
      setRows(items);
      setTotal(resultTotal);
      setPageSize(resultPageSize);
    } catch (err) {
      if (requestId === loadRequestId.current) setError(err instanceof Error ? err.message : "의사 목록을 불러오지 못했습니다.");
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [page, pageSize, revision]);

  useEffect(() => {
    void loadDoctors();
    return () => { loadRequestId.current += 1; };
  }, [loadDoctors]);

  useEffect(() => () => { detailRequestId.current += 1; }, []);

  const issuedSum = useMemo(() => rows.reduce((a, r) => a + r.issued, 0), [rows]);
  const usedSum = useMemo(() => rows.reduce((sum, doctor) => sum + doctor.used, 0), [rows]);

  const addDoctor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    setSaving(true);
    setError("");
    try {
      const created = await createDoctor({
        name,
        department: String(f.get("department") || "").trim(),
        email: String(f.get("email") || "").trim(),
      });
      setRows((rs) => [created, ...rs].slice(0, pageSize));
      setTotal((count) => count + 1);
      setPage(1);
      setRevision((value) => value + 1);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "의사를 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const editDoctor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!editingDoctor) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    setSaving(true);
    setError("");
    try {
      const updated = await updateDoctor(editingDoctor.id, {
        name,
        department: String(form.get("department") || "").trim() || null,
        email,
        isActive: form.get("isActive") === "true",
      });
      setRows((current) => current.map((doctor) => (doctor.id === updated.id ? updated : doctor)));
      setEditingDoctor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "의사 정보를 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const openDoctorDetail = async (doctorId: string) => {
    const requestId = ++detailRequestId.current;
    setDetailOpen(true);
    setDetailDoctor(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const detail = await getDoctorDetail(doctorId);
      if (requestId === detailRequestId.current) setDetailDoctor(detail);
    } catch (err) {
      if (requestId === detailRequestId.current) setDetailError(err instanceof Error ? err.message : "의사 상세 정보를 불러오지 못했습니다.");
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  };

  const issueBatch = async (doctorId: string) => {
    const n = Number(issueQty[doctorId] || "");
    if (saving) return;
    if (rows.find((doctor) => doctor.id === doctorId)?.status !== "active") {
      setError("활성 상태의 의사에게만 고유번호를 발급할 수 있습니다.");
      return;
    }
    try { positiveInteger(issueQty[doctorId] || "", 100); } catch (err) { setError((err as Error).message); return; }
    const providerId = Number(doctorId);
    if (!Number.isInteger(providerId)) {
      setError("의사 ID 형식이 올바르지 않습니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await issueCodes(providerId, n);
      setRows((rs) => rs.map((r) => (r.id === doctorId ? { ...r, issued: r.issued + n } : r)));
      setIssueQty((quantities) => ({ ...quantities, [doctorId]: "" }));
      setBatchProviderName(rows.find((doctor) => doctor.id === doctorId)?.name ?? "의사");
      setBatchResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "고유번호를 발급하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const downloadUnusedExcel = async (doctorId: string) => {
    if (saving) return;
    const providerId = Number(doctorId);
    if (!Number.isInteger(providerId)) {
      setError("의사 ID 형식이 올바르지 않습니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const blob = await downloadUnusedCodes(providerId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `unused-codes-${providerId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "미사용 고유번호 Excel을 다운로드하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const downloadSignupQrImage = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const blob = await downloadSignupQr();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "QR_소아과.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 QR 이미지를 다운로드하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-[-0.03em] text-[#0F172A]">의사 관리 &amp; 고유번호 발급</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">소속 의사를 등록하고 해당 의사에게 환자용 고유번호를 발급합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void downloadSignupQrImage()} disabled={saving}>
            회원가입 QR 발급
          </Button>
          <Button disabled={saving} onClick={() => { setError(""); setOpen(true); }}>+ 의사 등록</Button>
        </div>
      </header>
      {!open && !editingDoctor && !batchResult && <FormError message={error} />}

      <div className="flex flex-wrap items-center gap-7 rounded-2xl border border-[#93C5FD] bg-[#EAF3FF] px-6 py-5">
        <div className="min-w-[210px]">
          <div className="text-[13px] font-medium text-[#1E40AF]">현재 페이지 발급 및 사용 현황</div>
          <div className="mt-1 text-[28px] font-bold tabular-nums leading-none text-[#1E3A8A]">
            {issuedSum.toLocaleString()}
            <span className="ml-1 text-[15px] font-medium text-[#3B82F6]">발급 / {usedSum.toLocaleString()} 사용</span>
          </div>
        </div>
        <div className="h-2.5 min-w-[220px] flex-1 overflow-hidden rounded-full bg-white/80">
          <div className="h-full rounded-full bg-[#2563EB] transition-all" style={{ width: `${issuedSum ? Math.min(100, (usedSum / issuedSum) * 100) : 0}%` }} />
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-[#0F172A]">의사 리스트</h2>
            {/* <p className="mt-1 text-[13px] text-[#64748B]">발급수량과 사용수량은 선택한 의사에 연결된 PIN을 기준으로 계산됩니다.</p> */}
          </div>
          {/* <Button variant="outline" className="px-3 py-2 text-[13px]" onClick={() => void loadDoctors()} disabled={loading}>
            새로고침
          </Button> */}
        </div>
        <Table>
          <thead>
            <tr>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">의사(진료과)</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">수신 이메일</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-center text-[12px]">발급수량</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-center text-[12px]">사용수량</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">상태</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">고유번호 발급</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">의사 정보 관리</Th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]">
                  <Td className="px-3 py-3 text-[13px]">
                    <button type="button" onClick={() => void openDoctorDetail(r.id)} className="-m-2 block w-[calc(100%+1rem)] rounded-lg p-2 text-left transition-colors hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]">
                      <div className="font-semibold text-[#0F172A] hover:text-[#2563EB]">{r.name}</div>
                      <div className="text-[13px] text-[#64748B]">{r.department}</div>
                    </button>
                  </Td>
                  <Td className="px-3 py-3 text-[13px] text-[#334155]">{r.email}</Td>
                  <Td className="px-3 py-3 text-center tabular-nums">{r.issued}</Td>
                  <Td className="px-3 py-3 text-center tabular-nums text-[#166534]">{r.used}</Td>
                  <Td className="px-3 py-3">
                    <Badge status={r.status} />
                  </Td>
                  <Td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} max={100} value={issueQty[r.id] ?? ""} onChange={(event) => setIssueQty((quantities) => ({ ...quantities, [r.id]: event.target.value }))} className="h-9 w-[68px] rounded-xl border border-[#CBD5E1] px-2 text-center text-[13px] outline-none focus:border-[#2563EB]" placeholder="수량" />
                      <Button className="px-3 py-2 text-[12px]" onClick={() => void issueBatch(r.id)} disabled={saving || r.status !== "active"}>
                        일괄 발급
                      </Button>
                      <Button variant="outline" className="px-3 py-2 text-[12px]" onClick={() => void downloadUnusedExcel(r.id)} disabled={saving}>
                        미사용 고유번호 다운로드
                      </Button>
                    </div>
                  </Td>
                  <Td className="px-3 py-3">
                    <Button variant="outline" className="px-3 py-2 text-[12px]" onClick={() => { setError(""); setEditingDoctor(r); }} disabled={saving}>
                      수정
                    </Button>
                  </Td>
                </tr>
              ))}
            {loading && (
              <tr>
                <Td className="py-12 text-center text-[#94A3B8]">불러오는 중...</Td>
              </tr>
            )}
            {!loading && rows.length === 0 && <tr><Td className="py-12 text-center text-[#94A3B8]">등록된 의사가 없습니다.</Td></tr>}
          </tbody>
        </Table>
        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-[13px] text-[#64748B]">
            <span>
              총 {total.toLocaleString()}명 · {page} / {Math.max(1, Math.ceil(total / pageSize))} 페이지
            </span>
            <div className="flex gap-2">
              <Button variant="outline" className="px-3 py-1.5 text-[13px]" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                이전
              </Button>
              <Button variant="outline" className="px-3 py-1.5 text-[13px]" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((current) => current + 1)}>
                다음
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={open} busy={saving} onClose={() => setOpen(false)} title="의사 계정 등록">
        <form onSubmit={addDoctor} onInvalidCapture={(event) => setError(formValidationMessage(event.target))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="의사 성명">
              <input maxLength={60} name="name" className={inputCls} placeholder="예) 윤재호 교수" required autoFocus />
            </Field>
            <Field label="진료과">
              <input maxLength={60} name="department" className={inputCls} placeholder="예) 혈액종양내과" required />
            </Field>
          </div>
          <Field label="수신 이메일" hint="환자 요약 양식이 이 주소로 자동 발송됩니다.">
            <input maxLength={60} name="email" type="email" className={inputCls} placeholder="예) doctor@hospice.kr" required />
          </Field>
          <FormError message={error} />
          <div className="mt-2 flex justify-end gap-2 border-t border-[#F1F5F9] pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "등록 중..." : "등록"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editingDoctor !== null} busy={saving} onClose={() => setEditingDoctor(null)} title="의사 정보 수정">
        {editingDoctor && (
          <form onSubmit={editDoctor} onInvalidCapture={(event) => setError(formValidationMessage(event.target))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="의사 성명">
                <input maxLength={60} name="name" className={inputCls} defaultValue={editingDoctor.name} required autoFocus />
              </Field>
              <Field label="진료과">
                <input maxLength={60} name="department" className={inputCls} defaultValue={editingDoctor.department === "—" ? "" : editingDoctor.department} placeholder="예) 혈액종양내과" required />
              </Field>
            </div>
            <Field label="수신 이메일">
              <input maxLength={60} name="email" type="email" className={inputCls} defaultValue={editingDoctor.email} required />
            </Field>
            <Field label="사용 상태">
              <select name="isActive" className={inputCls} defaultValue={editingDoctor.status === "active" ? "true" : "false"}>
                <option value="true">계정 활성</option>
                <option value="false">계정 정지</option>
              </select>
            </Field>
            <FormError message={error} />
            <div className="mt-2 flex justify-end gap-2 border-t border-[#F1F5F9] pt-4">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditingDoctor(null)}>
                취소
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={detailOpen} onClose={() => { detailRequestId.current += 1; setDetailOpen(false); }} title="의사 상세 정보">
        {detailLoading && <p className="py-8 text-center text-[14px] text-[#64748B]">불러오는 중...</p>}
        {detailError && (
          <p role="alert" className="py-8 text-center text-[14px] text-[#BE123C]">
            {detailError}
          </p>
        )}
        {detailDoctor && (
          <dl className="space-y-3 text-[14px]">
            {[
              ["의사 ID", detailDoctor.id],
              ["진료병원 ID", detailDoctor.hospitalId],
              ["의사 성명", detailDoctor.name],
              ["진료과", detailDoctor.department ?? "—"],
              ["수신 이메일", detailDoctor.email],
              ["발급 수량", `${detailDoctor.issuedCodeCount.toLocaleString()}건`],
              ["사용 수량", `${detailDoctor.usedCodeCount.toLocaleString()}건`],
              ["상태", detailDoctor.isActive ? "사용" : "사용 중지"],
              ["등록 시각", new Date(detailDoctor.createdAt).toLocaleString("ko-KR")],
              ["수정 시각", new Date(detailDoctor.updatedAt).toLocaleString("ko-KR")],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-6 border-b border-[#F1F5F9] pb-3 last:border-0">
                <dt className="shrink-0 text-[#64748B]">{label}</dt>
                <dd className="break-all text-right font-medium text-[#0F172A]">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      <Modal open={batchResult !== null} busy={saving} onClose={() => setBatchResult(null)} title="고유번호 일괄 발급 완료">
        {batchResult && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#EFF6FF] p-4 text-[14px] leading-relaxed text-[#1E40AF]">
              <strong>{batchProviderName}</strong> 의사에게 고유번호 {batchResult.count.toLocaleString()}건을 발급했습니다.
            </div>
            <dl className="space-y-2 rounded-xl border border-[#E2E8F0] p-4 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">발급 묶음 ID</dt>
                <dd className="font-medium">{batchResult.batchId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">잔여 생성 한도</dt>
                <dd className="font-medium">{batchResult.remainingCodeCount.toLocaleString()}건</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">발급 시각</dt>
                <dd className="font-medium">{new Date(batchResult.createdAt).toLocaleString("ko-KR")}</dd>
              </div>
            </dl>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => void downloadUnusedExcel(String(batchResult.providerId))} className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]">
                미사용 PIN Excel
              </button>
              <Button disabled={saving} onClick={() => setBatchResult(null)}>확인</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
