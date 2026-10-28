import { useEffect, useState } from "react";
import { createHospital, deleteHospital, listHospitals, setHospitalStatus, updateStaffAccount } from "../lib/adminApi";
import type { PalliativeAccount } from "../lib/data";
import { Badge, Button, Card, Field, FormError, Modal, Table, Td, Th, formValidationMessage, inputCls } from "../lib/ui";

export default function OwnerAccounts() {
  const [rows, setRows] = useState<PalliativeAccount[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PalliativeAccount | null>(null);
  const [createdAccount, setCreatedAccount] = useState<PalliativeAccount | null>(null);
  const [deleting, setDeleting] = useState<PalliativeAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    listHospitals({ search: query, page, pageSize })
      .then((result) => {
        if (!current) return;
        setRows(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
      })
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : "기관 목록을 불러오지 못했습니다."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, pageSize, query, revision]);

  const toggleStatus = async (row: PalliativeAccount) => {
    if (saving) return;
    setSaving(true);
    const status = row.status === "active" ? "inactive" : "active";
    setError("");
    try {
      const updated = await setHospitalStatus(row.id, status);
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.");
    } finally { setSaving(false); }
  };

  const update = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || saving) return;
    const form = new FormData(event.currentTarget);
    const initialPassword = String(form.get("initialPassword") || "");
    const hospitalCode = String(form.get("hospitalCode") || "").trim();
    setSaving(true);
    setError("");
    try {
      const updated = await updateStaffAccount(editing.id, {
        hospitalCode: hospitalCode || undefined,
        institutionName: String(form.get("institutionName") || "").trim(),
        name: String(form.get("name") || "").trim(),
        contactPhone: String(form.get("contactPhone") || "").trim(),
        loginId: String(form.get("loginId") || "").trim(),
        isActive: form.get("isActive") === "on",
        ...(initialPassword ? { initialPassword } : {}),
      });
      setRows((rs) => rs.map((row) => (row.id === updated.id ? updated : row)));
      setEditing(null);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정을 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: PalliativeAccount) => {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await deleteHospital(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      setTotal((count) => Math.max(0, count - 1));
      setDeleting(null);
      setPage((current) => Math.min(current, Math.max(1, Math.ceil((total - 1) / pageSize))));
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const f = new FormData(e.currentTarget);
    const institutionName = String(f.get("institutionName") || "").trim();
    setSaving(true);
    setError("");
    try {
      const created = await createHospital({
        hospitalCode: String(f.get("hospitalCode") || "").trim(),
        institutionName,
        name: String(f.get("name") || "").trim(),
        contactPhone: String(f.get("contactPhone") || "").trim(),
        loginId: String(f.get("loginId") || "").trim(),
        initialPassword: String(f.get("initialPassword") || ""),
      });
      setRows((rs) => [created, ...rs].slice(0, pageSize));
      setTotal((count) => count + 1);
      setOpen(false);
      setCreatedAccount(created);
      setPage(1);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정을 생성하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(searchInput);
    setPage(1);
    setRevision((value) => value + 1);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-[-0.03em] text-[#0F172A]">완화의료 계정 관리</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">등록된 완화의료 기관 계정의 상태를 확인하고 관리합니다.</p>
        </div>
        <Button onClick={() => { setError(""); setOpen(true); }} disabled={saving} className="px-5 py-3">
          + 신규 완화의료 계정 생성
        </Button>
      </header>

      {!open && !editing && !deleting && <FormError message={error} />}

      <form onSubmit={search} className="flex justify-end gap-2">
        <input maxLength={60} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="기관, 담당자, 연락처 검색" className={`${inputCls} h-11 w-full max-w-[450px]`} />
        <Button type="submit" variant="outline" className="h-11 min-w-16 px-4">
          검색
        </Button>
      </form>

      <Card className="mt-4 p-5">
        <Table>
          <thead>
            <tr>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">완화의료 기관(담당자)</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">로그인 이메일</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">연락처</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">등록일</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">상태</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-right text-[12px]">관리</Th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-[#F8FAFC]">
                  <Td className="px-3 py-3 text-[13px]">
                    <div className="font-semibold text-[#0F172A]">{r.org}</div>
                    <div className="mt-0.5 text-[12px] text-[#64748B]">{r.manager}</div>
                  </Td>
                  <Td className="px-3 py-3 text-[13px] text-[#334155]">{r.loginId || "—"}</Td>
                  <Td className="px-3 py-3 text-[13px] tabular-nums text-[#334155]">{r.contact}</Td>
                  <Td className="px-3 py-3 text-[13px] tabular-nums text-[#64748B]">{formatDateTime(r.registeredAt)}</Td>
                  <Td className="px-3 py-3">
                    <Badge status={r.status} />
                  </Td>
                  <Td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" className="px-2 py-1 text-[12px]" disabled={saving} onClick={() => { setError(""); setEditing(r); }}>
                        수정
                      </Button>
                      <Button variant="ghost" className="px-2 py-1 text-[12px]" disabled={saving} onClick={() => toggleStatus(r)}>
                        {r.status === "active" ? "정지" : "활성화"}
                      </Button>
                      <Button variant="danger" className="px-2 py-1 text-[12px]" disabled={saving} onClick={() => { setError(""); setDeleting(r); }}>
                        삭제
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            {loading && (
              <tr>
                <Td className="py-12 text-center text-[#94A3B8]">불러오는 중...</Td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <Td className="py-12 text-center text-[#94A3B8]">검색 결과가 없습니다.</Td>
              </tr>
            )}
          </tbody>
        </Table>
        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-1 pt-4 text-[13px] text-[#64748B]">
            <span>
              총 {total.toLocaleString()}건 · {page} / {pageCount} 페이지
            </span>
            <div className="flex gap-2">
              <Button variant="outline" className="px-3 py-1.5 text-[13px]" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                이전
              </Button>
              <Button variant="outline" className="px-3 py-1.5 text-[13px]" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
                다음
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={open} busy={saving} onClose={() => setOpen(false)} title="신규 완화의료 계정 생성">
        <form onSubmit={create} onInvalidCapture={(event) => setError(formValidationMessage(event.target))} className="space-y-4">
          <div className="grid grid-cols-[1fr_2fr] gap-4">
            <Field label="의료기관 코드" hint="예: 01: 세브란스, 02: 서울병원">
              <input name="hospitalCode" className={inputCls} placeholder="예) 01" inputMode="numeric" pattern="[0-9]{2}" title="의료기관 코드는 숫자 두 자리로 입력해주세요." maxLength={2} autoFocus required />
            </Field>
            <Field label="완화의료 기관명">
              <input maxLength={60} name="institutionName" className={inputCls} placeholder="예) 00 병원" required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="담당자명">
              <input maxLength={60} name="name" className={inputCls} placeholder="예) 김서연" required />
            </Field>
            <Field label="연락처" hint="하이픈을 포함하거나 숫자만 입력할 수 있습니다.">
              <input type="tel" maxLength={13} minLength={9} inputMode="tel" pattern="(?:[0-9]{9,11}|0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4})" title="연락처는 02-0000-0000, 010-0000-0000 또는 숫자 9~11자리로 입력해주세요." name="contactPhone" className={inputCls} placeholder="예) 010-0000-0000" required />
            </Field>
          </div>
          <Field label="로그인 ID (이메일)">
            <input maxLength={60} name="loginId" type="email" className={inputCls} placeholder="예) manager@hospice.kr" required />
          </Field>
          <Field label="임시 비밀번호" hint="8~64자, 8~9자는 영문 대·소문자·숫자·특수문자 중 3종류, 10자 이상은 2종류 이상 조합. 최초 로그인 후 변경합니다.">
            <input name="initialPassword" type="password" className={inputCls} minLength={8} maxLength={64} autoComplete="new-password" required />
          </Field>
          <FormError message={error} />
          <div className="mt-2 flex justify-end gap-2 border-t border-[#F1F5F9] pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "생성 중..." : "계정 생성"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={createdAccount !== null} onClose={() => setCreatedAccount(null)} title="완화의료 계정 생성 완료">
        {createdAccount && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#EFF6FF] p-4 text-[14px] leading-relaxed text-[#1E40AF]">
              <strong>{createdAccount.org}</strong> 계정이 생성되었습니다. 담당자는 첫 로그인 시 임시 비밀번호를 변경해야 합니다.
            </div>
            <dl className="space-y-2 rounded-xl border border-[#E2E8F0] p-4 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">담당자</dt>
                <dd className="font-medium">{createdAccount.manager}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">로그인 이메일</dt>
                <dd className="font-medium">{createdAccount.loginId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">의료기관 코드</dt>
                <dd className="font-medium">{createdAccount.hospitalCode}</dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <Button onClick={() => setCreatedAccount(null)}>확인</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editing !== null} busy={saving} onClose={() => setEditing(null)} title="완화의료 계정 수정">
        {editing && (
          <form key={editing.id} onSubmit={update} onInvalidCapture={(event) => setError(formValidationMessage(event.target))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="의료기관 코드" hint="숫자 두 자리 (비우면 기존 값 유지)">
                <input name="hospitalCode" className={inputCls} defaultValue={editing.hospitalCode ?? ""} maxLength={2} inputMode="numeric" pattern="[0-9]{2}" title="의료기관 코드는 숫자 두 자리로 입력해주세요." placeholder="예) 01" />
              </Field>
              <Field label="계정 상태">
                <label className="flex h-[42px] items-center gap-2 rounded-lg border border-[#E2E8F0] px-3.5 text-[14px] text-[#334155]">
                  <input name="isActive" type="checkbox" defaultChecked={editing.status === "active"} className="size-4 accent-[#2563EB]" />
                  계정 활성
                </label>
              </Field>
            </div>
            <Field label="완화의료 기관명">
              <input maxLength={60} name="institutionName" className={inputCls} defaultValue={editing.org} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="담당자명">
                <input maxLength={60} name="name" className={inputCls} defaultValue={editing.manager} required />
              </Field>
              <Field label="연락처" hint="하이픈을 포함하거나 숫자만 입력할 수 있습니다.">
                <input type="tel" maxLength={13} minLength={9} inputMode="tel" pattern="(?:[0-9]{9,11}|0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4})" title="연락처는 02-0000-0000, 010-0000-0000 또는 숫자 9~11자리로 입력해주세요." name="contactPhone" className={inputCls} defaultValue={editing.contact === "—" ? "" : editing.contact} placeholder="010-0000-0000" required />
              </Field>
            </div>
            <Field label="로그인 ID (이메일)">
              <input maxLength={60} name="loginId" type="email" className={inputCls} defaultValue={editing.loginId ?? ""} required />
            </Field>
            <Field label="임시 비밀번호" hint="변경할 때만 입력하세요. 8~64자, 8~9자는 3종류·10자 이상은 2종류 이상 조합">
              <input name="initialPassword" type="password" className={inputCls} minLength={8} maxLength={64} autoComplete="new-password" />
            </Field>
            <FormError message={error} />
            <div className="mt-2 flex justify-end gap-2 border-t border-[#F1F5F9] pt-4">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                취소
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={deleting !== null} busy={saving} onClose={() => setDeleting(null)} title="완화의료 계정 삭제">
        {deleting && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] p-4 text-[14px] leading-relaxed text-[#9F1239]">
              업무 이력이 없는 계정만 삭제할 수 있습니다. 고유번호 발급 또는 응답 이력이 있다면 삭제 대신 계정 정지 기능을 사용하세요.
            </div>
            <div className="rounded-xl border border-[#E2E8F0] p-4 text-[14px]">
              <div className="font-semibold text-[#0F172A]">{deleting.org}</div>
              <div className="mt-1 text-[#64748B]">담당자: {deleting.manager} · {deleting.loginId}</div>
            </div>
            <p className="text-[13px] text-[#64748B]">정말 이 계정을 삭제하시겠습니까?</p>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setDeleting(null)}>취소</Button>
              <Button type="button" variant="danger" onClick={() => remove(deleting)} disabled={saving}>삭제</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
