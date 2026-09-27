# Supabase Edge Functions — `videos` · `chat`

온맘 웹은 GitHub Pages의 정적 사이트라 서버 코드가 없습니다. 브라우저가 직접 할 수 없는 두 가지를 Supabase Edge Function(Deno)이 맡습니다.

| 함수 | 하는 일 | 로그인 | 게이트웨이 JWT 확인 |
|---|---|---|---|
| `videos` | 운동 영상 목록 프록시. 영상 서버(Render)에 CORS가 없어 브라우저가 직접 부르지 못한다 | 필요 없음(공개 목록) | 끔 `verify_jwt = false` |
| `chat` | AI 상담(`patient_edu`)과 약물 체크의 표에 없는 항목(`substance`)을 Anthropic(Claude)에 묻는다 | 필요(익명 게스트 포함). 함수 안에서 확인 | 끔 `verify_jwt = false` — 함수가 `auth.getUser`로 직접 확인 |

운영자용 켜는 순서는 [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md), 켜기 전 법·개인정보 항목은 [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) 5단계. 이 문서는 개발자용 설명입니다.

---

## 1. 파일

| 파일 | 내용 | 누가 읽나 |
|---|---|---|
| `supabase/functions/_shared/cors.ts` | origin 허용 목록, CORS 헤더, JSON 응답(실패는 `{ ok: false, code }`만) | Deno · vitest · Next tsc |
| `supabase/functions/_shared/videos.ts` | `?include=&limit=` 검증, 업스트림 주소, 응답 정리(알려진 필드만) | 〃 |
| `supabase/functions/_shared/chat.ts` | 요청 검증, 컨텍스트 허용 목록, 한도 기본값, Bearer 토큰 | 〃 |
| `supabase/functions/_shared/prompts.ts` | 모델·베타 헤더·시스템 프롬프트(서버만 가짐)·약물 답 형식(structured outputs) | 〃 |
| `supabase/functions/_shared/safety.ts` | 자해·자살 표현 선필터와 고정 위기 안내(content.json 원문 사본). **웹도 같은 목록을 쓴다**(5-4) | Deno · vitest · Next tsc · 웹 번들 |
| `supabase/functions/_shared/auth.ts` | 서버 키 고르기(`SUPABASE_SECRET_KEYS` "default" → 예전 `SUPABASE_SERVICE_ROLE_KEY`), 로그인 확인 오류 나누기(401 / 503) | Deno · vitest · Next tsc |
| `supabase/functions/videos/handler.ts` · `chat/handler.ts` | 요청 처리(의존성 주입). 웹 표준 Request/Response만 써서 Node에서도 돈다 | Deno · vitest · Next tsc |
| `supabase/functions/chat/adapters.ts` | 바깥 연결을 클라이언트를 받아 만드는 함수로: 로그인 확인(`auth.getUser`)·한도(`rpc`)·LLM 호출(요청 본문, `stop_reason` 확인, 대체 모델 여부, SDK 오류 → 코드). SDK를 가져오지 않는다 | Deno · vitest · Next tsc |
| `supabase/functions/videos/index.ts` · `chat/index.ts` | Deno 연결만: 환경 변수, `npm:` SDK·supabase-js를 만들어 위 함수에 넣음, `Deno.serve` | Deno(`deno check`) |
| `supabase/migrations/0003_llm_usage.sql` | AI 호출 기록 표 `llm_usage` + 한도 함수 `llm_consume_quota()` | `supabase db push` |
| `src/api/video.ts` · `src/api/llm.ts` | 웹 쪽 호출(Supabase가 없으면 예전 주소) | 웹 |
| `src/features/chat/aiConsent.ts` · `AiConsentCard.tsx` | AI 국외 이전 동의(처음 쓸 때) | 웹 |

테스트: `src/api/edgeFunctions.test.ts`(공용 모듈·웹과 값 맞추기·SQL), `src/api/edgeHandlers.test.ts`(요청 처리 전체), `src/api/edgeAdapters.test.ts`(서버 키·로그인 확인·한도·LLM 호출 — 가짜 클라이언트), `src/api/llm.test.ts`·`video.test.ts`·`backendConfig.test.ts`(웹 연결), `src/features/chat/chatModel.test.ts`(위기 표현·거절 문구)·`aiConsent.test.ts`(동의 카드·판).

---

## 2. 비밀값 · 환경 변수

함수 비밀값은 Supabase **Edge Functions → Secrets**에 있습니다. 보통은 GitHub Actions "Supabase" 워크플로(`.github/workflows/supabase.yml`)가 GitHub Secrets·Variables에서 옮겨 넣습니다(SUPABASE_SETUP C·D-1).

| 이름 | 쓰는 함수 | 기본값 | 공개 여부 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | chat | 없음 → chat은 `503 not_configured` | **비밀** — GitHub Secret → 함수 비밀에만 |
| `VIDEO_API_URL` | videos | `https://hackathon-video-api.onrender.com` | 공개값. https만(로컬 개발은 `http://localhost`) |
| `ALLOWED_ORIGINS` | 둘 다 | `https://5seoyoung.github.io,http://localhost:3000` | 공개값. 쉼표 구분, 경로는 떼고 origin만 씀 |
| `CHAT_HOURLY_LIMIT` | chat | 30 (1~1000) | 공개값 |
| `CHAT_GLOBAL_DAILY_LIMIT` | chat | 500 | 공개값 — 비용 상한 |
| `SUPABASE_URL` | chat | Supabase가 자동으로 넣음 | 공개값 |
| `SUPABASE_SECRET_KEYS` → 없으면 `SUPABASE_SERVICE_ROLE_KEY` | chat | Supabase가 자동으로 넣음(사람이 옮기지 않음) | **서버 키 — 함수 안에서만.** 새 방식 secret 키 JSON(`{"default":"sb_secret_…"}`)의 `"default"`를 먼저 쓰고, 없으면 예전 방식 service_role 키. 둘 다 없으면 chat은 모두 `503 auth_unavailable` |

- **서버 키**: 2025-11 이후 만든 프로젝트에는 예전 방식 키(Legacy API keys)가 없을 수 있고, 예전 키는 2026년 말 삭제 예정입니다. 함수는 새 secret 키를 먼저 읽으므로 **Legacy API keys를 꺼도 됩니다** — 단 **Project Settings → API Keys → Secret keys의 `default` 키를 지우거나 다시 만들지 않습니다**(바꾸면 함수는 다음 요청부터 새 값을 받지만, 지우면 예전 키로 물러나고 그것도 없으면 `503`). 어느 키를 쓰는지는 함수 **Logs**의 시작 줄 `{"startup":"ok","server_key":"secret_keys" | "service_role"}`로 봅니다(값은 남기지 않음).

- `ALLOWED_ORIGINS`에 쓸 수 있는 항목이 하나도 없으면(오타 등) 브라우저 요청을 **모두 막습니다**(열린 쪽으로 틀리지 않게). 워크플로가 형식을 먼저 검사합니다.
- 비밀값을 바꾼 뒤에는 함수를 다시 배포하지 않아도 다음 요청부터 반영됩니다.
- 사이트(브라우저) 쪽 스위치는 GitHub Variable `NEXT_PUBLIC_AI_CHAT_ENABLED` — `"true"`일 때만 웹이 `chat`을 부릅니다(바꾼 뒤 사이트 재배포 D-2).

## 3. 배포

**보통**: `supabase/` 아래가 바뀐 채로 main에 올라가면 워크플로가 `supabase db push` → `supabase secrets set` → `supabase functions deploy videos chat` 순서로 돌립니다(값을 넣기 전의 자동 실행은 건너뜀).

**손으로**(Supabase CLI, 개발자 컴퓨터):

```bash
supabase link --project-ref movrwmoniopgetdmagon
supabase db push                                    # 0003_llm_usage.sql 포함
supabase secrets set ANTHROPIC_API_KEY=…            # 값은 터미널 기록에 남지 않게 주의(파일로: --env-file)
supabase functions deploy videos chat               # verify_jwt는 supabase/config.toml을 따른다
```

**`verify_jwt` 설정** — `supabase/config.toml`(CI 담당 파일)에 있어야 합니다:

```toml
[functions.videos]
verify_jwt = false

[functions.chat]
verify_jwt = false
```

config.toml 없이 배포한다면 `supabase functions deploy videos chat --no-verify-jwt`.
chat을 `false`로 두는 이유: 게이트웨이 확인은 공개 키(`sb_publishable_…`)만 보낸 요청도 통과시키므로 어차피 함수 안에서 사용자를 확인해야 하고,
함수 안의 `auth.getUser`는 서명뿐 아니라 계정·세션이 살아 있는지까지 봅니다. **chat의 토큰 확인을 지우면 이 값을 `true`로 되돌립니다**(아니면 누구나 Anthropic 비용을 씀).

`supabase config push`는 실행하지 않습니다 — config.toml에 인증 설정이 없어 대시보드 인증 설정을 덮습니다(SUPABASE_SETUP J).

---

## 4. `videos`

```
GET /functions/v1/videos?include=<route_vaginal_delivery | route_cesarean_section>&limit=<1~500, 없으면 500>
헤더(웹): apikey: <공개 키>        — 로그인 토큰은 보내지 않는다
→ 200 { count, videos: [{ video_id, title, url, description, tags }] }   Cache-Control: public, max-age=300, s-maxage=600
```

- include는 정확히 하나, 그 밖의 매개변수(exclude 등)는 `400 bad_request`. 업스트림을 부르지 않습니다.
- 업스트림 `{VIDEO_API_URL}/videos`를 **40초**까지 기다립니다(잠든 Render 무료 인스턴스를 깨우는 데 20~40초 — 2026-09-28 측정 21초). 웹은 45초 기다립니다.
- 업스트림 실패는 모두 `502` + 코드: `upstream_timeout` · `upstream_unreachable` · `upstream_error`(200이 아님) · `upstream_bad_response`(형식이 틀림 — 한 항목이라도 틀리면 전체 거부). 업스트림 본문·주소는 내보내지 않습니다.
- 응답은 알려진 다섯 필드만 다시 담습니다. `url`은 여전히 신뢰하지 않습니다 — 웹이 `safeExternalUrl`을 거칩니다.
- 로그: `{ fn, status, ms, code?, upstream_status? }`만. 분만 경로 태그(= 사용자의 분만 방식)는 남기지 않습니다.

## 5. `chat`

```
POST /functions/v1/chat
헤더(웹): Authorization: Bearer <Supabase 로그인 토큰> · apikey: <공개 키> · Content-Type: application/json
본문:     { preset: "patient_edu" | "substance",
            messages: [{ role: "user" | "assistant", content }],   // 1~20개, 각 2000자(코드 포인트), user로 시작·끝
            context?: { week?: 0~520 정수, delivery?: "vaginal" | "cesarean", breastfeeding?: boolean } }
```

처리 순서: CORS → 본문 256KB 상한 → **형식 검증** → **안전 선필터** → 로그인 확인 → 한도 → LLM.

| 응답 | 뜻 |
|---|---|
| `200 { ok: true, text }` | 상담 답(앞뒤 공백 정리) |
| `200 { ok: true, text, flagged: true }` | 자해·자살 표현 — LLM을 부르지 않은 고정 위기 안내 |
| `200 { ok: true, json: { verdict, detail, sources } }` | 약물 답(structured outputs, 서버에서 다시 검증) |
| `400 bad_request` | 형식 오류 · 모르는 필드(`system`·`max_tokens`·`model` …) · **컨텍스트에 세 항목 밖의 값**(BMI·목표·위험 신호·출산일 …) — 조용히 지우지 않고 거절 |
| `401 unauthorized` | 토큰 없음·틀림·만료·로그아웃·계정 삭제 — Auth가 토큰 문제 코드(`bad_jwt`·`session_not_found`·`session_expired`·`user_not_found`·`no_authorization`)나 403으로 답했을 때만 |
| `403 origin_not_allowed` · `405` · `413 too_large` | CORS 허용 목록 밖 · POST 아님 · 본문이 큼 |
| `422 flagged` | 약물 프리셋에 자해 표현 — 웹은 표 결과("정보 부족")를 그대로 둔다 |
| `422 refused` | Claude가 거절했고 대체 모델도 거절 |
| `429 rate_limited` | 이 사용자가 1시간 한도를 다 씀 |
| `502 truncated · empty · bad_output · llm_unreachable · llm_rejected · llm_error` | 답을 쓸 수 없음 |
| `503 busy` | 서비스 전체 하루 상한(`CHAT_GLOBAL_DAILY_LIMIT`) |
| `503 unavailable · auth_unavailable · not_configured · llm_busy · llm_model_unavailable` | 한도 확인 실패 · Auth 확인 실패(**서버 키가 없거나 틀림** — 게이트웨이의 코드 없는 401 "Invalid API key" 포함, Auth 장애·네트워크) · Anthropic 키 없음/틀림 · Anthropic 429·5xx · 모델을 쓸 수 없음(404) |
| `504 timeout` | Anthropic을 50초 넘게 기다림 |

웹(`src/api/llm.ts`)은 성공이 아니면 모두 실패로 보고 **앱 규칙 안내(폴백)** 로 답합니다 — 사용자에게 코드를 보이지 않습니다.

### 5-1. 안전 선필터 (`_shared/safety.ts`)

- 마지막 사용자 메시지를 NFC·소문자·공백/제로폭/하이픈/따옴표 제거 뒤 키워드로 봅니다. 걸리면 LLM·로그인·한도 없이 content.json `chat_fallback.replies.self_harm` 원문(1577-0199 · 109 · 119)을 돌려줍니다. 문구는 테스트가 content.json과 한 글자씩 비교합니다.
- 키워드 = content.json `self_harm_keywords`(단 **"사라지고"는 뺌** — "통증이 사라지고"·"붓기가 사라지고" 같은 산후 질문을 막지 않게, 대신 "사라지고 싶·사라지고만 싶"을 봄) + 보강 목록(한국어 "죽어버리고·살기 싫·극단적 선택·목숨을 끊…", "없어지고만 싶", 주어가 자기인 "내가/제가/나는/저는 사라졌으면·없어졌으면", "세상에서 사라지…"; 영어 "suicide·kill myself·want to die…"). 맨 "사라졌으면·없어졌으면"은 넣지 않았습니다("뱃살이 없어졌으면", "통증이 사라졌으면"). 보강 목록은 **임상 자문 확인 필요**.
- 함수는 **마지막** 사용자 메시지만 봅니다. 앞선 위기 턴은 웹이 빼고 보냅니다(5-4).
- 앱 규칙 폴백(`rules/chat chatReply`)은 content.json 목록 전체를 그대로 씁니다(서버가 꺼졌을 때).

### 5-2. 모델 · 프롬프트 (`_shared/prompts.ts`, `chat/adapters.ts`)

- 모델 `claude-opus-5`, `max_tokens` 16000(생각 + 답), effort `medium`. 공식 SDK(`npm:@anthropic-ai/sdk@0.128.0`)의 `client.beta.messages.create`.
- **거절 대체**: 베타 헤더 `server-side-fallback-2026-07-01` + `fallbacks: "default"` — 안전 분류기가 거절하면 거절 종류에 맞는 대체 모델이 같은 호출 안에서 이어 받습니다. `stop_reason`을 `content`보다 먼저 봅니다(`refusal` → 422, `max_tokens`·`model_context_window_exceeded` → 502, 잘린 답은 쓰지 않음). 대체 모델이 답했는지는 `usage.iterations`의 `fallback_message`로 로그에 남깁니다.
- 어시스턴트 선채움 없음. 약물 답은 structured outputs(`output_config.format` json_schema: verdict 4값 · detail · sources)로 받고 서버가 한 번 더 검증합니다(출처는 이름만 — 주소처럼 보이는 것은 뺌, 5개까지, detail 600자까지).
- 시스템 프롬프트는 서버만 가집니다(웹은 preset 이름만). 상담: 진단·등급 금지, 약 용량·복용법 금지, 의료진 상담 권유, 응급 신호 → 즉시 병원/119, 자해 → 1577-0199·109·119, 우울 상담은 하지 않고 연계, 마크다운 표·제목 금지, 3~6문장. 약물: 모르면 `unknown`, 출처는 확신하는 널리 알려진 자료 이름만, 없으면 빈 배열. **CPO·임상 자문 확인 필요**(사용자에게 직접 보이지 않는 지시문).
- 판정 경로 밖(원칙 2): 병원 신호·운동 판단은 앱 규칙이 하고, 약물 체크도 출처 있는 표가 먼저입니다. 표에 있는 항목은 AI에 묻지 않고, AI 답에는 웹이 "AI 답변" 칩과 병기 문구를 붙입니다.
- 타임아웃: 함수 50초(`AbortSignal.timeout`, SDK 재시도 1번 포함), 웹 60초.
- SDK 오류는 클래스로만 나눕니다(`APIUserAbortError`·`APIConnectionTimeoutError` → 504, `APIConnectionError` → 502, `RateLimitError`·`InternalServerError` → 503 `llm_busy`, `AuthenticationError`·`PermissionDeniedError` → 503 `not_configured`, `NotFoundError` → 503, `BadRequestError` → 502). 오류 메시지는 기록하지도 내보내지도 않습니다.
- 로그인 확인·한도·LLM 호출은 `adapters.ts`에 클라이언트를 받는 함수로 있어 vitest가 가짜 클라이언트로 확인합니다(`refusal`이면 content를 읽지 않음 등). 요청 본문 타입이 SDK와 맞는지는 `index.ts`를 `deno check`가 형 변환 없이 확인합니다.

### 5-3. 한도 (`0003_llm_usage.sql`)

- `llm_consume_quota(user, 1시간 한도, 3600초, 하루 전체 상한)`이 LLM 직전에 한 번 부릅니다: 사용자별 잠금 → 2일 지난 행 삭제 → 사용자 1시간 수 확인 → 전체 24시간 수 확인 → 한 줄 기록 → `'ok' | 'user_limit' | 'global_limit'`.
- `llm_usage`에는 **사용자 id와 시각만** 있습니다(질문·답 없음). 브라우저(anon·authenticated)는 표·함수 모두 쓸 수 없고(RLS + 권한 회수), 함수 실행 권한은 `service_role`에만 있습니다. 계정을 지우면 FK(on delete cascade)로 함께 지워집니다.
- 위기 안내(선필터)·형식 오류·로그인 실패는 한도를 쓰지 않습니다. LLM이 실패해도 한 번은 셉니다.
- 한도를 바꾸려면 GitHub Variables `CHAT_HOURLY_LIMIT`·`CHAT_GLOBAL_DAILY_LIMIT` → D-1. Anthropic 콘솔의 월 사용 한도(Settings → Limits)도 따로 걸어 둡니다.

### 5-4. 웹 쪽 (`src/api/llm.ts`, `src/features/chat`, `src/features/substance`)

- `isLLMBackendConfigured()` = Supabase 설정 **그리고** `NEXT_PUBLIC_AI_CHAT_ENABLED === "true"`. Supabase가 없는 빌드는 예전처럼 `NEXT_PUBLIC_LLM_URL`(비어 있음 → 준비 중).
- **AI 국외 이전 동의(처음 쓸 때)**: 온보딩 안내·처리방침이 약속한 대로, 서버에 처음 묻기 전에 동의 카드(`AiConsentCard`)를 띄웁니다. AI 상담은 첫 질문을 보내면, 약물 체크는 표에 없는 항목이 나오면. 동의는 이 브라우저에 계정별·판별로 남고(`onmom.web.aiConsent.v1`, 계정 삭제가 지움), 거절은 그 화면에서만 기억합니다. 동의 전에는 서버에 아무것도 보내지 않습니다.
  - 카드는 **동의 요청**입니다: 제목 "AI 답변 국외 이전 동의"·첫 문장(무엇이 어디로 가는지·거부해도 앱 안내로 답함) 아래에 전문(`consentText.ts AI_TRANSFER_NOTICE.details` — 받는 자·항목·시기와 방법·목적·보유 기간·거부 방법)을 **접지 않고** 보이며, 중요한 줄은 크게·굵게·밑줄입니다.
  - 카드 글자(제목·첫 문장·전문)를 바꾸면 `aiConsent.ts AI_CONSENT_VERSION`을 올립니다 — `aiConsent.test.ts`가 글자의 지문을 판에 묶어 두어 판을 올리지 않으면 실패합니다(지금 판 `web-2026-09-28.2`).
- **위기 표현(자해·자살)**: 웹은 content.json 키워드 **또는** `_shared/safety.ts` 목록에 걸리면(`chatModel.ts isCrisisMessage`) AI 스위치·동의와 상관없이 **서버를 부르지 않고** content.json 위기 안내로 답합니다(동의 카드도 띄우지 않음). 그 질문과 위기 안내는 뒤에 AI에 묻는 대화에서도 뺍니다(`withoutCrisisTurns`) — 동의 전에 앱이 답한 위기 질문이 동의 뒤 국외로 나가지 않게.
- 보내는 것: 대화(앞쪽 인사말·위기 턴 제외, 최근 20개, 지난 메시지는 2000자에서 자름) + 컨텍스트 **산후 주차·분만 방식·수유 여부**(약물은 주차·수유 여부만). 출산일이 없으면 주차를 빼고, 주차가 함수 범위(0~520) 밖이면(잘못 고른 출산 연도) 그 항목만 뺍니다. BMI·목표·최근 위험 신호 여부(iOS가 보내던 것)는 보내지 않습니다.
- 입력창은 AI를 쓸 수 있을 때 2000자(`maxLength`, UTF-16 — 코드 포인트 수보다 크거나 같아 함수 검사를 늘 통과)까지 받습니다. 넘는 질문이 "연결되지 않아" 답으로 빠지지 않게.
- [동의하지 않기]를 골랐으면 배너·기본 답의 "지금은 AI 서버에 연결되지 않아"를 "AI 답변에 동의하지 않아"로 바꿔 보입니다(나머지는 content.json 원문). **CPO 확인 필요**.
- 토큰: `src/auth/client.ts getSupabaseClient()` → `auth.getSession()`의 access token(익명 게스트 포함). 세션이 없으면 보내지 않고 규칙 안내.
- 약물 답 `{ ok, json }`은 JSON 문자열로 바꿔 예전 경로와 같은 모양(`rules/substance parseSubstanceAnswer`)으로 넘깁니다.

---

## 6. 개인정보

| 무엇이 | 어디로 | 남는 곳 |
|---|---|---|
| 분만 경로 태그(영상) | 함수 `videos` → 영상 서버 | Supabase·Render 접근 로그의 URL 쿼리(함수 로그에는 남기지 않음) |
| 질문·대화 + 산후 주차·분만 방식·수유 여부 | 함수 `chat` → Anthropic(미국) — **동의 뒤에만** | Anthropic API 데이터 보관 정책에 따른 기간. 온맘은 저장하지 않음 |
| 사용자 id · 호출 시각 | `llm_usage` | 2일 |
| 상태·코드·preset·소요 시간·토큰 수·대체 모델 여부 | 함수 로그(`console.log` JSON 한 줄) | Supabase 로그 보관 기간 |

- 함수는 질문·답·컨텍스트·사용자 id·토큰·오류 메시지를 **기록하지 않습니다**(테스트가 로그에 없음을 확인). 실패 응답은 코드만 — 스택·업스트림 본문을 내보내지 않습니다.
- 컨텍스트 허용 목록은 두 겹입니다: 웹이 세 항목만 새 객체로 옮기고(`functionContext`), 함수는 그 밖의 값이 있으면 요청을 거절합니다.
- 처리방침·동의 문구의 항목(`features/privacy/dataItems.ts AI_TRANSFER_ITEMS`, `AI_USAGE_RETENTION_DAYS`)과 코드가 같은지 `edgeFunctions.test.ts`가 확인합니다 — 한쪽을 바꾸면 다른 쪽도 바꿉니다.

## 7. 타입 검사 · 테스트

```bash
npx vitest run src/api src/features/chat src/features/substance
npx --yes deno@latest check --no-lock --node-modules-dir=none supabase/functions/*/index.ts   # 저장소에 파일을 만들지 않는다
```

- Next의 `tsconfig.json`은 저장소의 모든 `.ts`를 읽습니다(`npm run typecheck`, `next build`). Deno는 `.ts` 확장자·`npm:` 지정자가 필요하고 Next tsc는 그것을 거부하므로(TS5097·TS2307),
  Deno 파일은 **그 가져오기 줄에만** `// @ts-ignore`를 붙이고(파일 머리에 eslint `ban-ts-comment` 해제와 이유), `Deno` 전역은 쓰는 만큼만 파일 안에 선언했습니다. 가져온 값의 타입은 두 검사기 모두 그대로 봅니다.
  `_shared`는 서로 값을 가져오지 않아(타입만 `import type`) 이런 줄이 없습니다.
- 더 깔끔한 방법은 `tsconfig.json`의 `exclude`에 `"supabase/functions"`를 더하는 것입니다(그러면 위 `@ts-ignore`·`declare const Deno`를 지워도 됩니다). 이때도 `_shared`·`handler.ts`는 vitest가 가져오므로 계속 검사됩니다.
- 로컬에서 함수 띄우기(선택): `npx --yes deno@latest run --no-lock --node-modules-dir=none --allow-net --allow-env supabase/functions/videos/index.ts` → `curl -H "Origin: http://localhost:3000" "http://localhost:8000/?include=route_vaginal_delivery&limit=3"`.

## 8. 문제 해결

| 증상 | 확인 |
|---|---|
| 영상이 한참 뒤에 뜨거나 "영상을 불러오지 못했어요" | 영상 서버가 잠들어 있음(첫 요청 20~40초). 함수 **Logs**의 `code`(`upstream_timeout` 등) |
| 브라우저 콘솔에 CORS 오류 | 사이트 주소가 `ALLOWED_ORIGINS`에 있는지(경로 없이 `https://호스트`). 함수 로그 `origin_not_allowed` |
| AI 상담이 늘 앱 안내로 답함 | 함수 로그의 `code`: `not_configured`(Anthropic 키) · `auth_unavailable`(서버 키 없음·틀림 — 시작 줄 `missing_env`/`server_key` 확인, Auth 장애) · `unauthorized`(세션 없음 — 게스트 계정 생성 실패 등) · `rate_limited`·`busy`(한도) · `refused`. 동의 카드에서 [동의하지 않기]를 골랐는지(그때 배너는 "AI 답변에 동의하지 않아…") |
| `llm_model_unavailable` | Anthropic 조직에서 `claude-opus-5`를 쓸 수 있는지 |
| `unavailable` | `0003_llm_usage.sql`이 적용됐는지(D-1), 함수 권한 |
