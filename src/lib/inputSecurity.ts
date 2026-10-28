export const TEXT_LIMIT = 60;
export const NUMBER_LIMIT = 15;

const unsafeText = /[<>\u0000-\u001f\u007f]/;

export function plainText(value: unknown, label: string, maxLength = TEXT_LIMIT, required = true): string {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label}을(를) 입력해주세요.`);
  if (text.length > maxLength) throw new Error(`${label}은(는) ${maxLength}자 이하로 입력해주세요.`);
  if (unsafeText.test(text)) throw new Error(`${label}에 사용할 수 없는 문자가 포함되어 있습니다.`);
  return text;
}

export function phoneNumber(value: unknown): string {
  const phone = plainText(value, "연락처", NUMBER_LIMIT);
  if (!/^[0-9+() -]+$/.test(phone)) throw new Error("연락처 형식을 확인해주세요.");
  return phone;
}

export function hospitalCode(value: unknown, required = true): string {
  const code = plainText(value, "의료기관 코드", 2, required);
  if (code && !/^[0-9]{2}$/.test(code)) throw new Error("의료기관 코드는 숫자 두 자리여야 합니다.");
  return code;
}

export function positiveCount(value: unknown, label: string): number {
  const text = String(value ?? "").trim();
  if (!/^[0-9]{1,15}$/.test(text)) throw new Error(`${label}은(는) 15자리 이하의 양수로 입력해주세요.`);
  const count = Number(text);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${label}을(를) 확인해주세요.`);
  return count;
}
