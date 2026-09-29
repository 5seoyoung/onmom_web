# 접근성·복원력 점검 (2026-09-29)

기준: `web/08_OPEN_ITEMS.md` §4 완료 기준(글씨 150%에서 깨지지 않음)·§2 접근성(rem + 확대 존중, 포커스 링, 라벨 — 필수), `web/06_DESIGN.md` §5(포커스 링·라벨·44px 터치 영역·색만으로 알리지 않기), WCAG 2.2 AA 중 글자 대비 1.4.3·비텍스트 대비 1.4.11·확대 1.4.4·초점 2.4.7·이름 4.1.2.
무엇을 어떻게 확인했고, 무엇을 고쳤고, 무엇이 남았는지 적습니다. 화면(기능 폴더) 쪽에서 고쳐야 할 것은 §6에 파일·줄로 모았습니다.

## 0. 한눈에

| 항목 | 결과 |
|---|---|
| 글자 150%(폰·PC)·브라우저 확대 150%(폰·PC) 41개 화면 상태 × 4 = 138 캡처 | **가로 넘침 0**, 겹침 0, 이름 없는 컨트롤 0. 잘림·작은 영역 6건 — 모두 기능 폴더(§6), 공용 컴포넌트·껍데기 없음 |
| 키보드 전용(PC·폰) | 탭 순서·포커스 링·본문 바로가기·화면 전환 뒤 초점·확인 창 가두기/되돌리기·스위치 Space/Enter·슬라이더 화살표·제목 순서 모두 통과 |
| 색 대비 | 글자 전용 토큰 5개를 두고 공용 컴포넌트에 적용 — 모두 AA 4.5:1 이상(§4). 기능 폴더의 원색 글자 39곳·코랄 위 흰 글씨·코랄 포커스 표시 5곳은 §6, 결정이 필요한 것(레드플래그 카드·흰 글씨/코랄·스위치 꺼짐 트랙)은 §4 CPO 12 |
| 움직임 줄이기·대비 높이기 | 전역 규칙(`globals.css`) |
| 오류 화면 | `not-found.tsx`·`error.tsx`·`global-error.tsx` — 한국어, [다시 시도], 오류 내용 로그 금지. 정적 내보내기에서 `out/404.html` 확인 |
| 실기기(VoiceOver·TalkBack·NVDA) | **아직** — §7에 확인할 항목과 방법 |

## 1. 확인 방법

### 1-1. 글자 150% · 브라우저 확대 150% (헤드리스 Chrome)
- 도구: Playwright(`chromium.launch({ channel: "chrome" })`)로 `next dev` 사본(저장소 밖)을 열어 캡처. 스크립트·시드(온보딩을 마친 게스트 상태를 `localStorage`에 넣음)는 저장소 밖 — 배포물에는 아무것도 들어가지 않습니다.
- iOS 시스템 설정 "더 큰 텍스트"(Dynamic Type)는 `font: -apple-system-body`를 쓰는 웹 페이지에만 적용됩니다. 이 서비스는 Pretendard를 16px 루트의 rem으로 쓰므로 그 설정으로는 **바뀌지 않습니다** — iOS에서는 Safari aA 글자 크기로 확인합니다(§7). 시스템 설정까지 따르려면 `html { font: -apple-system-body; }` + 글꼴 재지정이 필요하고, 이는 디자인·CPO 결정입니다.
- 네 가지 모드. 미디어쿼리(`lg` 등)는 `rem`이지만 **초기 글자 크기(16px) 기준**이라 글자 150%에서도 폰/PC 레이아웃은 그대로입니다(CSS 명세).

| 모드 | 뜻 | 설정 |
|---|---|---|
| phone150 | root font-size 150% (Android Chrome 설정 > 접근성 > 글자 크기·iOS Safari 주소창 aA 글자 크기·데스크톱 기본 글꼴 크기에 해당) | 402×874, dsf 2, `document.documentElement.style.fontSize = "150%"` |
| phoneZoom | 폰 브라우저 확대 150% | 뷰포트 268×583(=402/1.5), dsf 3 |
| pc150 | PC 글자 150% | 1440×900, `fontSize = "150%"` |
| pcZoom | PC 브라우저 확대 150% | 뷰포트 960×600(=1440/1.5), dsf 1.5 |

- 화면 상태 41개: 서비스 소개, 로그인(+처리방침 시트), 온보딩 4단계, 처리방침, 홈 3종(기록 없음·레드플래그·마음 카드), 운동 2종, 기록(폼·레드플래그 결과), 분석(폼·결과), 기록장(빈 상태·목록·글쓰기·글 상세), 프로필, 설정(+계정 삭제 창), 프로필 편집, 가이드, 생활, 지원사업(추천 결과), 약물 체크(코데인), AI 상담(질문 1개), 지역 연계, 관리자, 404(로그인 전·후), 오류 경계(로컬 전용 throw 페이지).
- 캡처마다 맨 위·전체·맨 아래 스크린샷 + 자동 검사: 문서 가로 넘침(`scrollWidth − clientWidth`), 뷰포트 오른쪽 밖 요소, `overflow:hidden`·`text-overflow:ellipsis` 안에서 잘린 글자, 세로 잘림, 글자 상자끼리 25% 이상 겹침, 44×44 미만 컨트롤, 고정/붙는 막대가 본문 마지막 요소를 가리는지(맨 아래로 스크롤한 상태), CDP `Accessibility.getFullAXTree`에서 이름 없는 링크·버튼·입력·스위치·라디오·슬라이더, 콘솔 오류.
- 스크린샷을 눈으로도 봤습니다(폰 150% 전 화면, PC 150%·확대 대표 화면).

### 1-2. 키보드 전용(PC 1440×900 · 폰 402×874)
Tab만으로 홈 14회 이동(순서·보이는 포커스 링·화면 밖 여부), PC 본문 바로가기(첫 Tab에 보이고 Enter로 `#app-content`), 사이드바/탭바 링크로 화면 이동 뒤 초점 위치와 라우트 안내(`next-route-announcer`), 기록의 스위치 Space/Enter 토글과 NRS 슬라이더 화살표(`aria-valuetext`), [확인하기] 뒤 결과 카드로 초점, 계정 삭제 창(열릴 때 [취소]에 초점, Tab 순환이 창 안, Esc → 창 닫힘 + 원래 버튼으로 초점), 로그인 처리방침 시트(같은 검사 + `body` 스크롤 복원), 온보딩 [시작하기] 뒤 h1 초점·라디오 화살표 이동, 17개 화면의 `<title>`·h1 수·제목 건너뜀·`<main>` 수·`<nav>` 이름·`alt` 없는 이미지·이름 없는 아이콘 버튼.

### 1-3. 자동 검사(저장소 안, `npm test`)
- `src/components/shell/a11y.test.ts` — 오류 경계 3파일(클라이언트 경계·`retry`·한국어·`ROUTES`·오류 내용 로그 금지, 오류 화면이 뜨면 h1(tabIndex −1)로 초점), `globals.css`(움직임 줄이기 전역, 포커스 링 base 층 + 토큰, `text-size-adjust`, px 고정 글자 없음), 루트 `viewport`에 `maximumScale`·`userScalable=false` 없음, 껍데기(본문 바로가기·`RouteFocus`), `components/ui`·`components/shell`·`app`의 글자 상자에 고정 높이(`h-숫자`·`h-[…]`) 금지.
- `src/components/ui/contrast.test.ts` — `globals.css` `@theme` 토큰을 WCAG 상대 휘도로 계산: 글자 전용 토큰이 실제 배경(흰 표면·background·coral-tint·divider·배지 12%/15%·출처 칩 10%) 위에서 4.5:1, 포커스 링 3:1(어두운 면 `bg-neutral` 안에서는 surface 링 — 규칙이 있는지까지), 원색과 같은 색상(hue)인지, 공용 컴포넌트가 글자에 원색 클래스를 쓰지 않는지. iOS 원색이 못 미친다는 사실은 `it.fails`로 고정 — 원색이 바뀌어 통과하면 그 검사가 실패하니 그때 토큰을 거둘 수 있습니다.
- `src/components/ui/components.test.ts` — 배지·칩의 토큰 클래스.

### 1-4. 정적 내보내기(저장소 밖 사본에서 `BASE_PATH=/onmom_web next build`)
`/_not-found` 포함 26개 경로 생성. `out/404.html`: `<title>페이지를 찾을 수 없어요</title>`, `<html lang="ko">`, `robots noindex`, Next 기본 영어 문구 없음. 본문(제목·[홈으로]·[서비스 소개 보기])은 하이드레이션 뒤에 그려집니다 — 앱 관문(`features/flow/gate.ts`)이 모르는 주소를 main으로 보므로 로그인 전이면 `/login/`으로 옮겨지고, 스크립트 없는 방문자(크롤러)는 제목만 있는 빈 본문을 봅니다(DEV_NOTES §4 설계 그대로, noindex). 오류 화면 문구는 클라이언트 청크에 들어 있습니다.

## 2. 고친 것 (공용 — `src/app/globals.css`, `components/ui`, `components/shell`, `src/app/{not-found,error,global-error}.tsx`)

| 무엇 | 어디 | 내용 |
|---|---|---|
| 포커스 링 | `globals.css` `@layer base :focus-visible` | 코랄(흰 배경 2.76:1, 비텍스트 3:1 미달) → `--color-focus-ring`(neutral #191F28, 흰 배경 16.6:1·코랄 버튼 위 6.0:1). base 층에 두어 `focus:outline-none`(초점만 옮기는 상자)이 유틸리티로 덮을 수 있게 |
| 어두운 면 안의 포커스 링 | `globals.css` `@layer base .bg-neutral :focus-visible` | neutral 링이 neutral 카드(랜딩 마지막 CTA의 흰 [시작하기]) 위에서 1:1로 사라짐 → 어두운 면 안에서는 `--color-surface` 링(16.56:1). 자손 선택자라 neutral 주 버튼 자신은 그대로 neutral 링(밝은 페이지 위). 헤드리스 Chrome 폰·PC에서 링 `rgb(255,255,255)`, 초점 전후 캡처가 달라짐을 확인 |
| 대비 높이기 | `globals.css` `@media (prefers-contrast: more)` | 링 3px |
| 움직임 줄이기 | `globals.css` `@media (prefers-reduced-motion: reduce)` | 모든 애니메이션·전환 0.01ms, `scroll-behavior: auto`(Tailwind `motion-reduce:` 클래스가 없는 곳·네이티브 `<details>`·라우터 스크롤 포함) |
| 글자 전용 색 토큰 | `globals.css` `@theme` | `state-normal-text` #0C7449 · `state-watch-text` #9A5B00 · `state-alert-text` #BF3636 · `primary-text` #BF3636 · `text-subtle-aa` #646E7B. 원색은 아이콘·배경·테두리·로고에 그대로. 되돌리려면 이 다섯 값만 원색으로 바꾸면 됩니다(CPO 12 결정 전 기본값) |
| 배지·칩·값·활성 메뉴 글자 | `StatusBadge`·`EvidenceChip`·`NrsSlider`·`SideNav`(활성 항목)·`MeasurementField`(placeholder) | 위 토큰 적용 |
| 라디오 행 포커스 | `SelectableRow` | `has-focus-visible:outline-focus-ring` |
| 본문 바로가기 | `AppShell` | PC(lg 이상)만 — 폰·태블릿은 탭바가 본문 **뒤**(DOM 순서)라 건너뛸 것이 없어 첫 Tab이 곧 본문의 첫 컨트롤 |
| 화면 전환 뒤 초점 | `components/shell/RouteFocus.tsx` | Next 앱 라우터는 이동 뒤 초점을 메뉴 링크에 남기므로, pathname이 바뀌면 `#app-content`(tabIndex −1)로 옮김. 화면이 스스로 초점을 정했으면(초점이 body·nav 밖) 건드리지 않음. 라우트 안내는 Next의 route announcer가 새 제목을 읽음(확인: "오늘의 운동") |
| 404 | `src/app/not-found.tsx` | 서버 컴포넌트, `CardColumn`, 로고 + 제목 + 한 줄 + [홈으로](`ROUTES.home`) [서비스 소개 보기](`ROUTES.landing`), `metadata.title`·`robots noindex` |
| 오류 경계 | `src/app/error.tsx`·`global-error.tsx` → `components/shell/ErrorScreen.tsx` | 제목 "문제가 생겼어요", 본문 한 줄, [다시 시도]=`retry()`(Next 16), [홈으로]=`<a href>`(라우터 문맥 없이도 동작). `error` 인자는 화면·콘솔 어디에도 내지 않음. 나타나면 초점을 제목 h1(tabIndex −1, 링 없음)으로 옮김 — 누르던 버튼이 사라져 초점이 `<body>`로 떨어지고 스크린리더가 아무것도 읽지 않던 문제(정적 내보내기 폰·PC에서 throw 뒤 `activeElement` = H1 "문제가 생겼어요", 다음 Tab = [다시 시도] 확인). `global-error`는 `<html lang="ko">`·`<body>`·전역 CSS·글꼴을 스스로 갖춤 |

## 3. 확인 결과 — 글자 150% · 확대 150%

138 캡처 중 가로 넘침 0, 요소 오른쪽 넘침 0, 글자 겹침 0, 붙는 막대(탭바·온보딩 아래 버튼·AI 상담 입력창)가 본문 마지막 요소를 가리는 경우 0, 이름 없는 컨트롤 0, 콘솔 오류 0(오류 경계 테스트 페이지의 의도된 throw만).
검사가 표시한 것과 판단:

| 표시 | 어디 | 판단 |
|---|---|---|
| 잘림 `H1.lg:sr-only "온맘"` (PC 홈) | `features/home` 숨긴 h1 | 스크린리더 전용 상자 — 정상 |
| 잘림 `DIV.max-w-[26rem] overflow-hidden` (서비스 소개 히어로) | `features/landing` | 장식 원(absolute)이 상자 밖 — 글자는 온전(스크린샷 확인) |
| 잘림 `H3.truncate` 글 제목 (기록장 목록) | `features/journal/JournalScreen.tsx:102` | 말줄임 — 150%에서 제목이 더 빨리 잘림. `line-clamp-2` 권장(§6) |
| 잘림 `SPAN.truncate` 문의 이메일 (설정) | `features/settings/SettingsScreen.tsx:336` | 말줄임 — `break-all` 권장(§6) |
| 작은 영역 `A 36×66 "문의"` (서비스 소개 바닥글) | `features/landing/LandingPage.tsx` 바닥글 링크 | 높이는 44 이상, 폭 36 — 좌우 패딩 권장(§6) |
| 작은 영역 `A 76×34 "글쓰기"` (기록장) | `features/journal/JournalScreen.tsx:44` 캡슐 | 높이 34 — `min-h-11`(§6) |
| 작은 영역 탭바 링크 42×56 (phoneZoom만) | `components/TabBar.tsx` | 확대 150%에서 CSS 폭이 268이라 5칸이 42 CSS px — 물리 크기는 63px(확대 전 68×56과 같음). 정상 |

스크린샷으로만 보이는 것(검사에 안 걸림):
- **온보딩 출산일·복직 예정일·분석 폼 출산일 줄**: 폰 150%에서 `<input type="date">`가 폭을 차지해 왼쪽 라벨·안내("날짜를 눌러 선택해주세요")가 한 줄에 1~2글자로 세로로 늘어짐. `features/onboarding/OnboardingSteps.tsx:95,176`, `features/analyze/AnalyzeForm.tsx` 같은 구조 — `flex-wrap`(라벨 묶음 `basis-full`) 또는 `flex-col` 권장(§6).
- **서비스 소개 머리**: 폰 150%에서 "온맘" 워드마크가 두 줄("온/맘")로 꺾임 — `features/landing/LandingPage.tsx:122` `h-16`(고정 높이) + 워드마크에 `whitespace-nowrap` 없음(§6).
- 홈 "아직 기록이 없어요"가 폰 150%에서 세 줄(단어마다) — 아이콘 원·화살표 사이 글줄이 좁음. 읽히므로 그대로 두되 `features/home`에서 아이콘을 위로 올리는 것도 방법.
- 그 밖(AI 상담 `h-dvh` 기둥·`max-h-32` 입력창, 배지 `whitespace-nowrap`, PC 사이드바 16rem, 확인 창 `max-w-[26rem]`, 지도 자리 13.75rem)은 150%·확대 150%에서 잘리거나 겹치지 않았습니다.

## 4. 색 대비 (`globals.css` 토큰, WCAG 상대 휘도 — `contrast.test.ts`가 같은 값을 잽니다)

| 글자 | 배경 | 대비 |
|---|---|---|
| state-watch 원색 `#ffb020` | surface `#ffffff` | 1.83:1 ✗ |
| **state-watch-text** `#9a5b00` | surface | 5.43:1 |
| **state-watch-text** | 배지 12% `#fff6e4` | 5.05:1 |
| state-normal 원색 `#15c47e` | 배지 12% `#e3f8f0` | 2.05:1 ✗ |
| **state-normal-text** `#0c7449` | 배지 12% / surface | 5.25 / 5.82:1 |
| state-alert·primary 원색 `#fb6f6f` | 배지 12% `#ffeeee` / 출처 칩 10% `#fff1f1` / coral-tint / surface | 2.46 / 2.51 / 2.49 / 2.76:1 ✗ |
| **state-alert-text = primary-text** `#bf3636` | 배지 12% / 출처 칩 10% / coral-tint / surface | 4.93 / 5.03 / 5.00 / 5.53:1 |
| text-subtle 원색 `#8b95a1` | surface | 3.04:1 ✗ |
| **text-subtle-aa** `#646e7b` | surface / background | 5.17 / 4.95:1 |
| text-secondary `#4e5968` | surface / background | 7.11 / 6.81:1 |
| 흰 글씨 | neutral 주 버튼 `#191f28` | 16.56:1 |
| 흰 글씨 | state-alert 레드플래그 카드 `#fb6f6f` | **2.76:1 ✗** — 18px bold(큰 글씨 3:1)도 못 미침. iOS 원본 그대로 둠. CPO 12 결정: 카드를 `#E85D5D` 정도로 짙게 하면 3.4:1(큰 글씨 통과), 4.5:1은 `#D24444` 이하 |
| 포커스 링 `#191f28`(비텍스트 3:1) | surface / 코랄 버튼 | 16.56 / 6.00:1 |
| 포커스 링 `#191f28` | neutral 카드 `#191f28`(랜딩 마지막 CTA) | **1.00:1 ✗ → 어두운 면 안에서는 surface 링** `#ffffff` 16.56:1 (`globals.css` `.bg-neutral :focus-visible`) |
| 옛 링 코랄 | surface | 2.76:1 ✗ |
| 코랄 포커스 표시 `outline-primary`(기능 폴더 5곳, §6) | surface / background | 2.76 / 2.64:1 ✗ |
| 탭바(폰) 활성 라벨 `text-primary` 11px | divider `#f2f4f6` | **2.50:1 ✗** — `components/TabBar.tsx:27`(공용 검사 밖). `text-primary-text`면 5.02:1(§6) |
| 흰 글씨(레드플래그 카드 밖) — AI 상담 내 말풍선 16 regular·기록장 글쓰기 캡슐 13 semibold·분석 폼 선택된 분할 버튼 15 semibold | primary `#fb6f6f` | **2.76:1 ✗** — 큰 글씨 3:1도 못 미침. 레드플래그 카드와 함께 CPO 12 |
| 흰 글씨 12 medium — 출처 칩 inverse(`EvidenceChip` 코랄 카드 위) | `bg-white/22` over primary = `#fc8f8f` | **2.22:1 ✗** — CPO 12(카드 색을 짙게 하면 함께 오름) |
| 스위치 꺼짐 트랙 `bg-text-subtle/50`(비텍스트 3:1) | surface / background | **1.65 / 1.58:1 ✗** — `components/ui/Toggle.tsx:79`, iOS 원본 색. 켬/끔은 손잡이 위치와 `role=switch` 낭독으로도 알 수 있으나 트랙 경계가 3:1 미달 — CPO 12 |

로고 워드마크(사이드바·홈 머리·로그인 "온맘")는 logotype 예외(WCAG 1.4.3)로 원색 코랄 그대로입니다.

## 5. 확인 결과 — 키보드(PC·폰 모두)

| 검사 | 결과 |
|---|---|
| 홈 탭 순서 | PC: 본문 바로가기 → 온맘 → 탭 5 → 서비스 7 → 본문. 폰: 온맘 → AI 상담 → 카드 링크… → 탭바 5개. 모두 링 보임·화면 안 |
| 본문 바로가기(PC) | 첫 Tab에 보임, Enter → `#app-content` |
| 화면 이동 뒤 초점 | 사이드바/탭바 "운동" Enter → 초점 `#app-content`, 안내 "오늘의 운동"; 다음 Tab = 본문 첫 컨트롤(운동 탭은 컨트롤이 없어 문서 처음으로 순환 — 정상) |
| 기록 스위치 | Space·Enter 모두 토글(`aria-checked` false→true→false) |
| NRS 슬라이더 | 화살표로 2 → `aria-valuetext "2/10"`, 링 보임 |
| [확인하기] 뒤 | 결과 카드(`role=alert`)로 초점 |
| 계정 삭제 창 | 열리면 [취소]에 초점(링), Tab 순환이 창 안(브라우저 UI 경유), Esc → 닫힘 + [계정 삭제] 버튼으로 복귀 |
| 서비스 소개 마지막 CTA(어두운 카드 안 흰 [시작하기]) | 흰(surface) 링 2px — 폰·PC 모두 초점 전후 캡처가 다름(전에는 neutral 링이 카드와 같은 색이라 캡처가 바이트 단위로 같았음). 머리의 neutral [시작하기]는 neutral 링 그대로 |
| 오류 화면(정적 내보내기, 로컬 전용 throw 페이지) | 버튼 Enter로 예외 → 초점 h1 "문제가 생겼어요"(링 없음) → 다음 Tab [다시 시도] → Enter로 경계 안 다시 그림 |
| 처리방침 시트 | [닫기]에 초점, 순환 창 안, Esc → [개인정보처리방침 보기]로 복귀, `body` 스크롤 복원 |
| 온보딩 | [시작하기] Enter → h1에 초점(링 보임), 라디오 ↓ → 제왕절개 선택(링), 아래 고정 [다음] 화면 안 |
| 제목·랜드마크 | 17개 화면 모두 h1 1개·건너뜀 없음·`<main>` 1개·`<nav>` 이름 "주요 메뉴"(PC 사이드바 또는 폰 탭바 하나만 보임)·`alt` 없는 이미지 0·이름 없는 아이콘 버튼 0(스위치는 `<label for>`로 이름 — AX 트리로 확인) |

## 6. 기능 폴더에서 고쳐야 할 것 (다른 담당 — 공용 토큰·규칙은 이미 있음)

> **2026-09-29 통합에서 반영**(DEV_NOTES §10-1): 아래 "색 대비"의 글자 토큰 바꾸기 전부(`text-state-watch`·`text-state-alert`·`text-primary`·`text-text-subtle`·`placeholder:` → 글자 전용 토큰, 아이콘·워드마크는 그대로), `TabBar.tsx` 활성 라벨(아이콘은 원색), 코랄 포커스 링 `outline-primary` 5곳 → `outline-focus-ring`, 150%의 `AnalyzeForm` 출산일 줄·`LandingPage` 머리 `min-h-16`·워드마크 줄바꿈 금지·설정 문의 이메일 `break-all`, "기타"의 `AppGate` 불러오는 중 표시(0.4초 뒤 스피너 + 낭독 "불러오는 중이에요").
> **그대로 둔 것**: 기록장 글 제목 `truncate`(iOS `lineLimit(1)`), 글쓰기 캡슐(이미 `before:` 영역으로 44px 가까이), 서비스 소개 바닥글 "문의" 폭(24px 최소 기준은 넘음), 코랄 위 흰 글씨·출처 칩 inverse·토글 꺼짐 트랙(CPO 12), 카카오 지도 `role="region"` 이름(새 문구), 히어로 칩 `aria-label`, 온보딩 h1 초점 링.

**글자 150%**
- `features/onboarding/OnboardingSteps.tsx:95-113, 176-192`·`features/analyze/AnalyzeForm.tsx:83-89`(출산일 줄): `flex items-center justify-between` → `flex-wrap`(라벨 묶음 `min-w-[10rem] flex-1`, 입력 `shrink-0`) 또는 `flex-col sm:flex-row`. (`features/settings/ProfileEditScreen.tsx:115,155`는 라벨이 위에 있어 괜찮음.)
- `features/landing/LandingPage.tsx:122`: `h-16` → `min-h-16`, 워드마크 `<span>`에 `whitespace-nowrap shrink-0`.
- `features/journal/JournalScreen.tsx:102` 제목 `truncate` → `line-clamp-2`; `features/settings/SettingsScreen.tsx:336` 이메일 `truncate` → `break-all`.
- 기능 폴더의 고정 높이 글자 상자(공용 검사 밖): `features/landing/LandingPage.tsx:122`(`h-16`), `features/privacy/PrivacyPolicyDialog.tsx:51`·`features/terms/TermsDialog.tsx:48`(`h-[calc(100dvh-2.5rem)]` — 스크롤 상자라 괜찮음), `features/admin/NewUsersChart.tsx:120,193`(차트), `features/clinics/ClinicMap.tsx:140`(지도 13.75rem — 글자 없음).

**터치 영역**
- `features/journal/JournalScreen.tsx:44` 글쓰기 캡슐 34px → `min-h-11`(패딩은 Swift 값이지만 누르는 영역은 06 §5 44).
- `features/landing/LandingPage.tsx` 바닥글 "문의" 링크 폭 36 → `px-1` 이상.

**색 대비(글자에 원색 → 글자 전용 토큰)** — 배경·아이콘·테두리는 그대로.
- `text-state-watch` → `text-state-watch-text`: `features/home/HomeCards.tsx:310`, `features/exercise/ExerciseBlocks.tsx:67,76`("{단계} 제외 — 사유" 줄, 흰 배경 1.83:1), `features/substance/substanceModel.ts:37`(caution 배지).
- `text-state-alert` → `text-state-alert-text`: `features/settings/SettingsScreen.tsx:234,247,256`, `ReminderSection.tsx:60`, `DataRightsCard.tsx:57`, `ConfirmDialog.tsx:63`, `features/record/RecentRecordsCard.tsx:22,29`, `features/substance/substanceModel.ts:38`, `features/exercise/ExerciseBlocks.tsx:150`, `features/analyze/AnalyzeResult.tsx:118`, `features/onboarding/ServerConsentStep.tsx:124`, `features/flow/LoginScreen.tsx:102`, `features/admin/AdminTools.tsx:47`, `AdminScreen.tsx:463`, `DeleteUserDialog.tsx:136,144`. (레드플래그 카드의 흰 글씨는 CPO 12 — §4.)
- `text-primary`(글자) → `text-primary-text`: `features/journal/JournalWriteScreen.tsx:61`("등록"), `features/settings/SettingsScreen.tsx:222,274,304`, `DataRightsCard.tsx:50`, `features/privacy/PrivacyPolicyDialog.tsx:62`·`features/terms/TermsDialog.tsx:59`("닫기"), `features/home/HomeCards.tsx:96,210,225,339`, `features/chat/ChatScreen.tsx:228`, `features/profile/ProfileScreen.tsx:121`, `features/guide/PhoneLinks.tsx:25`(기본 `linkClassName`). 아이콘만 있는 곳(`HomeCards.tsx:132,146,241`, `ProfileScreen.tsx:87`, `GuideScreen.tsx:73`, `LifestyleScreen.tsx:36`, `JournalPostScreen.tsx:123`, `NearbyClinics.tsx:93`, `ClinicRow.tsx:10`)과 홈 워드마크 `HomeCards.tsx:88`은 그대로.
- `text-text-subtle` → `text-text-subtle-aa`: `features/home/HomeCards.tsx:110,149,167,181,230,245,266,270,304,324,349`, `features/substance/SubstanceCheckScreen.tsx:122`, `features/chat/ChatScreen.tsx:218,321`, `features/record/MoodQuestionCard.tsx:58`, `features/support/SupportProgramScreen.tsx:52`.
- `components/TabBar.tsx:27`(폰 탭바, 공용 검사 밖): 활성 링크의 `text-primary` → `text-primary-text`(라벨 2.50 → 5.02:1). 아이콘은 `text-primary` 그대로 두려면 `<Icon className="size-6 text-primary">`로 아이콘에 명시(SideNav와 같은 방식).
- 코랄 포커스 표시 `outline-primary`(2.64~2.76:1, WCAG 1.4.11 미달) → `outline-focus-ring`: `features/admin/AdminScreen.tsx:419`, `features/settings/ProfileEditScreen.tsx:250`, `features/substance/SubstanceCheckScreen.tsx:131`, `features/support/SupportProgramScreen.tsx:123`, `features/analyze/AnalyzeForm.tsx:62`. `SubstanceCheckScreen`은 입력창이 `focus-visible:outline-none`이라(base 층 이동 뒤 유틸리티가 이김) 카드의 코랄 링만 남습니다 — 카드 링을 `outline-focus-ring`으로 바꾸면 해결.
- 코랄 위 흰 글씨(2.76:1): `features/chat/ChatScreen.tsx:315`(내 말풍선), `features/journal/JournalScreen.tsx:48`(글쓰기 캡슐), `features/analyze/AnalyzeForm.tsx:64`(선택된 분할 버튼), 그리고 공용 `components/ui/EvidenceChip.tsx:31` inverse(2.22:1) — 레드플래그 카드와 함께 CPO 12 결정 대기(§4). 결정 전에는 바꾸지 않습니다.
- `components/ui/Toggle.tsx:79` 스위치 꺼짐 트랙(1.65:1) — CPO 12 결정 대기(iOS 원본 색).
- `placeholder:text-text-subtle` → `placeholder:text-text-subtle-aa`: `features/journal/JournalWriteScreen.tsx:86`, `JournalPostScreen.tsx:117`, `features/settings/ProfileEditScreen.tsx:175`, `features/chat/ChatScreen.tsx:270`, `features/record/SymptomFormCards.tsx:112`, `features/substance/SubstanceCheckScreen.tsx:143`, `features/clinics/NearbyClinics.tsx:87`, `features/admin/DeleteUserDialog.tsx:21`, `AdminTools.tsx:190`.

**이름·설명**
- `features/clinics/ClinicMap.tsx:138` 지도 컨테이너에 `role="region"` + `aria-label="가까운 산부인과 지도"`(웹 신규 문구 — CPO 확인 필요). 실제 키로 지도를 띄운 뒤 SDK가 넣는 `<img>`의 `alt`·컨트롤 이름도 확인.
- `features/home/HomeCards.tsx:105-128` 히어로 칩 목록: `<ul aria-describedby>`보다 `aria-label`("분만 방식·목표" 등, 웹 신규 문구)이 단순 — 지금은 목록 항목으로 읽히므로 필수는 아님.
- 온보딩 `[시작하기]` 뒤 h1에 초점을 두면 링이 h1에 그려짐 — 의도면 그대로, 아니면 그 h1에 `focus:outline-none`(base 층 규칙이라 유틸리티가 이김).

**기타**
- `features/flow/AppGate.tsx`: 저장소를 읽는 동안 `null` 대신 로고 + `role="status"` sr-only "불러오는 중"(웹 신규 문구) — 08 §2 "빈 화면 대신 로딩 표시"(nice).
- 오류 경계에 걸린 예외는 React 19 기본 `onCaughtError`가 브라우저 콘솔에 남깁니다(우리 코드는 아무것도 남기지 않음). 서버·분석 도구로는 가지 않으므로 web/07 §2 범위 안. 콘솔까지 막으려면 `next.config`가 아니라 앱 루트에서 React `onCaughtError`를 바꿔야 해 두지 않았습니다.

## 7. 남은 것 — 실기기 (아직 하지 않음)

헤드리스 Chrome은 스크린리더가 아닙니다. 아래는 사람이 기기에서 확인해야 합니다(각 5~10분).

| 기기 | 확인할 것 |
|---|---|
| iOS Safari + VoiceOver | Safari 주소창 aA → 글자 크기 150%·200%에서 (iOS 시스템 "설정 > 손쉬운 사용 > 디스플레이 및 텍스트 크기 > 더 큰 텍스트"는 `-apple-system-body`를 쓰지 않는 웹 페이지에는 적용되지 않으므로, 그 설정만 바꾸고 화면이 그대로면 통과가 아니라 **확인 안 됨**)  홈·기록·온보딩(출산일 줄, §6 고친 뒤); 탭바 "주요 메뉴" 낭독·현재 탭(`aria-current`); 기록 스위치를 두 번 탭해 켜고 끄기(`role=switch` 낭독 "켬/끔"); NRS 슬라이더 위/아래 스와이프로 값 조절 + "n/10" 낭독; 온보딩 동의의 `<details>` "자세히"(요약이 "펼침/접힘"으로 읽히는지 — `list-none`로 마커를 지웠음); 계정 삭제 창(`<dialog>` showModal 뒤 바깥 요소로 못 나가는지); 화면 전환 뒤 첫 줄부터 읽는지(RouteFocus) |
| Android Chrome + TalkBack | Chrome 설정 > 접근성 > 글자 크기 150%·200%, 시스템 글자 크기·디스플레이 크기 최대; 슬라이더 볼륨 키 조절; 스위치 이중 탭; `<input type="date">` 열기; 탭바 |
| Windows Chrome/Edge + NVDA | 사이드바 목록 낭독("주요 메뉴", "더보기" 묶음), 본문 바로가기, 화면 전환 안내(route announcer가 새 `<title>` 읽음), 확인 창 초점 가두기, 설정 폼 모드에서 스위치 Space |
| 모두 | 고대비/강제 색 모드(Windows 고대비, `forced-colors`): 토글·라디오·슬라이더·단계 표시가 시스템 색으로 보이는지(코드에 `forced-colors:` 규칙 있음) |

발견은 이 문서 §6에 파일·줄로 더하고, 공용 컴포넌트 문제면 `components/ui`·`shell`을 고칩니다.

## 8. 웹 신규 문구 (CPO 확인 필요 — 코드에 `// 웹 신규 문구 — CPO 확인 필요`)

| 파일 | 문구 | 보이는 곳 |
|---|---|---|
| `src/app/not-found.tsx` | "페이지를 찾을 수 없어요" / "주소가 바뀌었거나 잘못 입력됐을 수 있어요." / "홈으로" / "서비스 소개 보기" | 없는 주소(404) |
| `src/components/shell/ErrorScreen.tsx` | "문제가 생겼어요" / "잠시 후 다시 시도해 주세요. 기록은 이 브라우저에 그대로 있어요." / "홈으로" | 화면을 그리다 예외가 났을 때. "다시 시도"는 ExerciseView.swift:184 원문 |

껍데기 문구("주요 메뉴"·"더보기"·"본문 바로가기")는 DEV_NOTES §7-5에 이미 있습니다.

## 9. 새 화면을 만들 때 (규칙)
- 글자가 들어가는 상자에 `h-숫자`·`h-[…]`를 쓰지 않습니다(`min-h-`). 공용·`app` 폴더는 `a11y.test.ts`가 막고, 기능 폴더는 §6처럼 적어 둡니다. 예외는 줄 끝 `// a11y: fixed-height ok — 이유`.
- 글자 색은 `text-text-primary`·`text-text-secondary`·글자 전용 토큰(`text-state-*-text`·`text-primary-text`·`text-text-subtle-aa`)만. 원색(`text-primary`·`text-state-*`·`text-text-subtle`)은 아이콘·배경·테두리·로고에만.
- 상태는 색과 함께 글자·모양으로도(배지 글자, 스위치 손잡이, 선택 행 체크). 아이콘만 있는 버튼·링크는 `aria-label`, 장식 아이콘은 `aria-hidden`.
- 화면 하나에 `<main>` 하나·h1 하나, 제목 단계를 건너뛰지 않습니다. 화면 안에서 초점을 옮기는 요소(제목·결과 카드)는 `tabIndex={-1}`; 링을 원하지 않으면 `focus:outline-none`.
- 새 문구는 최소로, `// 웹 신규 문구 — CPO 확인 필요` 표시 + 이 문서 §8 또는 DEV_NOTES에 목록.
- 확인은 §1의 네 모드로 캡처해 보고, 키보드만으로 한 번 끝까지 갑니다.
