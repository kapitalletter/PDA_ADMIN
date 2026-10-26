export const MAX_PDF_PAGES = 100
export const TOTAL_CANVAS_PIXELS = 8_000_000
export const PDF_DOCUMENT_OPTIONS = {
  isEvalSupported: false,
  enableXfa: false,
  useWasm: false,
  disableFontFace: true,
  useSystemFonts: false,
  maxImageSize: 8_000_000,
  canvasMaxAreaInBytes: 32_000_000,
  stopAtErrors: true,
} as const

export function assertPdfPageCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PDF_PAGES) throw new Error("PDF 페이지 수가 허용 범위를 초과했습니다.")
}

export function boundedPdfScale(width: number, height: number, desired: number, pageCount: number) {
  assertPdfPageCount(pageCount)
  if (![width, height, desired].every(Number.isFinite) || Math.min(width, height, desired) <= 0) throw new Error("PDF 페이지 크기가 올바르지 않습니다.")
  return Math.min(desired, 4096 / width, 4096 / height, Math.sqrt((TOTAL_CANVAS_PIXELS / pageCount) / (width * height)))
}
