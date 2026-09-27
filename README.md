# 온맘(Onmom) 웹

출산 후 퇴원부터 산후 6주 검진까지 산모의 회복을 돕는 iOS 앱 **온맘**을 같은 기능의 웹으로 옮기는 저장소입니다.
정적 사이트(Next.js `output: "export"`)로 빌드해 GitHub Pages에 배포합니다. 서버 코드·API 라우트는 없습니다.

- 판정(레드플래그·주차 게이팅·금기·기분 신호)은 전부 **규칙**이 합니다. LLM은 판정 경로에 없습니다.
- 정답 순서: ① iOS 원본 Swift(로직과 문구 모두) → ② `src/content/content.json`(Swift에서 추출한 문구·규칙 값) → ③ 인수인계 문서.
  iOS 원본과 인수인계 문서(`web/`)·검수 결과(`docs/private/`)는 내부 자료라 **공개 저장소에 올리지 않습니다**(`.gitignore`). 필요한 사람은 팀에 요청하세요.
- 절대 원칙 5개: ① 의료기기가 아니다(진단·점수·등급 없음) ② 판정은 규칙이 한다(LLM은 판정 경로 밖) ③ 가짜 데이터 없음(없으면 없다고, 서버 없으면 "준비 중") ④ 임상 문구에 출처 칩, 출처를 지어내지 않음 ⑤ 사용자 문구는 원문 그대로(바꾸려면 CPO).
- 의도적으로 iOS와 다르게 한 것과 결정이 필요한 것은 [docs/DEV_NOTES.md](docs/DEV_NOTES.md)에 모았습니다.

## 지금 상태

| 층 | 상태 |
|---|---|
| 규칙 엔진 `src/rules` | 레드플래그·기록·체중·운동 게이팅·회복 분석·기분·약물·챗 폴백·지원사업. 테스트 포함 |
| 앱 상태 `src/store` | 브라우저 localStorage 저장 + 계정 귀속 규칙. 루트 레이아웃에 연결됨 |
| 공용 UI `src/components/ui` | 카드·버튼·토글·슬라이더·배지·칩·레드플래그 카드 등. 카탈로그: `/dev/components` |
| 외부 연동 `src/api` | 영상 DB·LLM·카카오 지도 클라이언트. 서버 주소가 비면 "준비 중" |
| 화면 `src/app` | 라우트만 있고 내용은 자리표시(`ScreenPlaceholder`). 하나씩 구현할 차례 |

## 폴더 구조

```
src/
├── rules/          순수 규칙 엔진(React·DOM·fetch·현재 시각 없음 — now를 인자로 받는다) + *.test.ts
├── store/          앱 상태: 순수 전이(state.ts) · 저장 JSON 해석(decode.ts) · 스토어 · React 훅(useAppStore)
├── components/
│   ├── ui/         공용 컴포넌트와 순수 헬퍼
│   └── TabBar.tsx  하단 탭 5개
├── api/            영상 DB·LLM·카카오 지도 클라이언트(실패는 결과 값으로 돌려준다) — README.md 참고
├── content/        content.json(iOS에서 추출한 문구·규칙 값)을 그대로 import(`import content from "@/content"`)
├── domain/         저장 타입(types.ts)과 로컬 달력 날짜 계산(date.ts)
├── app/            화면(App Router). (tabs)/ = 하단 탭이 있는 화면
└── config.ts       서버 주소·공개 키(NEXT_PUBLIC_*)를 읽는 유일한 곳
docs/DEV_NOTES.md   개발 메모 — iOS와 다르게 한 것, 결정이 필요한 것, 화면 연결 규칙
(web/, docs/private/  내부 자료 — 로컬에만 두고 저장소에 올리지 않음)
.github/workflows/  GitHub Pages 배포
```

## 명령어

Node 24 권장(배포 워크플로와 같은 버전). 처음 한 번 `npm ci`.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm test` | 단위 테스트(Vitest, 시간대는 Asia/Seoul로 고정) |
| `npm run typecheck` | 라우트 타입 생성 + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | 정적 빌드 → `out/` |
| `BASE_PATH=/onmom_web npm run build` | GitHub Pages 프로젝트 주소(하위 경로)용 빌드 |

빌드 결과 미리 보기: `python3 -m http.server -d out 8000` (BASE_PATH 없이 빌드한 경우).
하위 경로 빌드는 `mkdir -p /tmp/site && ln -sfn "$PWD/out" /tmp/site/onmom_web && python3 -m http.server -d /tmp/site 8000` 후
http://localhost:8000/onmom_web/ 로 확인합니다.

## 환경 변수

`.env.example`을 `.env.local`로 복사해 씁니다. 값이 비면 그 기능은 "준비 중"으로 표시되고, 규칙 기능(기록·분석·가이드·지원사업·기분)은 그대로 동작합니다.

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_VIDEO_URL` | 운동 영상 DB (`GET /videos`) |
| `NEXT_PUBLIC_LLM_URL` | AI 상담·약물 체크 미등재 항목 (`POST /chat`) — 미배포 |
| `NEXT_PUBLIC_ACCOUNT_URL` | 계정 API — 미구현. 서버 세션이 생기기 전에는 켜지 않는다 |
| `NEXT_PUBLIC_ONMOM_APP_KEY` | `x-onmom-key` 헤더. 백엔드에 CORS가 들어가기 전에는 비워 둔다(설정하면 GET도 preflight를 타서 405로 막힌다) |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 지도 JS 키(가까운 산부인과). 카카오 개발자 콘솔에서 사이트 도메인 제한 |

> ⚠️ **`NEXT_PUBLIC_*`는 전부 공개값입니다.** 정적 사이트 번들에 그대로 들어가 누구나 읽을 수 있습니다.
> 카카오 REST 키·client secret·Anthropic 키·관리자 키 같은 비밀은 절대 넣지 않습니다. 비밀은 백엔드가 보유합니다.

## GitHub Pages 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 타입 검사 → 테스트 → 정적 빌드 → Pages 배포를 합니다.

1. 저장소 **Settings → Pages → Build and deployment → Source: "GitHub Actions"** 로 한 번 설정합니다.
2. **Settings → Secrets and variables → Actions → Variables** 탭에 `NEXT_PUBLIC_*` 값을 넣습니다
   (공개값이므로 Secrets가 아니라 Variables. 빈 변수는 "준비 중"이 됩니다).
3. push 후 Actions 탭에서 배포를 확인합니다. 주소는 `https://5seoyoung.github.io/onmom_web/`.
   하위 경로(`BASE_PATH`)는 워크플로가 `actions/configure-pages`에서 받아 자동으로 넣습니다.
4. 이 저장소는 무료 Pages를 쓰기 위해 **공개 저장소**입니다. 내부 자료·비밀은 절대 커밋하지 않습니다(`.gitignore`의 `/web/`, `/docs/private/`, `.env*`).

### 도메인을 산 뒤

1. DNS에 레코드 추가: 서브도메인(`www` 등)은 `CNAME → 5seoyoung.github.io`,
   루트 도메인은 A 레코드 4개 `185.199.108.153` · `185.199.109.153` · `185.199.110.153` · `185.199.111.153`.
2. **Settings → Pages → Custom domain**에 도메인 입력 → DNS 확인 후 **Enforce HTTPS** 체크.
   GitHub Actions로 배포하므로 `CNAME` 파일은 필요 없습니다(설정 화면이 기준). 계정 설정에서 도메인 소유 인증(verify)도 해 두면 탈취를 막습니다.
3. 워크플로를 다시 실행하면 `BASE_PATH`가 `""`가 되어 루트 경로로 빌드됩니다.
4. 도메인이 바뀌면 함께 바꿀 것: 카카오 개발자 콘솔의 사이트 도메인, 백엔드 CORS 허용 origin.

## 정적 호스팅으로는 못 하는 것 → 백엔드가 필요

GitHub Pages는 파일만 내려줍니다. 비밀 키를 쓰거나 여러 사람의 데이터를 모으는 일은 브라우저에서 안전하게 할 수 없습니다.

| 기능 | 왜 서버가 필요한가 |
|---|---|
| 카카오 로그인 | code → token 교환에 REST 키·client secret이 필요하고, 로그인 CSRF를 막는 `state` 검증도 서버(HttpOnly 쿠키)에서 해야 함 |
| 계정·서버 저장(여러 기기 동기화) | 사용자별 세션 인증이 필요. 공개 앱 키 + user_id만으로는 누구나 남의 데이터를 읽고 덮을 수 있음 |
| 관리자 페이지·데이터 관리 | 관리자 인증과 전체 사용자 데이터 접근은 서버에서만. 정적 페이지에 관리자 키를 넣을 수 없음 |
| LLM(AI 상담·약물 미등재 항목) | Anthropic 키와 시스템 프롬프트(임상 가드레일)는 서버가 보유하는 프록시로만 |
| 영상 DB·LLM·계정 API 호출 | 백엔드에 CORS(웹 origin 허용, OPTIONS 처리)가 먼저 들어가야 브라우저에서 호출 가능 |

그 전까지 데이터는 **이 브라우저에만** 저장되고(localStorage, 키 접두 `onmom.web.`), 로그인은 게스트 모드만 동작합니다.
