import { useCallback, useEffect, useRef, useState } from "react";
import { getPdaResultPdf, listStaffResults, type ResultBoardItem, type ResultBoardStats, type ResultCategory } from "../lib/adminApi";
import { Button, Card, Modal, Table, Td, Th } from "../lib/ui";

import PdfPreview from "../components/PdfPreview";

const filters: { key: ResultCategory; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "COMPLETED", label: "응답완료" },
  { key: "UNUSED", label: "미사용" },
];

const emptyStats: ResultBoardStats = {
  totalIssuedCount: 0,
  responseCompletedCount: 0,
  unusedCount: 0,
};

export default function AdminResponses() {
  const [category, setCategory] = useState<ResultCategory>("ALL");
  const [items, setItems] = useState<ResultBoardItem[]>([]);
  const [stats, setStats] = useState<ResultBoardStats>(emptyStats);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingRecordId, setOpeningRecordId] = useState<number | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const loadRequestId = useRef(0);
  const pdfRequestId = useRef(0);

  const loadResults = useCallback(
    async (isRefresh = false) => {
      const requestId = ++loadRequestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await listStaffResults({ category, page, pageSize });
        if (requestId !== loadRequestId.current) return;
        setItems(result.items);
        setStats(result.stats);
        setTotal(result.total);
      } catch (err) {
        if (requestId !== loadRequestId.current) return;
        setError(err instanceof Error ? err.message : "응답 목록을 불러오지 못했습니다.");
      } finally {
        if (requestId === loadRequestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [category, page],
  );

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => () => { pdfRequestId.current += 1; loadRequestId.current += 1; }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const selectCategory = (next: ResultCategory) => {
    setCategory(next);
    setPage(1);
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  };

  const openResultPdf = async (recordId: number | null) => {
    if (recordId === null) {
      setError("PDF 결과지의 응답 기록 ID를 확인할 수 없습니다.");
      return;
    }

    const requestId = ++pdfRequestId.current;
    setPdfUrl(null);
    setPdfFile(null);
    setPdfModalOpen(true);
    setOpeningRecordId(recordId);
    setError("");
    try {
      const pdf = await getPdaResultPdf(recordId);
      if (requestId !== pdfRequestId.current) return;
      const pdfBlob = pdf;
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setPdfFile(pdf);
      setPdfUrl(pdfUrl);
    } catch (err) {
      if (requestId !== pdfRequestId.current) return;
      setPdfModalOpen(false);
      setError(err instanceof Error ? err.message : "PDF 결과지를 불러오지 못했습니다.");
    } finally {
      if (requestId === pdfRequestId.current) setOpeningRecordId(null);
    }
  };

  const closeResultPdf = () => {
    pdfRequestId.current += 1;
    setPdfModalOpen(false);
    setPdfUrl(null);
    setPdfFile(null);
    setOpeningRecordId(null);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-bold tracking-[-0.03em] text-[#0F172A]">통합 응답 결과 게시판</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">최종 제출 응답과 미사용 PIN을 설문 1건당 한 행으로 조회합니다.</p>
        </div>
        {/* <Button variant="outline" className="px-3 py-2 text-[13px]" onClick={() => void loadResults(true)} disabled={refreshing}>
          {refreshing ? "새로고침 중..." : "새로고침"}
        </Button> */}
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-[13px] text-[#9F1239]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "전체 발급", value: stats.totalIssuedCount },
          { label: "응답 완료", value: stats.responseCompletedCount },
          { label: "미사용", value: stats.unusedCount },
        ].map((item) => (
          <Card key={item.label} className="min-h-[94px] p-5">
            <div className="text-[13px] font-medium text-[#64748B]">{item.label}</div>
            <div className="mt-2 text-[27px] font-bold tabular-nums leading-none text-[#0F172A]">{item.value.toLocaleString()}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex w-fit flex-wrap items-center gap-1 rounded-xl bg-[#EFF4F3] p-1">
          {filters.map((filter) => (
            <button key={filter.key} onClick={() => selectCategory(filter.key)} className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${category === filter.key ? "bg-white text-[#0F766E] shadow-sm" : "text-[#64748B] hover:bg-white/70 hover:text-[#0F172A]"}`}>
              {filter.label}
            </button>
          ))}
        </div>

        <Table>
          <thead>
            <tr>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">고유번호(PIN)</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">담당 의사</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">등록번호</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">제출일시</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-[12px]">상태</Th>
              <Th className="border-0 bg-[#F3F7F6] px-3 py-2.5 text-center text-[12px]">결과지</Th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              items.map((item, index) => (
                <tr key={(page - 1) * pageSize + index + 1} className="transition-colors hover:bg-[#F8FAFC]">
                  <Td className="px-3 py-3 text-[13px] font-medium text-[#0F172A]">{item.pin}</Td>
                  <Td className="px-3 py-3 text-[13px] text-[#334155]">{item.providerName ?? "—"}</Td>
                  <Td className="px-3 py-3 text-[13px] text-[#334155]">{item.registrationNumber ?? "—"}</Td>
                  <Td className="px-3 py-3 tabular-nums text-[13px] text-[#64748B]">{formatDateTime(item.submittedAt)}</Td>
                  <Td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${item.state === "COMPLETED" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F1F5F9] text-[#475569]"}`}>{item.state === "COMPLETED" ? "응답완료" : "미사용"}</span>
                  </Td>
                  <Td className="px-3 py-3 text-center">
                    {item.resultAvailable ? (
                      <Button
                        variant="outline"
                        className="px-3 py-1.5 text-[12px]"
                        disabled={openingRecordId === item.recordId}
                        onClick={() => void openResultPdf(item.recordId)}
                      >
                        {openingRecordId === item.recordId ? "여는 중..." : "PDF"}
                      </Button>
                    ) : (
                      <span className="text-[13px] text-[#94A3B8]">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            {loading && (
              <tr>
                <Td className="py-12 text-center text-[#94A3B8]">불러오는 중...</Td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <Td className="py-12 text-center text-[#94A3B8]">해당 상태의 항목이 없습니다.</Td>
              </tr>
            )}
          </tbody>
        </Table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-[13px] text-[#64748B]">
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

      <Modal open={pdfModalOpen} onClose={closeResultPdf} title="PDA 응답 결과 PDF" className="max-w-6xl">
        {pdfUrl && <a href={pdfUrl} download="PDA-응답결과.pdf" className="mb-3 inline-block rounded border px-4 py-2">PDF 다운로드</a>}
        {pdfFile ? <PdfPreview file={pdfFile} /> : <p role="status" className="p-5 text-center">PDF 결과지를 불러오는 중입니다.</p>}
      </Modal>
    </div>
  );
}
