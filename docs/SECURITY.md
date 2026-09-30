# 보안 요약 (2026-09-30)

온맘 웹은 GitHub Pages의 정적 사이트(Next.js `output: "export"`) + Supabase(서울) 백엔드입니다. 이 문서는 무엇을 지키고, 어떻게 지키며, 무엇이 남았는지를 한곳에 모읍니다. 세부는 `docs/DEV_NOTES.md` §8·§10, `docs/SUPABASE_SETUP.md`, `docs/SUPABASE_FUNCTIONS.md`, `docs/LAUNCH_CHECKLIST.md`.

## 1. 위협 모델(간단히)

| 지킬 것 | 누가 노리나 | 막는 방법 |
|---|---|---|
| 산후 건강 기록(증상·기분·출산일·분만 방식) — 민감정보 | 다른 사용자, 공개 키를 꺼낸 누구나 | Supabase RLS(본인 행만), 동의 전에는 서버로 보내지 않음, 계정 삭제 = 서버 행·로그인 계정·AI 사용 기록까지 삭제 |
| 서버 비밀(DB 비밀번호, Supabase 토큰·secret 키, Anthropic 키, VAPID 비밀 키, 리마인더 비밀) | 번들·저장소를 읽는 누구나 | 코드·저장소·번들에 없음 — GitHub Secrets → Supabase 함수 비밀값, 대시보드에만 |
| AI 비용·서비스 | 봇(게스트 대량 생성) | 함수 안 로그인 확인 + 사용자별·전체 하루 한도(`llm_usage`), 게스트 시작 IP당 시간 제한, Turnstile(켜면) |
| 브라우저 안의 기록 | 주입된 스크립트(XSS), 공용 PC | React가 모든 사용자 글을 글자로만 그림(`dangerouslySetInnerHTML`·`innerHTML` 없음), 지도 핀도 DOM 요소로 만듦, CSP(§2), 로그아웃 시 올린 뒤 사본 삭제 |
| 관리자 기능 | 일반 사용자 | 서버 함수가 맨 앞에서 `is_admin()` 확인(아니면 42501), anon 실행 권한 없음. 화면(`/admin/`)은 공개지만 데이터는 함수가 막음 |

범위 밖: GitHub·Supabase·카카오·Cloudflare 계정 탈취(2단계 인증으로 대표님이 관리), 기기 분실(브라우저 저장소는 기기 잠금에 기댐).

## 2. Content-Security-Policy

GitHub Pages는 응답 헤더를 붙일 수 없어 루트 레이아웃(`src/app/layout.tsx`)의 `<meta http-equiv="Content-Security-Policy">`로 싣습니다. 정책은 `src/csp.ts`가 빌드 값으로 만들고, **설정된 기능의 출처만** 들어갑니다(테스트 `src/csp.test.ts`). 운영 빌드에서만 싣습니다 — `next dev`는 eval·HMR이 필요합니다.

| 지시어 | 값 | 까닭 |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self' 'unsafe-inline'` + 카카오 키가 있으면 `dapi.kakao.com t1.daumcdn.net` + Turnstile 키가 있으면 `https://challenges.cloudflare.com` | Next 정적 내보내기는 페이지마다 RSC 페이로드를 인라인 `<script>`로 넣는다. nonce는 요청마다 만드는 서버가 없어 불가, 해시는 빌드 뒤 모든 HTML을 다시 써야 해 지금은 하지 않음. `'unsafe-eval'` 없음 |
| `style-src` | `'self' 'unsafe-inline'` | Next·카카오 지도 SDK의 인라인 스타일 |
| `img-src` | `'self' data: blob:` + 카카오 키가 있으면 `*.daumcdn.net` | 지도 타일(mts.daumcdn.net 등)·마커 |
| `font-src` | `'self'` | Pretendard는 번들에 포함 |
| `connect-src` | `'self'` + Supabase `https://<ref>.supabase.co`·`wss://…` + 카카오 키가 있으면 `dapi.kakao.com` + 예전 백엔드 주소(`NEXT_PUBLIC_VIDEO_URL`·`LLM_URL`·`ACCOUNT_URL`)가 있으면 그 origin | |
| `frame-src` | Turnstile 키가 있으면 `https://challenges.cloudflare.com`, 없으면 `'none'` | |
| `worker-src` `manifest-src` `media-src` | `'self'` | `sw.js`, `manifest.webmanifest` |
| `object-src` | `'none'` | |
| `base-uri` `form-action` | `'self'` | |

- 카카오 출처는 **scheme 없이** 적습니다. CSP에서 scheme 없는 호스트는 페이지와 같은 scheme만 허용하므로 운영(https)에서는 https만 통과합니다. 카카오 SDK는 페이지 scheme을 따라 본체를 부르므로, 내 컴퓨터 시험(`http://localhost:3000`)에서는 http로 부릅니다.
- 카카오 지도 본체(`kakao.js`)가 옛 IE 확인용 `try { eval("document.namespaces") } catch {}`를 한 번 부릅니다. CSP가 막아 `securitypolicyviolation`(eval) 이벤트가 하나 생기지만 지도·검색은 그대로 동작합니다. `'unsafe-eval'`을 열 까닭이 아닙니다.
- 메타 태그의 한계: `frame-ancestors`(클릭재킹)·`report-uri`·`sandbox`는 메타에서 무시되어 넣지 않았습니다. Next가 자기 CSS·스크립트 청크(모두 `'self'`)를 메타보다 앞에 올리므로 그 청크에는 정책이 적용되지 않습니다. 허용 대상이라 차이는 없습니다. 헤더로 옮기려면 커스텀 도메인 앞에 헤더를 붙일 수 있는 호스팅·프록시가 필요합니다.
- **새 외부 출처를 쓰는 기능을 더하면** `src/csp.ts`와 이 표를 같이 고치고, 실제 브라우저에서 `securitypolicyviolation`이 0인지 봅니다.

### 확인한 것(2026-09-30, 헤드리스 Chrome)
- 서버 연결 빌드(`http://localhost:3000`, 실제 Supabase + 카카오 JS 키 + AI 켬): 게스트 가입 → 동의 → 서버 저장·복원 → 운동 영상 → AI 상담(동의 카드·AI 답·위기 문구) → 약물 체크 → 설정·관리자 → **가까운 산부인과 "서울 강남구 역삼동"(목록 250m·314m·333m, 지도 타일 7장)** → 계정 삭제. 15/15 통과, CSP 위반은 위의 카카오 eval 1건뿐, 그 밖의 콘솔 오류 0. 거절 흐름 3/3, 콘솔 오류 0.
- 공개 페이지(소개·처리방침·약관·로그인·관리자): 서비스 워커 등록, 매니페스트 로드, 깨진 이미지 0, 위반 0.
- Turnstile(Cloudflare 공개 시험 키 `1x00000000000000000000AA`) 빌드: 게스트 시작 시 위젯 로드 → 토큰이 가입 요청에 실림 → 온보딩 이동, 위반 0. 만든 시험 사용자는 지움.
- 브라우저 전용 빌드(`BASE_PATH=/onmom_web`, 설정 없음): 통합 스모크 25/25, 콘솔 오류·4xx 0, localhost 밖 요청 0.

## 3. 비밀값 다루기

- `NEXT_PUBLIC_*`는 모두 **공개값**입니다(번들에 그대로 들어감): Supabase 주소·Publishable key(`sb_publishable_…` — RLS가 데이터를 지킴), 카카오 **JavaScript** 키(카카오 콘솔에서 도메인 제한), Turnstile **사이트** 키, VAPID **공개** 키, 기능 스위치·사이트 주소. `NEXT_PUBLIC_ONMOM_APP_KEY`(예전 계정 API)도 비밀이 아니며 인증 수단으로 쓰지 않습니다.
- 빌드가 막는 실수: Supabase 키가 `sb_secret_…`이거나 JWT `role`이 `service_role`이면 빌드가 멈춥니다(`src/config.ts`). VAPID 공개 키 자리에 형식이 다른 값(비밀 키 등)을 넣어도 멈춥니다.
- 비밀값(DB 비밀번호, `SUPABASE_ACCESS_TOKEN`, Anthropic 키, VAPID 비밀 키, 리마인더 비밀, 카카오 REST 키·Client Secret, Turnstile 비밀 키)은 GitHub Secrets → Supabase 함수 비밀값/Vault, 또는 대시보드에만 있습니다. 함수의 서버 키는 Supabase가 자동으로 넣습니다.
- 로컬 전용: `docs/private/`·`web/`는 `.gitignore`. 스크립트는 값을 `grep '^NAME=' … | cut -d= -f2-`로만 읽고 출력하지 않습니다.
- 점검(2026-09-30): 두 빌드의 `out/`에서 `sb_secret_`·`service_role`·`sk-ant-`·`-----BEGIN`·`postgres://`·JWT 모양을 찾음 → 키 검사 코드의 문자열뿐, 실제 값 없음. `docs/private/supabase.env`의 비밀값 6개가 빌드 결과·추적 파일 어디에도 없음을 값 비교로 확인(값은 출력하지 않음). `npm audit --omit=dev`·`npm audit` 모두 취약점 0.

## 4. 데이터베이스 권한(RLS) 요약

2026-09-30 실제 서버에서 확인: `public`의 표 5개 모두 RLS 켜짐.

| 표 | 정책 | 브라우저 접근 |
|---|---|---|
| `user_states` | 본인 행 읽기·만들기·바꾸기·지우기 4개(`auth.uid() = user_id`) | 본인 행만 |
| `push_subscriptions` | 본인 행 4개 | 본인 행만 |
| `llm_usage` | 없음 | 없음 — `chat` 함수가 서버 키로 `llm_consume_quota`만 |
| `admins`, `admin_audit` | 없음 | 없음 — 관리자 함수(SECURITY DEFINER, `search_path ''`, 맨 앞 `is_admin()`)로만 |

함수 실행 권한: `delete_my_account`·`is_admin`·`admin_*`는 `authenticated`만(anon 불가), `llm_consume_quota`·`cleanup_stale_anonymous_users`는 브라우저 역할 모두 불가. anon이 실행 가능한 `*_set_updated_at`·`push_subscriptions_touch`·`…_limit`은 트리거 함수라 RPC로 부를 수 없습니다. 표·권한은 `supabase/migrations`로만 바꿉니다.

## 5. 검색 노출

- 화면마다 `<meta name="robots">`: 기본 전부 `noindex, nofollow`. `NEXT_PUBLIC_SITE_INDEXABLE=true`면 서비스 소개(`/`)만 index, 앱 화면은 늘 noindex(`robotsFor`).
- `public/robots.txt`: `User-agent: *` / `Disallow: /`(1.0 공개 전). 링크 미리보기 봇(kakaotalk-scrap·Twitterbot·facebookexternalhit·Slackbot-LinkExpanding)만 `Allow: /` — 공유 카드(OG)를 그리려면 페이지를 읽어야 하고, 이 봇들은 색인을 만들지 않습니다. 정적 파일이라 빌드 값에 따라 바뀌지 않습니다 — **서비스 소개를 검색에 열 때 `NEXT_PUBLIC_SITE_INDEXABLE=true`와 함께 `*` 그룹을 `Allow: /$` + `Disallow: /`로 바꿉니다**(테스트 `src/csp.test.ts`가 지금 값을 지킴 — 같이 고침).
- GitHub 프로젝트 페이지(`/onmom_web/`)에서는 크롤러가 도메인 루트(`5seoyoung.github.io/robots.txt`)만 읽으므로 이 파일은 커스텀 도메인에서 효력이 생깁니다. 그때까지는 메타 noindex가 막습니다.

## 6. 계정 삭제와 로그아웃

- 계정 삭제는 서버 함수 `delete_my_account()`가 성공했을 때만 이 브라우저를 비웁니다. 그 뒤 이 브라우저의 세션은 **저장소에서 먼저 지우고** `signOut({ scope: "local" })`을 부릅니다(`src/auth/session.ts` `signOutDeletedUser`). 이렇게 하지 않으면 supabase-js가 지워진 사용자의 토큰으로 `POST /auth/v1/logout`을 보내 403(`user_not_found`)이 나고 콘솔에 오류가 남았습니다(2026-09-30 수정).
- 로그아웃은 이 브라우저의 세션만 끝냅니다(`scope: "local"`) — 다른 기기는 그대로.

## 7. 남은 일

- **Supabase 토큰·DB 비밀번호 교체**: 설정 작업에 쓴 `SUPABASE_ACCESS_TOKEN`과 DB 비밀번호는 작업이 끝나면 새로 만들고 GitHub Secrets·`docs/private/`를 함께 바꿉니다(대표님).
- **Legacy API keys(예전 anon·service_role JWT) 끄기**: chat 함수 Logs에 `"server_key":"secret_keys"`가 보인 뒤 대시보드에서 끕니다(LAUNCH_CHECKLIST 2-7). Secret keys의 `default` 키는 지우거나 다시 만들지 않습니다.
- **카카오 연결 끊기(unlink)**: 계정 삭제 때 카카오 "연결 끊기"를 부르지 않습니다(카카오 Admin 키가 필요해 서버 함수로 만들어야 함). 지금은 사용자가 카카오 계정 설정에서 직접 끊을 수 있고, 처리방침에 적습니다.
- **Turnstile(CAPTCHA)**: AI 상담을 공개로 켜기 전 필수(LAUNCH_CHECKLIST 5-0). CSP는 사이트 키를 넣으면 자동으로 출처를 엽니다.
- **CSP 강화**: 인라인 스크립트 해시(빌드 뒤 HTML 후처리) 또는 헤더를 붙일 수 있는 호스팅으로 옮기면 `'unsafe-inline'`(script)과 `frame-ancestors`를 정리할 수 있습니다.
- **Supabase Auth 감사 로그·백업 보관 기간**: 삭제한 계정의 흔적이 남는 기간을 처리방침에 적습니다(LAUNCH_CHECKLIST).
