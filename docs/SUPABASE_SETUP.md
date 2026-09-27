# 온맘 웹 켜기 — Supabase · 카카오 설정 안내

개발자가 아닌 운영자(CPO)가 **위에서부터 순서대로** 따라 하는 설명서입니다. 굵은 글씨로 적은 메뉴 이름을 그대로 찾아 누르면 됩니다.
Supabase 화면은 **바로 가기 링크**도 적었습니다. 로그인한 상태에서 누르면 그 화면이 열립니다.
메뉴 이름은 2026-09-28에 공식 문서(Supabase Docs, Kakao Developers 문서)로 확인했습니다. 화면이 조금 달라졌으면 가장 비슷한 이름을 찾으세요.

> **공개 사이트가 바뀌는 순간은 C-3 값을 넣고 사이트를 다시 배포할 때(D-2) 하나뿐입니다.** 그 전 단계(A·B·C-1·C-2·D-1)는 준비라서 사용자에게 보이지 않습니다.
> C-3은 [`docs/LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)의 **1~3단계**(법·개인정보, 운영, 제품·임상)를 마친 뒤에 합니다. 그 전에 동작을 보고 싶으면 개발자가 내 컴퓨터(`.env.local`)에서 F단계를 먼저 확인합니다.

### 지금 어디까지 했나 (2026-09-28)

| 단계 | 상태 |
|---|---|
| A. 카카오 앱 "온맘" — 앱·키·JavaScript SDK 도메인·리다이렉트 URI·클라이언트 시크릿 만들기·카카오 로그인 ON·카카오맵 ON | ✅ 완료(장소 검색 동작 확인) |
| A-7 동의항목 · A-8 클라이언트 시크릿 **활성화** 확인 | ⬜ 남음 |
| B. Supabase 대시보드(로그인 방식·카카오 연결·주소) | ⬜ 남음 |
| C. GitHub에 값 넣기 · D. 실행 · E. 관리자 지정 · F. 확인 | ⬜ 남음 |

---

## 0. 먼저 읽기

### 0-1. 무엇이 켜지나

| 기능 | 지금(설정 없음) | 이 문서를 마치면 |
|---|---|---|
| 게스트 | 기록은 그 브라우저에만 | 게스트로 시작하면 **바로(동의 전)** Supabase 익명 계정이 생깁니다(이름·이메일 없음. 계정 ID·가입/접속 시각·Auth 로그의 IP) — 기존 이용자도 켠 뒤 첫 방문 때 자동으로. 건강 기록은 **서버 저장 동의 뒤에만** 서버(서울)에 저장 (LAUNCH_CHECKLIST 1-10) |
| 카카오 로그인 | 버튼 "준비 중" | 켜짐. 게스트가 카카오로 로그인해도 **같은 기록**(계정 ID는 카카오 이메일이 확인된 계정이면 그대로, 아니면 새 카카오 계정 ID로 바뀌고 게스트 익명 계정은 지워짐 — H) |
| 여러 기기 | 안 됨 | 같은 카카오 계정이면 휴대폰·PC에서 이어 쓰기 |
| 운동 영상 | 준비 중 | Supabase 함수 `videos`를 거쳐 표시(영상 서버를 브라우저가 직접 부르지 않음) |
| AI 상담 | 준비 중 | `NEXT_PUBLIC_AI_CHAT_ENABLED`를 `true`로 바꿀 때만(LAUNCH_CHECKLIST 5단계 뒤). Supabase 함수 `chat`이 Anthropic을 부름 |
| 가까운 산부인과 지도 | 준비 중 | 카카오 JavaScript 키를 넣으면 |
| 관리자 화면 `/admin/` | 열 수 없음 | 집계·계정 정보만(건강 기록 없음). E단계에서 지정한 카카오 계정만 |

### 0-2. 값 정리표 — 어디서 받아 어디에 넣나

| 값 | 받는 곳 | 넣는 곳 | 공개 여부 |
|---|---|---|---|
| 카카오 REST API 키 | 카카오 **[앱] > [플랫폼 키] > [REST API 키]** (A-2) | Supabase Kakao 설정의 **REST API Key** (B-2) | 비공개 — 웹·GitHub에 넣지 않음 |
| 카카오 클라이언트 시크릿 | 카카오 **[앱] > [플랫폼 키] > [REST API 키] > [클라이언트 시크릿]** (A-8) | Supabase Kakao 설정의 **Client Secret Code** (B-2) | **비밀** |
| 카카오 JavaScript 키 | 카카오 **[앱] > [플랫폼 키] > [JavaScript 키]** (A-2) | GitHub Variable `NEXT_PUBLIC_KAKAO_JS_KEY` (C-3) | 공개값(등록한 도메인에서만 동작) |
| Supabase 주소 | `https://movrwmoniopgetdmagon.supabase.co` | GitHub Variable `NEXT_PUBLIC_SUPABASE_URL` (C-3) | 공개값 |
| Supabase Publishable key `sb_publishable_…` | Supabase **Project Settings → API Keys** (B-4) | GitHub Variable `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (C-3) | 공개값 |
| 프로젝트 ref | `movrwmoniopgetdmagon` | GitHub Variable `SUPABASE_PROJECT_REF` (C-2) | 공개값 |
| Supabase 개인 액세스 토큰 | Supabase **Account → Access Tokens** (C-1) | GitHub Secret `SUPABASE_ACCESS_TOKEN` | **비밀** |
| 데이터베이스 비밀번호 | 프로젝트를 만들 때 정한 것(B-5) | GitHub Secret `SUPABASE_DB_PASSWORD` | **비밀** |
| Anthropic API 키 | Claude Console(C-1) | GitHub Secret `ANTHROPIC_API_KEY` | **비밀** |
| 영상 서버 주소 | `https://hackathon-video-api.onrender.com` | GitHub Variable `VIDEO_API_URL` (선택) | 공개값 |
| 함수를 부를 수 있는 사이트 주소 | `https://5seoyoung.github.io,http://localhost:3000` | GitHub Variable `ALLOWED_ORIGINS` (선택) | 공개값 |
| AI 상담 요청 한도 | — | GitHub Variable `CHAT_HOURLY_LIMIT`·`CHAT_GLOBAL_DAILY_LIMIT` (선택) | 공개값 |
| AI 상담 스위치 | — | GitHub Variable `NEXT_PUBLIC_AI_CHAT_ENABLED` = `false` | 공개값 |
| Turnstile 사이트 키 / 비밀 키 | Cloudflare (B-6, 선택) | Variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / Supabase **Attack Protection** | 공개값 / **비밀** |

**지킬 것**
- 이 저장소는 **공개**입니다. 비밀 값은 GitHub **Secrets**나 Supabase·카카오 대시보드에만 넣습니다. 코드·문서·채팅·메일에 붙여 넣지 않습니다.
- Supabase의 **Secret key(`sb_secret_…`)·`service_role` 키는 복사하지도, 어디에도 넣지도 않습니다.** 모든 사람의 건강 기록을 읽고 지울 수 있는 키입니다. 웹 빌드는 이런 키가 들어오면 일부러 멈춥니다. (AI 상담 함수는 Supabase가 함수에 **자동으로** 넣어 주는 값을 씁니다 — 사람이 옮기지 않습니다. B-4)
- 표·권한은 대시보드에서 손으로 고치지 않습니다. 바꿀 일이 있으면 개발자가 `supabase/migrations/`에 새 파일을 만들고, D-1 워크플로가 적용합니다.

### 0-3. 순서 (처음 한 번, 1시간 안팎)

**A 카카오(대부분 완료) → B Supabase 대시보드 → C GitHub에 값 넣기 → D 실행(Supabase → 사이트) → E 나를 관리자로 → F 켠 뒤 확인.** 문제가 생기면 **G 되돌리기**.

---

## A. 카카오 디벨로퍼스

<https://developers.kakao.com/console/app> 에 로그인해 **온맘** 앱을 엽니다. 1~6과 8의 "만들기"는 2026-09-28에 마쳤습니다. **✅ 표시는 값이 맞는지 눈으로 확인만** 하고, ⬜만 새로 합니다.

1. ✅ **앱** — 목록의 **온맘**.
   - 나중에 iOS 앱과 계정을 이으려면 iOS와 **같은 카카오 앱**을 써야 합니다. 카카오 회원번호가 앱마다 다르게 나오기 때문입니다.
2. ✅ **키** — **[앱] > [플랫폼 키]**
   - **REST API 키** → B-2에서 Supabase에만 넣습니다.
   - **JavaScript 키** → C-3에서 GitHub Variable `NEXT_PUBLIC_KAKAO_JS_KEY`에 넣습니다.
3. ✅ **사이트 도메인** — **[앱] > [플랫폼 키] > [JavaScript 키] > [JavaScript SDK 도메인]** 에 두 줄이 있는지 봅니다.
   ```
   https://5seoyoung.github.io
   http://localhost:3000
   ```
   - 경로(`/onmom_web`)는 넣지 않습니다. 등록한 도메인에서만 지도가 뜹니다.
4. ✅ **카카오맵** — **[카카오맵] > [사용 설정]** 상태 **ON**.
   - 꺼지면 지도·장소 검색이 "disabled OPEN_MAP_AND_LOCAL service"(403)로 실패합니다.
5. ✅ **카카오 로그인** — **[카카오 로그인] > [사용 설정]** 상태 **ON**.
6. ✅ **리다이렉트 URI** — **[앱] > [플랫폼 키] > [REST API 키] > [카카오 로그인 리다이렉트 URI]** 에 아래 주소가 있는지 봅니다.
   ```
   https://movrwmoniopgetdmagon.supabase.co/auth/v1/callback
   ```
   GitHub Pages 주소가 **아닙니다**. 카카오 → Supabase → 온맘 사이트 순서로 돌아옵니다.
7. ⬜ **동의항목** — **[카카오 로그인] > [동의항목]**

   Supabase는 카카오에 아래 세 항목을 **항상 함께** 요청합니다. 하나라도 설정돼 있지 않으면 카카오 화면에 **KOE205** 오류가 납니다.

   | 항목 | 설정 | 온맘이 쓰는 곳 |
   |---|---|---|
   | 닉네임 `profile_nickname` | 선택 동의 | 화면에 보이는 이름(안 주면 "카카오 사용자") |
   | 프로필 사진 `profile_image` | 선택 동의 | 쓰지 않음 |
   | 카카오계정(이메일) `account_email` | 선택 동의 | 쓰지 않음 |

   - 각 항목의 **동의 목적**에는 처리방침과 같은 말을 씁니다(예: "서비스 내 이름 표시", "계정 식별"). CPO가 LAUNCH_CHECKLIST 1-5에서 확정합니다.
   - 이메일 항목은 **비즈 앱**에서만 켤 수 있습니다. **[앱] > [일반] > [비즈니스 정보]** 에서 비즈 앱으로 전환합니다(사업자등록번호가 없으면 본인인증 후 **개인 개발자 비즈 앱**).
   - 이메일을 **선택 동의**로 두고 B-2의 **Allow users without an email**을 켜면, 사용자가 이메일 동의를 빼도 로그인됩니다.
   - 사용자가 동의한 닉네임·이메일·사진 주소는 Supabase 로그인 계정에 저장됩니다. 처리방침에 적혀 있어야 합니다(LAUNCH_CHECKLIST 1-2).
8. ⬜ **클라이언트 시크릿 활성화 확인** — **[앱] > [플랫폼 키] > [REST API 키] > [클라이언트 시크릿]**
   - 코드는 만들어 두었습니다. **활성화 상태가 ON(사용함)** 인지 봅니다.
   - 이 코드는 B-2에만 넣습니다. 코드를 다시 만들면 B-2도 새 코드로 바꿔야 로그인이 됩니다.

---

## B. Supabase 대시보드

<https://supabase.com/dashboard/project/movrwmoniopgetdmagon> 을 엽니다.

1. **가입·로그인 방식** — 왼쪽 **Authentication → Sign In / Providers** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/auth/providers)), 위쪽 **User Signups** 묶음:
   | 설정 | 값 | 이유 |
   |---|---|---|
   | **Allow new users to sign up** | ON | 첫 카카오 로그인·게스트 시작 때 계정이 생김 |
   | **Allow anonymous sign-ins** | ON | 게스트 = 익명 계정 |
   | **Allow manual linking** | ON | 게스트가 카카오로 로그인할 때 **같은 계정에 카카오를 붙임**. 끄면 연결이 실패 |

   줄마다 바꾼 뒤 **Save**를 누릅니다.
2. **카카오 연결** — 같은 화면 아래 **Auth Providers** 목록:
   - **Kakao**를 펼쳐 켜고(Enable), 아래를 넣은 뒤 **Save**
     - **REST API Key**(Client ID): A-2의 REST API 키
     - **Client Secret Code**: A-8의 코드
     - **Allow users without an email**: **ON**
     - 화면에 보이는 **Callback URL**이 A-6의 주소와 같은지 확인
   - **Email**은 **끕니다**. 온맘은 쓰지 않고, 켜 두면 누구나 공개 키로 이메일 계정을 만들 수 있습니다. **Phone** 등 나머지도 꺼져 있는지 봅니다.
3. **돌아올 주소** — **Authentication → URL Configuration** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/auth/url-configuration))
   - **Site URL**: `https://5seoyoung.github.io/onmom_web/` → **Save**
   - **Redirect URLs** → **Add URL**로 두 개:
     - `https://5seoyoung.github.io/onmom_web/auth/callback/`
     - `http://localhost:3000/auth/callback/` (개발자가 내 컴퓨터에서 확인할 때)

   끝의 `/`까지 똑같아야 합니다. 목록에 없으면 로그인이 끝나지 않고 소개 페이지로 돌아옵니다.
4. **공개 키 복사** — **Project Settings → API Keys** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/settings/api-keys))
   - **Publishable key**(`sb_publishable_…`)를 복사해 둡니다(C-3).
   - 같은 화면의 **Secret keys**는 누르지도, 복사하지도 않습니다.
   - ⚠️ 같은 화면 **Secret keys**의 `default` 키를 **지우거나 다시 만들지 않습니다** — AI 상담 함수가 로그인 확인에 씁니다(Supabase가 함수에 자동으로 넣어 줌).
   - 같은 화면에 **Legacy API keys** 탭(예전 방식 `anon`·`service_role`)이 있으면, D-1을 돌린 뒤 **Edge Functions → chat → Logs**에 `{"startup":"ok","server_key":"secret_keys"}` 줄이 보일 때 꺼도 됩니다(AI 상담 함수는 새 Secret key를 먼저 읽습니다). 그 줄을 보기 전에는 끄지 않습니다.
   - 2025년 11월 이후 만든 프로젝트에는 Legacy 탭이나 `service_role` 키가 **없을 수 있습니다**(정상). D-1 실행 결과에 경고 **"AI 상담 — 로그인 확인 불가"**가 뜨면 `default` Secret key가 없거나 바뀐 것이니 개발자에게 알립니다(LAUNCH_CHECKLIST 5-6 전에 해결).
5. **데이터베이스 비밀번호** — 프로젝트를 만들 때 정한 비밀번호입니다(C-1).
   모르면 **Database → Settings**(또는 **Project Settings → Database**) ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/database/settings)) → **Reset database password**로 새로 정하고, 비밀번호 관리 도구에 저장합니다. 몇 분 뒤부터 새 비밀번호가 쓰입니다.
6. **(선택, 권장) CAPTCHA — 게스트 계정을 기계로 대량으로 만드는 것 막기** (Cloudflare Turnstile)
   1) Cloudflare 대시보드 → **Turnstile → Add widget**: Hostname에 `5seoyoung.github.io`와 `localhost`, 모드는 **Managed** → **Site Key**와 **Secret Key**가 나옵니다.
   2) GitHub Variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY`에 **Site Key**를 넣고(C-3 방법) **사이트를 다시 배포**(D-2)합니다.
   3) 배포가 끝난 **뒤에** Supabase **Authentication → Attack Protection**(예전 이름 Bot and Abuse Protection) ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/auth/protection)) → **Enable CAPTCHA protection** 켜기, 공급자 **Turnstile by Cloudflare**, **Secret key** 칸에 **Secret Key** → **Save**.

   ⚠️ **순서가 중요합니다.** 3을 먼저 하면 사이트가 CAPTCHA 없이 요청해 익명 계정을 만들지 못합니다. 그러면 게스트는 **서버 계정 없이 이 브라우저 전용으로** 시작되고, 동의해도 기록이 서버에 올라가지 않습니다. 끌 때는 반대로 3(Supabase)을 먼저 끄고 2(Variable)를 지웁니다.
   - Turnstile을 켜면 Cloudflare(미국)로 기기 신호가 갑니다. 처리방침에 들어 있는지 확인합니다(LAUNCH_CHECKLIST 1-3).
7. **(선택) 요청 한도** — **Authentication → Rate Limits** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/auth/rate-limits))
   익명 로그인(게스트 시작)은 기본이 **IP 하나당 한 시간에 30번**입니다. 통신사·회사 망처럼 여러 사람이 같은 IP로 나가면 걸릴 수 있습니다. 사용자가 늘면 CAPTCHA(6)를 켠 뒤 올립니다.

---

## C. GitHub에 값 넣기

<https://github.com/5seoyoung/onmom_web> → **Settings → Secrets and variables → Actions**

- **Secrets** 탭: 비밀 값. 넣은 뒤에는 다시 볼 수 없고 바꾸기만 됩니다. 로그에도 가려집니다.
- **Variables** 탭: 공개값. 사이트 번들에 그대로 들어갑니다.

### C-1. Secrets 탭 → New repository secret

| Name | 값 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | <https://supabase.com/dashboard/account/tokens> (Supabase 오른쪽 위 계정 → **Account preferences → Access Tokens**) → **Generate new token** → 이름 `github-actions-onmom` → 만든 토큰 |
| `SUPABASE_DB_PASSWORD` | B-5의 데이터베이스 비밀번호 |
| `ANTHROPIC_API_KEY` | Claude Console <https://console.anthropic.com> (지금은 platform.claude.com으로 이동) → **Settings → API keys → Create Key** 로 만든 키. **AI 상담을 켤 때만** 필요하고, 지금은 비워 둬도 됩니다 |

- `SUPABASE_ACCESS_TOKEN`은 **내 Supabase 계정의 모든 프로젝트를 바꿀 수 있는** 토큰입니다. 이 Secret 말고 어디에도 두지 않습니다. 만료일을 정했다면 달력에 적어 두세요(만료되면 D-1이 "Unauthorized"로 실패).
- Anthropic 키를 만들면 콘솔의 **Settings → Limits**에서 월 사용 한도도 정합니다.

### C-2. Variables 탭 → New repository variable (Supabase 워크플로용)

| Name | 값 |
|---|---|
| `SUPABASE_PROJECT_REF` | `movrwmoniopgetdmagon` (필수) |
| `VIDEO_API_URL` | `https://hackathon-video-api.onrender.com` (선택 — 넣은 적이 없으면 함수 기본값이 이 값) |
| `ALLOWED_ORIGINS` | `https://5seoyoung.github.io,http://localhost:3000` (선택 — 넣은 적이 없으면 함수 기본값이 이 값. 도메인을 사면 쉼표로 더함) |
| `CHAT_HOURLY_LIMIT` | AI 상담 한 사람의 1시간 요청 수, 1~1000 (선택 — 넣은 적이 없으면 함수 기본값 30). **AI 상담을 처음 켤 때는 `10` 권장** |
| `CHAT_GLOBAL_DAILY_LIMIT` | AI 상담 전체의 하루 요청 수 (선택 — 넣은 적이 없으면 함수 기본값 500). 비용 상한 역할 |

- 한 번 넣은 값은 Variable을 지워도 **서버에 남습니다**(워크플로는 빈 값을 건너뛸 뿐 지우지 않음). 기본값으로 되돌리려면 Supabase **Edge Functions → Secrets** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/functions/secrets))에서 그 이름을 지웁니다.
- AI 상담 한도가 낮을수록 한 사람이 게스트 계정을 여러 개 만들어 하루 전체 한도(`CHAT_GLOBAL_DAILY_LIMIT`)를 다 써 버리기 어렵습니다. CAPTCHA(B-6)와 함께 씁니다(LAUNCH_CHECKLIST 5-0).

### C-3. Variables 탭 — 사이트용 (**D-1이 성공하고 LAUNCH_CHECKLIST 1~3단계를 마친 뒤에** 넣습니다)

넣고 사이트를 다시 배포하면(D-2) **공개 사이트에 바로 켜집니다.**

| Name | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://movrwmoniopgetdmagon.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | B-4의 Publishable key(`sb_publishable_…`) |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | A-2의 JavaScript 키 |
| `NEXT_PUBLIC_AI_CHAT_ENABLED` | `false` — LAUNCH_CHECKLIST 5단계를 마친 뒤에만 `true` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | (선택) B-6의 Site Key |

- `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`는 **둘 다** 있어야 켜집니다. 하나만 있으면 지금처럼 동작합니다.
- 지도(`NEXT_PUBLIC_KAKAO_JS_KEY`)는 Supabase와 따로 켜집니다. 지도만 먼저 켜도 됩니다.
- 이름에 `NEXT_PUBLIC_`이 붙은 값은 누구나 사이트에서 읽을 수 있습니다. 비밀을 넣지 않습니다.

---

## D. 실행

### D-1. Supabase 워크플로 (DB 표 + 서버 함수)

1. 저장소 **Actions** 탭 → 왼쪽 **Supabase** → 오른쪽 **Run workflow** → Branch **main** → **Run workflow**
   - Branch는 꼭 **main**. 다른 브랜치를 고르면 운영 DB를 건드리지 않도록 작업이 **건너뜀(skipped)**으로 끝납니다.
2. 3~7분 뒤 초록 체크(✓)가 뜨면 성공입니다. 하는 일:
   1) 설정 확인(빠진 값이 있으면 무엇이 빠졌는지 알리고 멈춤) → 2) 테스트(`npm test` — 실패하면 아무것도 바꾸지 않고 멈춤) → 3) 프로젝트 연결 → 4) DB 표 만들기·고치기(`supabase/migrations`의 파일 중 아직 적용하지 않은 것을 번호 순서로) → 5) 함수 비밀값 넣기(`ANTHROPIC_API_KEY`·`VIDEO_API_URL`·`ALLOWED_ORIGINS`·`CHAT_*` 중 값이 있는 것만) → 6) 함수 `videos`·`chat` 배포 → 7) 배포 확인(AI 상담 함수가 로그인을 확인할 수 있는지 한 번 불러 봄 — AI는 부르지 않음)
   - 실행 화면 아래 **Summary**에 결과가 한국어로 나옵니다. 경고(노란 ⚠)는 초록 체크여도 읽습니다. 특히 **"AI 상담 — 로그인 확인 불가"**는 B-4를 보고 개발자에게 알립니다.
3. 확인(Supabase 대시보드):
   - **Table Editor**에 `user_states`, `admins`, `llm_usage`(AI 상담 횟수 — 사용자 id와 시각만) 표가 있고 모두 **RLS enabled**가 보임
   - **Edge Functions**에 `videos`, `chat`이 보임
   - **Database → Migrations**에 `0001`부터 저장소의 마지막 번호까지 보임
   - **Edge Functions → Secrets**에 넣은 이름이 보임(값은 보이지 않는 게 정상)
   - **Edge Functions → chat → Logs**에 `missing_env`가 있으면 `names`에 `SUPABASE_`로 시작하는 이름이 **없음**(`ANTHROPIC_API_KEY`는 LAUNCH_CHECKLIST 5단계 전까지 있어도 정상). 있으면 B-4를 보고 개발자에게
4. 빨간 ✗면 실행 화면 맨 위 **Annotations**의 한국어 메시지를 보고 I(문제 해결)로 갑니다.

- 예전 안내대로 `0001_user_states.sql`을 SQL Editor에서 직접 실행한 적이 있어도 됩니다. 워크플로가 번호 순서로 다시 적용하고, 파일은 다시 실행해도 같은 결과가 되게 쓰여 있습니다(예전 판으로 만든 `user_states` 표에는 동의 칸을 더함).
- 이후 `supabase/` 폴더가 바뀐 채로 main에 올라가면 이 워크플로가 **자동으로** 돕니다. 값(C-1·C-2)을 넣기 전의 자동 실행은 알림만 남기고 건너뜁니다.
- 인증 설정(B)은 이 워크플로가 건드리지 않습니다. 대시보드가 기준입니다.

### D-2. 사이트 다시 배포

1. C-3 값을 넣습니다.
2. **Actions** 탭 → 왼쪽 **Deploy to GitHub Pages** → **Run workflow** → Branch **main** → **Run workflow**
3. 3~5분 뒤 초록 체크. 이제 공개 사이트에 켜졌습니다.

Variables를 바꿀 때마다 D-2를 다시 해야 사이트에 반영됩니다(main에 push해도 됩니다).

---

## E. 나를 관리자로

1. 휴대폰이나 PC로 <https://5seoyoung.github.io/onmom_web/login/> → **카카오로** 로그인 → 온보딩을 마칩니다. **게스트는 관리자가 될 수 없습니다.**
2. <https://5seoyoung.github.io/onmom_web/admin/> 을 엽니다 → "권한이 없어요" 아래 **내 계정 ID**를 복사합니다.
   (또는 Supabase **Authentication → Users** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/auth/users))에서 내 카카오 계정 줄의 **UID**)
3. Supabase **SQL Editor → New query** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/sql/new))에 붙여 넣고 **Run** — `'` 안의 글자를 2의 ID로 바꿉니다.
   ```sql
   insert into public.admins (user_id) values ('여기에-내-계정-ID');
   ```
   "Success. No rows returned"가 나오면 됩니다.
4. `/admin/`을 새로고침하면 집계가 보입니다.

- 해제: `delete from public.admins where user_id = '그 계정 ID';`
- 관리자 화면에는 **집계와 계정 정보(계정 ID, 가입·접속 시각, 게스트/카카오, 동의 판, 서버 기록 유무와 마지막 저장일)만** 나옵니다. 건강 기록·이메일·닉네임은 나오지 않습니다.
- 대시보드 **Table Editor**에서 `user_states`의 `state` 칸(건강 기록)은 열지 않습니다(LAUNCH_CHECKLIST 1-6).
- 관리자는 카카오 계정으로 들어오므로, 그 카카오 계정의 **2단계 인증**을 켜 둡니다.

---

## F. 켠 뒤 확인 (휴대폰 1대 + PC 1대)

대시보드에서 볼 곳: **Authentication → Users**(게스트는 Anonymous로 표시), **Table Editor → `user_states`의 행 개수만**.

- [ ] 1. **[휴대폰]** 소개 페이지 → **시작하기** → **게스트로 시작** → 온보딩 → 홈. Users에 익명 사용자가 하나 늘어남
- [ ] 2. **[휴대폰]** 온보딩의 **서버 저장 동의** 전에는 `user_states` 행이 생기지 않음. 동의하고 온보딩을 마치면 한 행 생김
- [ ] 3. **[휴대폰]** 기록 하나 → 새로고침 → 그대로
- [ ] 4. **[휴대폰]** 같은 브라우저에서 **카카오로 로그인** → 기록 그대로. Users에서 둘 중 하나면 정상: (가) **같은 UID**의 사용자가 익명에서 카카오로 바뀜(카카오 이메일이 확인된 계정), (나) 카카오 사용자가 **새 UID**로 생기고 1의 익명 사용자는 사라짐(이메일이 없거나 확인되지 않은 카카오 계정 — Supabase가 연결을 거절해 카카오로 새로 로그인하고 게스트 기록을 합침). 익명 사용자와 카카오 사용자가 **둘 다 남아 있으면** 개발자에게
- [ ] 5. **[PC]** 같은 카카오 계정으로 로그인 → 온보딩 없이 홈, 휴대폰에서 쓴 기록이 보임
- [ ] 6. **[PC 시크릿 창]** 게스트로 시작 → 기록 하나 → 4와 **같은 카카오 계정**으로 로그인 → 그 계정으로 들어가고 방금 기록이 합쳐져 있음. Users에서 방금 만든 익명 사용자가 사라짐
- [ ] 7. **[둘 다]** 운동 탭 → 영상 목록이 뜸(영상 서버가 잠들어 있으면 처음 한 번 1분 가까이 걸릴 수 있음)
- [ ] 8. **[둘 다]** 가까운 산부인과 → 지도와 핀이 뜸
- [ ] 9. **[둘 다]** AI 상담 → "준비 중"(`NEXT_PUBLIC_AI_CHAT_ENABLED=false`)
- [ ] 10. **[PC]** 설정 → 로그아웃 → 다시 카카오 로그인 → 기록이 돌아옴
- [ ] 11. **[시험용 카카오 계정]** 설정 → 계정 삭제 → Users와 `user_states`에서 사라짐. **관리자 계정으로 하지 않습니다**(관리자 지정도 함께 지워짐)
- [ ] 12. **[PC]** `/admin/` 숫자가 위 동작과 맞고, 건강 기록 내용이 없음
- [ ] 13. 휴대폰 세로 화면과 PC 넓은 화면 모두에서 위 화면들이 깨지지 않음
- [ ] 14. 시험하며 만든 게스트·카카오 계정을 **Authentication → Users**에서 지움(실제 사용자 수에 섞이지 않게). **E에서 관리자로 지정한 카카오 계정은 지우지 않습니다**(지우면 관리자 지정도 함께 사라짐)

---

## G. 되돌리기 (끄기)

| 무엇을 | 어떻게 | 결과 |
|---|---|---|
| **전체**(Supabase) | Variables에서 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 지움 → D-2 | 사이트가 지금처럼 **브라우저에만 저장하는 게스트**로 돌아감. 카카오 버튼 "준비 중", 서버로 아무것도 보내지 않음. 쓰던 사람의 기록은 그 브라우저에 남음. 서버의 데이터는 지워지지 않음 |
| **AI 상담만** | ① `NEXT_PUBLIC_AI_CHAT_ENABLED`를 `false`로 → D-2 (**화면만 숨김** — 서버 함수는 여전히 AI를 부를 수 있음) ② 실제로 멈추려면 GitHub Secret `ANTHROPIC_API_KEY`를 **먼저** 지우고 → Supabase **Edge Functions → Secrets** ([바로 가기](https://supabase.com/dashboard/project/movrwmoniopgetdmagon/functions/secrets))에서 `ANTHROPIC_API_KEY` 삭제(즉시 멈춤). 순서를 바꾸면 D-1의 다음 자동 실행이 키를 되살립니다 | AI 상담 "준비 중", 서버에서도 Anthropic을 부르지 않음 |
| **지도만** | `NEXT_PUBLIC_KAKAO_JS_KEY`를 지움 → D-2 | 산부인과 찾기 "준비 중" |
| **CAPTCHA** | Supabase **Attack Protection**에서 먼저 끄고 → Variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY`를 지움 → D-2 | CAPTCHA 없이 게스트 시작 |

- 워크플로 값(C-1·C-2)은 지워도 이미 배포된 함수·표·서버 비밀값은 그대로입니다. 사이트를 끄는 것은 사이트 Variables(C-3)이고, 서버 비밀값을 지우는 것은 Supabase **Edge Functions → Secrets**입니다(C-2).

**비밀이 새었을 때**
- 액세스 토큰: <https://supabase.com/dashboard/account/tokens> 에서 **Revoke** → 새로 만들어 `SUPABASE_ACCESS_TOKEN` 교체
- DB 비밀번호: B-5로 재설정 → `SUPABASE_DB_PASSWORD` 교체
- Anthropic 키: 콘솔에서 지움 → 새 키로 `ANTHROPIC_API_KEY` 교체 → D-1 다시 실행
- 카카오 클라이언트 시크릿: A-8에서 다시 만듦 → B-2 교체
- 공개값(Publishable key·JavaScript 키)은 원래 공개라 새어도 문제가 아닙니다. 데이터는 RLS(본인 행만)가 지키고, JavaScript 키는 A-3 도메인에서만 동작합니다.

---

## H. 동작 요약

| 상황 | Supabase 값 없음(지금 배포) | Supabase 값 있음 |
|---|---|---|
| 게스트로 시작 | 브라우저에만 저장. 서버 요청 없음 | **동의 전에 바로** 익명 계정 생성(계정 ID·가입/접속 시각·Auth 로그의 IP가 Supabase에 남음 — 기존 이용자도 켠 뒤 첫 방문 때 자동으로, LAUNCH_CHECKLIST 1-10). 건강 기록은 **지금 판의 서버 저장 동의** 전에는 올리지 않음. 동의 뒤 기록이 서버(서울)에 저장. 익명 계정을 못 만들면(꺼짐·요청 한도·CAPTCHA·오프라인) 이 브라우저 전용 게스트로 시작하고 다음 방문 때 다시 시도 |
| 게스트가 카카오로 로그인 | — (버튼 준비 중) | 같은 계정에 카카오를 붙임(기록·계정 ID 그대로). Supabase가 연결을 거절하면(카카오 이메일이 없거나 확인되지 않음 등 — 취소 말고 모든 거절) 아래 줄처럼 카카오로 새로 로그인해 게스트 기록을 합치고 익명 계정을 지움 → 계정 ID가 바뀜 |
| 그 카카오가 이미 다른 온맘 계정 | — | 그 계정으로 로그인 → 게스트 기록을 그 계정에 합침(기록은 지우지 않고 모두 남김) → 게스트 익명 계정은 지움 |
| 다른 기기에서 로그인 | — | 서버 기록과 그 기기 기록을 합침. 서버에서 먼저 읽기 전에는 절대 쓰지 않음 |
| 동의 문구의 판이 바뀜 | — | 다음에 열 때 **동의 화면만** 다시 나옴(`/onboarding/?consent=1`). 다시 동의할 때까지 올리지 않음 |
| 쓰는 중 | 브라우저에 저장 | 바뀌면 모아서 저장. 실패하면 브라우저에 두고 다시 시도 |
| 로그아웃(설정, 카카오) | 기록은 브라우저에 남음 | 남은 변경을 먼저 저장 → 로그아웃 → 공용 PC에 남지 않게 브라우저 사본 삭제. 못 올린 기록이 있으면 경고 후 사용자가 고름 |
| 계정 삭제(설정) | 브라우저의 온맘 데이터 삭제 | 서버의 기록·로그인 계정을 **먼저** 지우고, 성공했을 때만 브라우저를 비움 |
| 운동 영상 | `NEXT_PUBLIC_VIDEO_URL`이 있으면 직접, 없으면 준비 중 | Supabase 함수 `videos`를 거침(사용자 식별값 없음) |
| AI 상담 | 준비 중 | `NEXT_PUBLIC_AI_CHAT_ENABLED=true`일 때만. 함수 `chat`이 로그인 토큰을 확인한 뒤 Anthropic에 **대화 내용(같은 대화의 최근 질문과 AI 답변, 최대 20개)·산후 주차·분만 방식·수유 여부**만 보냄(약물 체크는 표에 없는 항목 이름 하나) |
| 관리자 화면 | 열 수 없음 | E에서 지정한 카카오 계정만. 집계·계정 정보만 |

---

## I. 문제 해결

| 증상 | 원인 · 해결 |
|---|---|
| 카카오 화면에 **KOE205** | 동의항목 3개 중 설정 안 된 것이 있음 → A-7 |
| 카카오 화면에 **KOE006** | 리다이렉트 URI가 다름 → A-6 |
| 카카오 화면에 **KOE004** | 카카오 로그인이 꺼져 있음 → A-5 |
| 로그인 후 소개 페이지로 오고 주소에 `?code=`가 붙어 있음 | Redirect URLs에 콜백 주소가 없음(끝 `/` 포함) → B-3 |
| "카카오 응답을 처리하지 못했어요" | 로그인을 시작한 브라우저와 돌아온 브라우저가 다름(카카오톡 인앱 브라우저 ↔ 기본 브라우저). 같은 브라우저에서 다시. Supabase의 Kakao 키·시크릿(B-2)과 A-8 활성화도 확인 |
| 이메일 동의를 빼면 로그인 실패 | B-2 **Allow users without an email** |
| 게스트가 Users에 안 생기고 기록이 서버에 안 올라감 | B-1 **Allow anonymous sign-ins**가 꺼짐 / CAPTCHA를 켰는데 사이트에 사이트 키가 없음(B-6 순서) / 한 IP에서 너무 많이 시작함(B-7) |
| 게스트에서 카카오 로그인이 실패("manual linking" 관련 오류) | B-1 **Allow manual linking** |
| "기록을 불러오지 못했어요" | D-1을 아직 안 돌렸거나 실패함. 또는 프로젝트가 일시 중지됨(무료 요금제는 7일 동안 활동이 적으면 멈춤 → 대시보드에서 **Restore**, LAUNCH_CHECKLIST 2-1). ⚠️ 2025년 11월 이후 Restore한 프로젝트는 **예전 방식 키(Legacy)가 돌아오지 않습니다** — Restore 뒤 D-1을 다시 돌려 경고 "AI 상담 — 로그인 확인 불가"가 없는지 봅니다(B-4) |
| 지도가 안 뜸 | A-3 도메인, A-4 카카오맵 ON, C-3 `NEXT_PUBLIC_KAKAO_JS_KEY` 확인 → D-2 |
| 영상이 안 뜸 | D-1에서 함수가 배포됐는지(**Edge Functions**에 `videos`), 함수 **Logs**. 영상 서버가 잠들어 있으면 1분쯤 뒤 다시 |
| AI 상담이 "준비 중"이 아닌데 답이 안 옴 | `ANTHROPIC_API_KEY`가 서버에 있는지(D-1 경고 "AI 상담 꺼짐"), D-1 경고 "AI 상담 — 로그인 확인 불가"(B-4의 Secret key `default`·Legacy 키), 요청 한도(C-2), **Edge Functions → chat → Logs**의 `code` |
| D-1 **값이 없습니다** | 메시지에 적힌 Secret/Variable을 C-1·C-2대로 넣음 |
| D-1 **테스트** 단계가 빨간 ✗ | 저장소의 코드 테스트가 실패함 — 아무것도 바뀌지 않았습니다. 개발자에게 |
| D-1이 **skipped**(회색)로 끝남 | Run workflow에서 Branch를 main이 아닌 것으로 고름 → main으로 다시 |
| D-1 **SUPABASE_PROJECT_REF 형식** | 주소 전체가 아니라 `movrwmoniopgetdmagon`만 |
| D-1 **… 형식**(ALLOWED_ORIGINS·CHAT_*·따옴표) | 메시지대로 값을 고쳐 다시 넣음 |
| D-1 `password authentication failed` | DB 비밀번호가 다름 → B-5 재설정 → `SUPABASE_DB_PASSWORD` 교체 |
| D-1 `Unauthorized` · `access token` | 액세스 토큰 만료·폐기 → C-1로 새로 |
| D-1 `Remote migration versions not found in local migrations directory` 또는 `Found local migration files to be inserted before the last migration` | 대시보드나 다른 도구로 마이그레이션을 따로 적용한 기록이 있음. 개발자가 `supabase migration list`로 비교하고 `supabase migration repair`로 기록을 맞춤 |

---

## J. 알려진 한계

- **게스트(익명) 계정은 그 브라우저의 로그인 정보로만 다시 들어갈 수 있습니다.** 브라우저 데이터를 지우거나 다른 기기에서 열면 그 게스트 계정과 서버 기록에 다시 들어갈 방법이 없습니다. 오래 쓸 사람에게는 카카오 연결을 권합니다. 남은 익명 계정을 언제 정리할지는 LAUNCH_CHECKLIST 2-6.
- **카카오 "연결 끊기"는 하지 않습니다.** 계정 삭제는 온맘 서버의 기록과 로그인 계정을 지우지만 카카오 쪽 앱 연결은 남습니다(카카오 Admin 키가 필요). 사용자는 카카오 계정 설정에서 끊을 수 있습니다.
- **iOS 앱은 아직 이 서버를 쓰지 않습니다.**
- **`supabase config push`는 실행하지 않습니다.** `supabase/config.toml`에는 인증 설정이 없어서, 올리면 대시보드의 인증 설정(카카오·익명 로그인·주소)이 기본값으로 덮입니다.
- 서버를 켠 사이트는 아직 실제 Supabase·카카오로 끝에서 끝까지 돌려 본 적이 없습니다. F를 빠짐없이 합니다.

켜기 전·켠 뒤에 확인할 법·운영·제품 항목은 [`docs/LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)에 순서대로 있습니다.
