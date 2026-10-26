export function positiveInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9][0-9]*$/.test(String(value))) {
    throw new Error("양의 정수를 입력해주세요.")
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result > max) throw new Error(`입력 범위(1~${max})를 확인해주세요.`)
  return result
}

export function boundedText(value: unknown, max = 60): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`입력값을 ${max}자 이내로 확인해주세요.`)
  }
  return value.trim()
}

export function email(value: string): string {
  const result = boundedText(value).toLowerCase()
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(result)) {
    throw new Error("올바른 이메일을 입력해주세요.")
  }
  return result
}

export function passwordPolicy(value: string): string {
  const size = [...value].length
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (size < 8 || size > 64 || /[\u0000-\u001f\u007f]/.test(value) || !value.trim() || /^(.)\1{7,}$/u.test(value)
      || ["password123", "password1234", "qwerty123456", "123456789012", "012345678901"].includes(normalized)
      || kinds < (size < 10 ? 3 : 2)) {
    throw new Error("비밀번호는 8~64자로, 8~9자는 3종류·10자 이상은 2종류 이상을 조합해주세요.")
  }
  return value
}

export function safeApiBase(raw: string, development: boolean): string {
  if (!raw) return "" // same-origin reverse proxy
  const url = new URL(raw)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(development && url.protocol === "http:"))) {
    throw new Error("API는 HTTPS 주소로 설정해주세요. 로컬 HTTP는 개발 모드에서만 허용됩니다.")
  }
  return url.href.replace(/\/$/, "")
}

export function safePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f#]/.test(path)) throw new Error("허용되지 않은 API 경로입니다.")
  const pathname = path.split("?")[0]
  let decoded = pathname
  for (let i = 0; i < 3; i++) {
    const next = decodeURIComponent(decoded)
    if (next === decoded) break
    decoded = next
  }
  if (/%|[\\\u0000-\u0020\u007f?#]/.test(decoded) || decoded.startsWith("//") || decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("허용되지 않은 API 경로입니다.")
  }
  return path
}

export type DownloadKind = "pdf" | "xlsx" | "png"
export async function validateDownload(blob: Blob, kind: DownloadKind): Promise<Blob> {
  const types = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", png: "image/png" }
  const signature = { pdf: [37, 80, 68, 70, 45], xlsx: [80, 75, 3, 4], png: [137, 80, 78, 71, 13, 10, 26, 10] }
  const prefix = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  if (!blob.size || blob.type.split(";")[0].toLowerCase() !== types[kind] || !signature[kind].every((byte, i) => prefix[i] === byte)) {
    throw new Error("다운로드 파일 형식이 올바르지 않습니다.")
  }
  // This is MIME/signature validation, not a PDF/ZIP malware scanner; server must sanitize files.
  return blob
}
