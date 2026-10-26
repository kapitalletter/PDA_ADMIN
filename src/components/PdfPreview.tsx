import { useEffect, useRef, useState } from "react"
import { assertPdfPageCount, boundedPdfScale, PDF_DOCUMENT_OPTIONS } from "../lib/pdfRender"

export default function PdfPreview({ file }: { file: Blob }) {
  const container = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const host = container.current!
    let disposed = false
    let destroy: (() => void) | undefined
    let cancelRender: (() => void) | undefined
    host.replaceChildren()
    setLoading(true)
    setFailed(false)
    const deadline = window.setTimeout(() => {
      if (!disposed) { setFailed(true); setLoading(false); host.replaceChildren(); cancelRender?.(); destroy?.(); disposed = true }
    }, 30_000)
    async function render() {
      try {
        if (file.size < 5 || file.size > 20 * 1024 * 1024) throw new Error("Invalid PDF size")
        const [pdfjs, worker] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
        ])
        if (disposed) return
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const data = new Uint8Array(await file.arrayBuffer())
        if (disposed) return
        const task = pdfjs.getDocument({
          data, ...PDF_DOCUMENT_OPTIONS,
          cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`, cMapPacked: true,
          standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
        })
        destroy = () => { void task.destroy().catch(() => undefined) }
        const pdf = await task.promise
        assertPdfPageCount(pdf.numPages)
        for (let number = 1; number <= pdf.numPages; number++) {
          if (disposed) return
          const page = await pdf.getPage(number)
          if (disposed) return
          const original = page.getViewport({ scale: 1 })
          const desired = Math.min(host.clientWidth || 800, 1200) / original.width * Math.min(window.devicePixelRatio || 1, 2)
          const viewport = page.getViewport({ scale: boundedPdfScale(original.width, original.height, desired, pdf.numPages) })
          const canvas = document.createElement("canvas")
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          canvas.style.width = "100%"
          canvas.style.height = "auto"
          canvas.className = "mb-4 bg-white shadow-sm"
          canvas.setAttribute("role", "img")
          canvas.setAttribute("aria-label", `PDA 결과지 ${number} / ${pdf.numPages} 페이지`)
          const rendering = page.render({ canvas, viewport })
          cancelRender = () => rendering.cancel()
          await rendering.promise
          if (disposed) return
          host.appendChild(canvas)
          page.cleanup()
          cancelRender = undefined
        }
      } catch {
        destroy?.()
        if (!disposed) { host.replaceChildren(); setFailed(true) }
      } finally {
        clearTimeout(deadline)
        if (!disposed) setLoading(false)
      }
    }
    void render()
    return () => { disposed = true; clearTimeout(deadline); cancelRender?.(); destroy?.(); host.replaceChildren() }
  }, [file])
  return <div className="h-[70vh] min-h-[420px] overflow-auto rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-3">
    {loading && <p role="status" className="p-5 text-center text-sm">PDF 결과지를 표시하는 중입니다.</p>}
    {failed && <p role="alert" className="p-5 text-center text-sm text-[#BE123C]">PDF를 표시하지 못했습니다. 위의 다운로드를 이용하거나 닫은 후 다시 시도해주세요.</p>}
    <div ref={container} />
  </div>
}
