# 연세대 PDA 관리자 프론트엔드

첨부된 관리자 백엔드 플로우를 기준으로 React 관리자 화면에 API 연결 계층을 추가한 프로젝트입니다. `AIP`는 문맥상 `API`로 해석했습니다.

## 반영한 플로우

### 시스템 관리자 (`ADMIN`)

- 로그인 후 시스템 관리자 메뉴 노출
- 의료기관 관리자 목록 조회·생성·활성/정지·삭제
- 기관별 고유번호 한도와 생성/사용 현황 조회
- 기관에 생성 한도 추가 부여

### 의료기관 관리자 (`STAFF`)

- 최초 로그인 시 비밀번호 변경 화면 강제 노출
- 소속 의사 목록 조회·등록
- 기관 잔여 한도 안에서 의사별 고유번호 일괄 발급
- 기관에 속한 응답 목록 및 제출 완료 스냅샷 상세 조회

화면 권한 분리는 편의를 위한 것이며 보안 경계가 아닙니다. 모든 API에서 백엔드가 JWT 역할과 `hospitalId`를 다시 검증해야 합니다.

## 실행 및 환경 설정

로컬 `.env`에 아래 공개 API 환경변수를 설정합니다. API 주소가 비어 있으면 같은 origin의 reverse proxy를 사용합니다. 운영 빌드는 HTTPS API만 허용하며, HTTP는 Vite 개발 모드에서만 허용합니다.

```env
VITE_API_BASE_URL=https://api.example.com
VITE_USE_MOCK_API=false
```

- `VITE_USE_MOCK_API=true`: 보안 개선 후 사용이 금지됩니다. 개발·운영 모두 실제 인증 API를 사용합니다.
- `VITE_USE_MOCK_API=false`: 모든 관리자 데이터를 실제 API로 요청
- 환경변수는 브라우저 번들에 포함되므로 비밀키를 넣지 않습니다.

## 현재 프론트가 호출하는 API 계약 예시

백엔드 OpenAPI 문서를 받지 못했기 때문에 아래 경로와 필드명은 첨부 플로우에 맞춘 **연동 예시 계약**입니다. 서버 계약이 다르면 화면 컴포넌트가 아니라 `src/lib/adminApi.ts`와 `src/lib/auth.ts`만 수정하면 됩니다.

| 기능                  | Method | Path                                                  | 주요 요청/응답                                                                                                                 |
| --------------------- | -----: | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 로그인                |   POST | `/manage/sign-in`                                     | `{ loginId, password }` → `accessToken`, `tokenType?`, `expiresIn`, `role: ADMIN \| STAFF`, `hospitalId`, `mustChangePassword` |
| 비밀번호 변경         |    PUT | `/manage/password`                                    | `{ currentPassword, newPassword }`                                                                                             |
| 기관 목록             |    GET | `/admin/staff?page=1&page_size=20&search=`            | `STAFF` 계정만 반환하는 `{ total, page, pageSize, items }`                                                                     |
| 기관 생성             |   POST | `/admin/staff`                                        | 기관 코드·기관명·담당자·연락처·로그인 이메일·8~64자 조합 정책을 만족하는 임시 비밀번호                                                            |
| 기관 수정/상태 변경   |  PATCH | `/admin/staff/{staff_id}`                             | 기관 코드·기관명·담당자·연락처·이메일·활성 상태·선택적 임시 비밀번호                                                           |
| 기관 삭제             | DELETE | `/admin/staff/{staff_id}`                             | 업무 이력이 없는 계정만 삭제, `{ message }` 반환                                                                               |
| 고유번호 할당 현황    |    GET | `/admin/codes`                                        | 전체 `total`과 기관별 `institutions`의 할당·생성·사용·잔여 수량                                                                |
| 한도 추가             |   POST | `/admin/staff/{staff_id}/quota`                       | `{ count }`을 전달해 해당 완화의료 계정의 생성 한도 추가                                                                       |
| 의사 목록             |    GET | `/staff/providers?is_active=true&page=1&page_size=20` | 의사·PDF 수신 이메일·발급/사용 PIN 수량 목록                                                                                   |
| 의사 등록             |   POST | `/manage/doctors`                                     | `{ name, department, email }`                                                                                                  |
| PIN 일괄 발급         |   POST | `/staff/code_batches`                                 | `{ count, providerId }` → 발급 PIN 목록, 잔여 한도, Excel 다운로드 경로                                                        |
| 통합 응답 결과 게시판 |    GET | `/staff/results?category=ALL&page=1&page_size=20`     | `stats`와 COMPLETED/UNUSED PIN 목록 조회                                                                                       |

목록 API는 배열, `{ items }`, `{ content }`, `{ data }` 형태를 받을 수 있게 처리했습니다. 오류 응답은 가능하면 아래 형태를 권장합니다.

```json
{
  "message": "할당 가능한 고유번호 한도를 초과했습니다.",
  "code": "QUOTA_EXCEEDED"
}
```

## 인증 처리

- 액세스 토큰은 메모리에만 보관하고 보호 API에 `Authorization: Bearer <token>`을 붙입니다. 브라우저 저장소와 쿠키로 세션을 복원하지 않으므로 새로고침하면 재로그인합니다.
- 서버 `expiresIn`과 프론트 최대 60분·유휴 15분 정책을 적용합니다. 로그인과 비밀번호 변경 뒤 `/manage/me`로 역할·기관·변경 필요 상태를 확인합니다. 비밀번호 변경 시 반환된 새 토큰으로 교체합니다.
- 보호 API에서 401이 오면 세션을 지우고 로그인 화면으로 이동합니다.
- `mustChangePassword=true`이면 다른 관리자 메뉴보다 비밀번호 변경을 먼저 요구합니다.
- 새 비밀번호는 서버와 동일한 8~64자·문자 종류·상용/반복 비밀번호 금지 정책을 검사하며, 서버가 최종 검증합니다.
- 로그아웃은 관리자 토큰도 지원하는 `POST /auth/sign-out`으로 서버 tokenVersion을 폐기한 뒤 브라우저 세션을 지웁니다. 같은 계정의 기존 토큰들이 함께 무효화됩니다.
- 점검표·상세 결과·운영 전달 사항은 저장소 밖 `D:/projects/PAD_ADMIN-security-final-2026-10-26`에 보관했습니다. 아래 TODO는 초기 연동 기록이며 최신 판단은 별도 점검 결과를 참고하세요.

## PDF 결과지 보안 표시

인증 API에서 받은 PDF 바이트를 동일 출처 PDF.js worker로 캔버스에 표시합니다. JS 평가·XFA·WASM을 비활성화하고, 최대 20 MiB·100페이지·전체 캔버스 800만 픽셀·30초를 제한합니다. 폰트와 CMap은 번들에 포함해 외부 CDN으로 환자 데이터를 보내지 않습니다. 다운로드 blob URL과 렌더러는 닫기/로그아웃 때 정리합니다. 운영 정적 서버에도 worker-src self, frame-src none, object-src none 등 CSP를 적용해야 합니다.

## TODO — 백엔드 담당자와 함께 해야 할 작업

- [x] **계정 API 경로/DTO:** 로그인, `GET/POST /admin/staff`, `PATCH/DELETE /admin/staff/{staff_id}` 명세 반영 완료
- [x] **고유번호 한도 부여:** `POST /admin/staff/{staff_id}/quota`와 한도 부여 UI를 연결. 삭제/수정과 마찬가지로 서버에서 관리자 권한과 수량 유효성을 검증
- [ ] **의사 관리 보조 기능:** 회원가입 QR 발급, 의사별 미사용 PIN Excel 다운로드, 의사 수정 API 명세가 필요합니다. 현재 화면에는 해당 조작 버튼만 표시합니다.
- [x] **의사 PIN 일괄 발급:** `POST /staff/code_batches`와 발급 완료·Excel 다운로드 팝업을 연결. 한도 초과는 백엔드 422 응답으로 처리
- [x] **로그인 역할명 확정:** 로그인 API 명세에 따라 `ADMIN`은 시스템 관리자, `STAFF`는 의료기관 관리자로 매핑. 허용 역할 외에는 서버에서 403 반환 필요
- [ ] **기관 스코프 강제:** 의료기관 관리자의 요청에서 클라이언트가 보낸 기관 ID를 신뢰하지 말고 JWT의 `hospitalId`로 의사·PIN·응답 범위를 제한
- [ ] **초기 비밀번호:** 기관 관리자 생성 시 임시 비밀번호 생성/해시 저장/안전한 전달, `mustChangePassword` 설정, 변경 성공 시 해제. 현재 프론트 경로 `/manage/password` 확인 필요
- [x] **기관 관리자 수정/비밀번호 초기화:** `PATCH /admin/staff/{staff_id}`를 수정 모달에 연결. 임시 비밀번호는 빈 값이면 전송하지 않고, 입력하면 백엔드의 `mustChangePassword` 정책을 따름
- [ ] **기관 생성 원자성:** 기관·관리자 계정 생성과 초기 상태 저장을 하나의 트랜잭션으로 처리하고 중복 `loginId`는 409 반환
- [ ] **한도 증가 원자성:** 누적값(`codeQuotaAllocated`) 갱신 시 DB row lock 또는 원자 update를 사용하고 음수/초과/중복 요청 방지. 가능하면 idempotency key 지원
- [ ] **PIN 생성 보안:** 예측 불가능한 난수, 유일 인덱스, 발급 배치 이력, 생성자/기관/의사 매핑, 만료 및 폐기 정책 구현
- [ ] **메일 발송:** PIN 생성 DB 트랜잭션과 이메일 발송을 분리(outbox/queue 권장)하고 재시도·실패 상태를 API에 노출
- [ ] **응답 불변성:** 최종 제출 시 `SUBMITTED` 상태와 snapshot을 트랜잭션으로 저장하고 이후 초안 변경이 제출 결과를 바꾸지 않도록 보장
- [ ] **응답 상세 DTO:** 현재 프론트 상세 모달은 계약 미정이라 JSON을 그대로 표시함. 환자 식별정보 최소화 필드가 확정되면 전용 읽기 화면으로 변경
- [ ] **PDF 결과지 조회:** `GET /staff/results`의 `resultAvailable` 표시는 반영 완료. 실제 PDF 다운로드/미리보기 URL을 반환하는 API 명세가 필요
- [ ] **페이지네이션/검색:** 기관·의사·응답 목록의 서버 페이지네이션, 정렬, 검색 파라미터 확정. 현재 기관 검색은 받아온 페이지 안에서만 수행
- [ ] **토큰 갱신:** 장시간 관리자 작업이 필요하면 refresh token을 HttpOnly/Secure/SameSite 쿠키로 발급하고 재발급 API 연결. 현재는 access token 만료 시 재로그인
- [ ] **감사 로그:** 계정 생성/수정/정지/삭제, 한도 부여, PIN 발급, 응답 열람을 수행자·시간·대상·변경 전후 값과 함께 기록
- [ ] **CORS/HTTPS:** 운영 프론트 origin만 허용하고 HTTPS 강제. 에러에 스택/DB 정보가 노출되지 않게 표준 오류 포맷 적용
- [ ] **삭제 정책:** 실제 삭제와 비활성화/soft delete 중 정책 확정. 응답·발급 이력이 있는 기관 계정의 삭제 가능 조건을 서버에서 검증
- [ ] **테스트:** 역할별 403, 타 기관 데이터 접근 차단, 동시 한도 발급, 중복 PIN, 이메일 실패, 제출 snapshot 불변성에 대한 통합 테스트 추가

## TODO — 프론트/운영에서 해야 할 작업

- [ ] 실제 API 서버 주소를 배포 환경의 `VITE_API_BASE_URL`에 설정하고 `VITE_USE_MOCK_API` 제거 또는 `false` 지정
- [ ] 백엔드 필드가 현재 UI 모델(`org`, `manager`, `quota`, `issued` 등)과 다르면 API 어댑터에서 변환
- [ ] 서버의 비밀번호 정책(길이, 조합, 재사용 금지)을 받아 변경 화면의 안내와 검증 동기화
- [ ] 응답 상세 DTO 확정 후 JSON 임시 뷰를 임상 항목별 전용 UI로 교체하고 출력/다운로드 권한 결정
- [ ] 의료기관 명칭을 로그인 응답 또는 `/manage/me`에서 받아 상단의 하드코딩된 기관명 교체
- [ ] 접근성/브라우저/모바일 회귀 테스트 및 운영 오류 모니터링(Sentry 등) 연결

## 주요 파일

- `src/lib/apiClient.ts`: 공통 fetch, 인증 헤더, 오류/401 처리
- `src/lib/auth.ts`: 로그인, 세션 저장/복원, 비밀번호 변경
- `src/lib/adminApi.ts`: 관리자 도메인 API 어댑터와 선택적 mock
- `src/views/*`: API 결과를 표시하고 사용자 작업을 요청으로 연결
