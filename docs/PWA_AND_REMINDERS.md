# PWA(홈 화면 추가) · 매일 리마인더(웹 푸시)

2026-09-29. iOS 앱은 매일 20:00에 기기 안 로컬 알림("오늘의 회복 체크")을 울렸습니다(`web/reference/swift/NotificationManager.swift`, `MoreView.swift:57-69`). 웹에는 기기 안 예약 알림이 없어서, **홈 화면에 추가할 수 있는 PWA**와 **서버가 같은 시각에 보내는 웹 푸시**로 옮겼습니다. 08 §2(폼 팩터·매일 리마인더)의 구현입니다.

- Supabase 값과 VAPID 공개 키가 **둘 다 없는 빌드(지금 배포)** 는 지금과 똑같습니다 — 설정 > 알림은 "준비 중"이고 요청을 보내지 않습니다. 매니페스트·아이콘·서비스 워커(정적 파일 캐시)만 켜집니다.
- 규칙: 알림 본문은 `src/content/content.json` `notification.daily_reminder`의 고정 문구뿐이고, 어디에도 건강 데이터가 실리지 않습니다. 서버가 남기는 것은 푸시 끝점·브라우저 암호화 키·시간대뿐입니다.

## 1. 파일 지도

| 갈래 | 파일 | 요점 |
|---|---|---|
| PWA 정적 자산 | `public/manifest.webmanifest` · `public/icons/*` · `public/sw.js` | 정적 파일(Next 밖). 매니페스트에는 `/onmom_web`이 적혀 있다(§2-3). 서비스 워커는 자기 주소에서 basePath를 뗀다 |
| 메타·등록 | `src/app/layout.tsx` · `src/features/pwa/pwaAssets.ts` · `src/features/pwa/PwaClient.tsx` | `<link rel="manifest">`·아이콘·`appleWebApp` 메타(basePath를 `pwaAssetUrl`이 붙인다 — Next 메타데이터는 basePath를 붙여 주지 않는다). 운영 빌드에서만 `sw.js` 등록, 로그아웃·계정 삭제 때 이 브라우저의 푸시 구독 해지, 계정 전환 때 구독을 새 계정의 행으로 다시 저장(못 하면 해지) |
| 설정 > 알림 | `src/features/settings/ReminderSection.tsx` · `src/features/pwa/{useReminder,reminderModel,reminderActions,serviceWorker,pushSubscriptions}.ts` | 켤 수 있는 빌드면 iOS 원문 토글, 아니면 지금까지의 "준비 중" 카드(fallback). 상태 규칙은 `reminderView`, 켜기·끄기·계정 전환 절차는 `enableReminder`·`disableReminder`·`rebindReminder`(순수 — 의존성을 받는다), 실제 의존성은 `reminderActions.ts` |
| 빌드 값 | `src/config.ts`(`vapidPublicKey`·`isReminderConfigured`·`siteIndexable`·`robotsFor`) · `.env.example` · `.github/workflows/deploy.yml` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(형식이 틀리면 빌드 중단) · `NEXT_PUBLIC_SITE_INDEXABLE` |
| DB·예약 | `supabase/migrations/0004_push_reminders.sql` | `public.push_subscriptions`(RLS 본인 행, 끝점은 받는 푸시 서비스만, 사용자당 10개) + pg_cron·pg_net + 매일 11:00 UTC(= 20:00 KST) 예약(Vault 값이 생기기 전에는 요청 없음) |
| 발송 함수 | `supabase/functions/send-reminders/{index,handler}.ts` · `supabase/functions/_shared/reminders.ts` | RFC 8291(aes128gcm)·RFC 8292(VAPID)를 Web Crypto로 직접 구현(의존성 없음). 404/410 행 삭제 |
| 키 생성 | `scripts/generate-vapid.mjs` | `node:crypto`만. 한 쌍을 터미널에만 출력 |
| 테스트 | `src/features/pwa/{pwa,webPush,sendReminders}.test.ts` | 매니페스트·아이콘 크기·sw.js 실제 실행(가짜 self)·켜기/끄기/계정 전환 절차(가짜 PushManager·저장)·받는 푸시 서비스 규칙이 세 곳에서 같은지·RFC 8291 부록 A 시험 벡터·VAPID 서명 검증·함수 처리 순서·SQL 글자 점검 |

## 2. PWA(홈 화면 추가)

### 2-1. 매니페스트·아이콘
- `public/manifest.webmanifest`: `name`·`short_name` "온맘", `lang` ko, `display` standalone, `background_color`·`theme_color` `#F9FAFB`(앱 배경), `start_url` `/onmom_web/home/`(= basePath + `ROUTES.home`), `scope`·`id` `/onmom_web/`. 아이콘 주소는 매니페스트 기준 상대 경로(`icons/…`)라 도메인을 바꿔도 그대로입니다.
- 아이콘은 `src/features/flow/brand-logo.png`(240×240)에서 macOS `sips`로 만들었습니다. `any` 192·512, `maskable` 192·512(안전 영역을 위해 로고 배경색 `#FDEFEB`으로 사방을 넓힌 뒤 축소), `apple-touch-icon` 180. 다시 만들 때:
  ```sh
  sips -Z 512 src/features/flow/brand-logo.png --out public/icons/icon-512.png
  sips -Z 192 src/features/flow/brand-logo.png --out public/icons/icon-192.png
  sips -Z 180 src/features/flow/brand-logo.png --out public/icons/apple-touch-icon-180.png
  # maskable — 240 로고를 300으로 패딩(중앙 80% 안전 영역)한 뒤 축소
  sips -p 300 300 --padColor FDEFEB src/features/flow/brand-logo.png --out /tmp/onmom-maskable.png
  sips -Z 512 /tmp/onmom-maskable.png --out public/icons/icon-maskable-512.png
  sips -Z 192 /tmp/onmom-maskable.png --out public/icons/icon-maskable-192.png
  ```
  `pwa.test.ts`가 파일 존재·실제 픽셀 크기·매니페스트의 `sizes`가 맞는지 확인합니다.
- 루트 레이아웃 메타: `manifest`, `icons`(192·512·apple 180), `appleWebApp { capable, title: "온맘", statusBarStyle: "default" }`. 원래 있던 `src/app/favicon.ico`는 그대로입니다.

### 2-2. iOS 한계
- iOS·iPadOS **16.4 이상**에서만 웹 푸시가 되고, **Safari의 공유 → "홈 화면에 추가"로 설치한 웹 앱에서만** 됩니다(Safari 탭에는 `PushManager`가 없습니다). 설정 화면은 iPhone·iPad의 Safari 탭이면 토글 대신 설치 안내 한 줄을 보입니다(§4).
- 권한 요청은 사용자의 탭(토글)에서만 뜹니다 — 자동으로 묻지 않습니다.
- 홈 화면 앱은 브라우저 저장소(localStorage·Supabase 세션)를 Safari 탭과 **따로** 가집니다. 설치한 뒤 다시 로그인(게스트면 새 게스트)해야 할 수 있습니다 — 카카오 계정을 연결해 두면 기록이 이어집니다.
- Android Chrome·데스크톱 Chrome/Edge/Firefox·macOS Safari 16+는 브라우저 탭에서도 됩니다(설치 불필요).

### 2-3. 커스텀 도메인으로 옮길 때
매니페스트는 정적 파일이라 basePath를 알지 못합니다. `BASE_PATH`가 ""가 되면 `public/manifest.webmanifest`의 세 값을 고칩니다: `"id": "/"`, `"start_url": "/home/"`, `"scope": "/"`. 그리고 `src/features/pwa/pwaAssets.ts`의 `PRODUCTION_BASE_PATH`를 ""로 — `pwa.test.ts`가 둘이 어긋나면 실패합니다. 서비스 워커·레이아웃 메타·아이콘 주소는 자동으로 따라갑니다.
공유 미리보기(§2-4)의 절대 주소는 `NEXT_PUBLIC_SITE_URL=https://<도메인>/`을 함께 넣어야 새 도메인을 가리킵니다(비우면 `https://5seoyoung.github.io/onmom_web/`). 값을 넣었는데 경로가 `BASE_PATH`와 다르면 빌드가 멈춥니다(`src/config.ts siteUrlFrom`). 배포 워크플로(`.github/workflows/deploy.yml`)는 아직 이 Variable을 넘기지 않으니, 도메인을 옮길 때 `NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}` 한 줄을 build 단계 env에 더합니다(`.env.example`에도).

### 2-4. 공유 미리보기(Open Graph·트위터) — 2026-09-29
- 모든 화면: `og:image`·`twitter:image` = `public/og-image.png`(1200×630), 카드 `summary_large_image`, `og:site_name` "온맘", `og:locale` ko_KR. 제목·설명은 화면의 것(제목 틀 "%s · 온맘" — 이름이 든 제목(서비스 소개·이용약관·관리자)은 틀을 건너뜀). 서비스 소개는 `og:url`·제목·설명을 서비스 소개 문구 그대로(`LANDING_META` — 새 문장 없음). 코드: `src/features/landing/shareMeta.ts`, 루트 레이아웃 `metadataBase: new URL(config.siteUrl)`.
- 절대 주소: Next가 상대 주소를 `metadataBase`의 경로 아래로 붙입니다 → `https://5seoyoung.github.io/onmom_web/og-image.png`(`shareMeta.test.ts`가 Next의 해석 함수로 확인). 아이콘·매니페스트는 `metadataBase`를 쓰지 않아 지금처럼 `/onmom_web/…`.
- 이미지는 브랜드 로고(`src/features/flow/brand-logo.png`, 240×240, 배경 `#FDEFEB`)를 2배로 키워 같은 배경색 위 가운데에 둔 것입니다(로고 배경과 이어져 테두리가 보이지 않음 — 토큰 `coral-tint` `#FFF0F0`을 쓰면 로고 둘레에 옅은 네모가 보여 로고 배경색을 썼습니다). 다시 만들 때:
  ```sh
  sips -Z 480 src/features/flow/brand-logo.png --out /tmp/onmom-og-logo.png
  sips -p 630 1200 --padColor FDEFEB /tmp/onmom-og-logo.png --out public/og-image.png
  ```

## 3. 서비스 워커(`public/sw.js`)

- **등록**: `PwaClient`가 운영 빌드(`NODE_ENV=production`)에서만 `${basePath}/sw.js`를 범위 `${basePath}/`로 등록합니다. 개발 서버에서는 등록하지 않습니다(캐시 꼬임 방지). 알림 토글을 켤 때는 어느 빌드에서나 명시적으로 등록합니다.
- **캐시 규칙**(같은 origin·GET만):
  | 요청 | 전략 | 비고 |
  |---|---|---|
  | `${basePath}/_next/static/*` · `${basePath}/icons/*` | 캐시 먼저 | 내용이 바뀌면 파일 이름도 바뀌는 정적 파일 |
  | HTML 이동(`mode: navigate`) | 네트워크 먼저 → 오프라인이면 **같은 주소**의 저장본(쿼리 무시) | 한 번 연 화면만. 저장본이 없으면 브라우저의 오프라인 화면(가짜 화면을 만들지 않는다). 리다이렉트를 거친 응답은 저장하지 않는다 |
  | 그 밖 같은 origin(JSON 등) · **다른 origin 전부**(Supabase·카카오·Anthropic·영상 서버) | 손대지 않음 | 건강 데이터가 담긴 응답이 캐시에 남지 않게 |
- **판**: `CACHE_VERSION`(`onmom-YYYY-MM-DD-n`)이 캐시 이름에 들어갑니다. `sw.js`를 고치면 이 값을 올립니다 → 새 판이 활성화될 때 예전 `onmom-` 캐시를 지웁니다. `install`에서 `skipWaiting`, `activate`에서 `clients.claim` — HTML은 네트워크 먼저라 예전 판의 캐시에 묶이지 않으므로 "새 판" 토스트를 두지 않았습니다.
- **푸시**: `push` 이벤트는 서버 본문을 **읽지 않고** 고정 문구(`REMINDER_TITLE`·`REMINDER_BODY` = content.json)를 보입니다. `notificationclick`은 열린 창이 있으면 앞으로 가져와 `${basePath}/record/`(`ROUTES.record`)로, 없으면 새 창. `pwa.test.ts`가 sw.js를 실제 실행해 확인합니다.
- `pushsubscriptionchange`(푸시 서비스가 구독을 갈아 끼움)는 워커에 로그인 세션이 없어 서버에 알리지 못합니다. 다음에 설정 화면을 열면 토글이 실제 구독 상태(꺼짐)를 보이므로 다시 켤 수 있습니다.

## 4. 매일 리마인더 — 구조와 동작

```
설정 > 알림 토글(브라우저)                                  매일 11:00 UTC = 20:00 KST
  Notification.requestPermission                              pg_cron 'onmom-send-reminders'
  → sw.js 등록 → PushManager.subscribe(VAPID 공개 키)           → net.http_post(Edge Function send-reminders,
  → public.push_subscriptions upsert(endpoint 유일, RLS 본인 행)     헤더 x-reminder-secret = Vault reminder_cron_secret)
                                                                → 함수: 부른 쪽 확인 → 구독 전부 읽기(service_role)
                                                                  → 행의 시간대에서 지금이 20시인 것만
                                                                  → RFC 8291 암호화 + RFC 8292 VAPID 서명 → 푸시 서비스 POST
                                                                  → 404/410 행 삭제 · 숫자만 로그
브라우저 sw.js push → "오늘의 회복 체크 / 이상 증상이 있었나요? …" → 누르면 /record/
```

- **켤 수 있는 조건**(`isReminderConfigured`): `NEXT_PUBLIC_SUPABASE_URL`+`…_PUBLISHABLE_KEY` **그리고** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. 하나라도 없으면 지금과 같은 "준비 중" 카드.
- **설정 화면 상태**(`reminderModel.ts reminderView`):
  | 상황 | 보이는 것 |
  |---|---|
  | 설정 없는 빌드 | "준비 중" 카드(지금과 같음, D4) |
  | iPhone·iPad Safari 탭(PushManager 없음) | 토글 없이 설치 안내 한 줄(§6 새 문구) |
  | 푸시를 지원하지 않는 브라우저 | "이 브라우저는 알림을 지원하지 않아요." |
  | 서버 세션이 없는 게스트(익명 가입이 안 돼 이 브라우저 전용 — 꺼짐·요청 제한·CAPTCHA·오프라인, `src/auth/session.ts`) | 토글 없이 "지금은 온맘 서버에 연결되지 않은 게스트라 알림을 켤 수 없어요. 카카오 계정을 연결하면 켤 수 있어요."(§6). 설정의 [카카오 계정 연결]이나 다음 방문의 익명 계정 옮기기로 세션이 생기면 토글로 바뀝니다. 세션을 확인하는 동안(저장된 세션을 읽는 중)은 토글이 잠겨 있습니다(`src/auth/serverSession.ts`·`useServerSession.ts`) — 2026-09-29, 전에는 토글이 보였고 켜면 "인터넷 연결을 확인" 실패 문구로 끝났음 |
  | 알림 권한 거부됨 | 허용 방법 안내 한 줄 |
  | 이 브라우저의 푸시 서비스가 받는 목록 밖(켜기를 눌렀을 때 알게 됨) | "이 브라우저는 알림을 지원하지 않아요." — 구독은 풀고 저장하지 않음 |
  | 그 밖 | iOS 원문 토글 "매일 회복 체크 리마인더 / 저녁 8시, 이상 증상 빠른 기록 알림". **켜짐 = 이 브라우저에 지금 빌드의 키로 만든 구독이 있고, 그 끝점의 서버 행도 이 계정에 있음**(저장된 플래그가 아님 — 서버가 보낼 곳이 없는 "켜짐"은 없다. 행을 확인하지 못하면(오프라인) 브라우저 상태를 믿는다) |
- **켜기**: 권한 요청 → 워커 등록·활성 대기 → (키를 바꿨거나 서버 행이 없는 예전 구독은 해지) → `subscribe({ userVisibleOnly: true, applicationServerKey })` → 받는 푸시 서비스인지 확인 → `push_subscriptions` upsert(`endpoint` 충돌이면 키·시간대 갱신). 서버 저장이 실패하면 구독을 도로 풀고 실패 안내(켜진 척하지 않음). **끄기**: 행 삭제 → 브라우저 구독 해지. 기기(브라우저)마다 한 행 — 여러 기기에서 각각 켤 수 있습니다(사용자당 10개까지).
- **받는 푸시 서비스**(남용·SSRF 방지): 끝점은 브라우저 회사의 푸시 서비스만 — `fcm.googleapis.com`(Chrome·Samsung 인터넷·Opera 등 Chromium 계열), `*.push.services.mozilla.com`(Firefox), `*.notify.windows.com`(Edge), `*.push.apple.com`(Safari). 같은 규칙이 세 곳에 있습니다: 브라우저(`reminderModel.ts PUSH_ENDPOINT_PATTERN` — 목록 밖이면 저장하지 않음), DB(0004 check 제약 — 브라우저를 거치지 않은 저장도 막음), 발송 함수(`_shared/reminders.ts` — 요청하지 않고 `rejected`). `pwa.test.ts`가 세 글자가 같은지 봅니다. 함수는 리다이렉트를 따라가지 않습니다(`redirect: "manual"` → 3xx는 `rejected`). 사용자당 끝점 10개까지(0004 트리거 — 게스트 계정을 여러 개 만들어 가짜 끝점으로 발송을 막는 남용 방지).
- **로그아웃·계정 삭제**: `PwaClient`가 이 브라우저의 구독을 풉니다(iOS `eraseAll`이 예약 알림을 지우던 것과 같은 뜻). 서버 행은 계정 삭제면 `on delete cascade`로 함께 지워집니다. 카카오 로그아웃은 세션을 끝내기 **직전에** `disableReminderNow()`(`reminderActions.ts`)로 행을 지우고 구독을 풉니다(`src/auth/session.ts` `beforeSignOut`, 최대 3초 — 넘거나 실패하면 그냥 로그아웃하고, 풀린 끝점은 다음 발송 때 푸시 서비스의 404/410으로 함수가 지웁니다).
- **계정 전환**(게스트 → 이미 있던 카카오 계정, 다른 탭의 로그인 등 — 계정이 null을 거치지 않고 바로 바뀜): 전환은 익명 사용자와 그 서버 행을 먼저 지우므로(cascade) 브라우저 구독만 남습니다. `PwaClient`가 끝점을 새 계정의 행으로 다시 저장하고(`rebindReminder`), 저장하지 못하면(행이 아직 다른 사용자의 것 — RLS 42501) 구독을 풀어 토글이 "꺼짐"으로 보입니다. 게스트에 카카오를 연결한 경우(같은 Supabase 사용자)는 같은 행을 제자리 갱신합니다.
- **시간대**: 행에 브라우저의 IANA 시간대를 저장합니다. 예약은 하루 한 번 11:00 UTC이고 함수는 "그 행의 시간대에서 지금이 20시"인 행에만 보냅니다 — 한국 밖 사용자에게 각자의 20시에 보내려면 0004의 `'0 11 * * *'`를 `'0 * * * *'`(매시)로 바꾸면 됩니다(함수는 그대로).
- **함수 응답·로그**: `{ ok, total, due, sent, gone, retry, rejected, errors, pruned }` 숫자만. 끝점·키·사용자 id·본문은 기록하지 않습니다. 429·5xx는 행을 두고 다음 날 다시, 400·401·403(키·서명 문제)은 행을 두고 `rejected`로 셉니다 — 이 수가 0이 아니면 §7.

## 5. 주인이 할 일(순서대로)

**A. VAPID 키 한 쌍**
```sh
node scripts/generate-vapid.mjs
```
두 줄이 나옵니다. 파일에 저장되지 않으니 아래에 넣기 전까지만 보관하고, 비밀 키는 저장소·Variables·`NEXT_PUBLIC_*`에 절대 넣지 않습니다. 키를 바꾸면 기존 구독은 모두 무효가 되어 사용자가 설정에서 다시 켜야 합니다.

순서의 요점: **Vault에 `reminder_cron_secret`을 넣는 것(E)이 "켜기"입니다.** 0004가 먼저 적용돼도 그 값이 생기기 전까지 예약은 요청을 보내지 않으므로, 함수 배포·비밀값(B·D)을 마친 뒤에 E를 합니다.

**B. Supabase Edge Function 비밀값** — 대시보드 → Edge Functions → Secrets(또는 `supabase secrets set --env-file …`)
| 이름 | 값 | 필수 |
|---|---|---|
| `VAPID_PRIVATE_KEY` | A의 비밀 키(43자) | 필수 |
| `VAPID_SUBJECT` | `mailto:<운영 이메일>`(처리방침의 문의 주소) 또는 `https://5seoyoung.github.io/onmom_web/` — 푸시 서비스가 문제 있을 때 연락하는 곳 | 필수 |
| `REMINDER_CRON_SECRET` | 긴 무작위 문자열(예: `openssl rand -hex 32`, 16자 이상, 따옴표·`#`·`$`·`\`·백틱 없이) | 필수 |
| `VAPID_PUBLIC_KEY` | A의 공개 키 — 비밀 키에서 만든 공개 키와 어긋나면 함수가 발송을 거부하고 로그에 `vapid_public_key_mismatch` | 권장 |
| `REMINDER_HOUR` | 기본 20 | 선택 |
GitHub **Secrets**에 같은 이름으로 넣으면 "Supabase" 워크플로(`.github/workflows/supabase.yml`)가 형식을 확인하고 함수 비밀값으로 넣습니다(대시보드에서 직접 넣어도 됩니다). `VAPID_PUBLIC_KEY`는 워크플로가 Variables의 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`에서 가져옵니다.

**C. 표·예약(0004)** — main에 올리면 "Supabase" 워크플로의 `supabase db push`가 적용합니다(대시보드 SQL Editor에 파일을 통째로 붙여 넣어도 됩니다). 적용돼도 E 전에는 예약이 요청을 보내지 않습니다. 확인:
```sql
select jobname, schedule, active from cron.job where jobname = 'onmom-send-reminders';   -- '0 11 * * *', true
select relname from pg_class where relname = 'push_subscriptions';
```

**D. 함수 배포** — `send-reminders`는 게이트웨이 JWT 검사를 끕니다(pg_cron 요청에는 사용자 토큰이 없고, 함수가 `x-reminder-secret`으로 직접 확인합니다). `supabase/config.toml`의 `[functions.send-reminders] verify_jwt = false`와 "Supabase" 워크플로의 배포 명령(`supabase functions deploy videos chat send-reminders`)에 들어 있습니다(2026-09-29 통합). 손으로 배포할 때: `supabase functions deploy send-reminders --project-ref <ref> --use-api --no-verify-jwt`.

**E. Vault = 켜기** — B·D를 마친 뒤 대시보드 → SQL Editor(한 번만; 값은 표시되지 않고 Vault에만 남습니다)
```sql
select vault.create_secret('<B의 REMINDER_CRON_SECRET과 같은 값>', 'reminder_cron_secret');   -- 필수
select vault.create_secret('https://movrwmoniopgetdmagon.supabase.co', 'project_url');         -- 선택(없으면 0004의 기본 주소)
select vault.create_secret('<Publishable key>', 'publishable_key');                             -- 선택(게이트웨이 apikey 헤더)
```
Supabase 문서 "Scheduling Edge Functions"의 방식 그대로입니다 — 예약 SQL에는 비밀이 없고 실행 시점에 Vault에서 읽습니다. `reminder_cron_secret`이 없거나 비어 있으면 예약은 요청을 만들지 않고, `publishable_key`가 없으면 `apikey` 헤더를 싣지 않습니다(빈 헤더 없음). 끄려면 `delete from vault.secrets where name = 'reminder_cron_secret'`. 값을 바꾸려면 `select vault.update_secret(id, '<새 값>') from vault.secrets where name = 'reminder_cron_secret'`.

**F. 사이트** — GitHub → Settings → Secrets and variables → Actions → **Variables**에 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(A의 공개 키) → Actions → "Deploy to GitHub Pages" → Run workflow. 형식이 틀리면(비밀 키를 넣는 등) 빌드가 멈춥니다.
- 사이트 빌드에 Supabase 값(`docs/SUPABASE_SETUP.md` C-3)이 아직 없으면 이 값만으로는 화면이 바뀌지 않습니다 — 설정 > 알림은 "준비 중" 그대로이고, 매니페스트·아이콘·서비스 워커만 동작합니다.
- `NEXT_PUBLIC_SITE_INDEXABLE=true`(Variables)는 서비스 소개(/)만 색인을 허용하는 스위치입니다(`src/app/page.tsx` `robotsFor("landing")` — 2026-09-29 통합).

**G. 끝에서 끝 시험**
1. 휴대폰(Android Chrome, 또는 iPhone은 홈 화면에 추가한 뒤)에서 설정 > 알림 토글 켜기 → 권한 허용 → 토글이 켜진 채로 남는지. 대시보드 Table Editor `push_subscriptions`에 행 1개.
2. 지금 바로 보내 보기(20시를 기다리지 않고):
   ```sh
   curl -sS -X POST "https://<ref>.supabase.co/functions/v1/send-reminders" \
     -H "Content-Type: application/json" -H "x-reminder-secret: <REMINDER_CRON_SECRET>" \
     --data '{"hour": <지금 KST 시, 예: 14>}'
   ```
   → `{"ok":true,"total":1,"due":1,"sent":1,…}`이고 휴대폰에 "오늘의 회복 체크" 알림. 누르면 기록 화면. (`hour`는 확인된 호출자만 쓸 수 있는 그 한 번의 발송 시입니다. 없으면 20.)
3. 예약이 돈 뒤(다음 날 20:00 KST 이후) 확인:
   ```sql
   select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'onmom-send-reminders') order by start_time desc limit 3;
   select status_code, content::text from net._http_response order by created desc limit 3;   -- 200 + {"ok":true,…}
   ```
   Edge Functions → send-reminders → Logs에 `{"fn":"send-reminders","status":200,…,"summary":{…}}`.
4. 토글 끄기 → 행이 사라지는지. 계정 삭제 → 행이 함께 사라지는지(cascade).
5. 게스트로 켠 뒤 설정에서 이미 있던 카카오 계정으로 전환 → 설정 > 알림 토글이 켜진 채이고, 행이 하나이며 `user_id`가 카카오 계정인지(§4 계정 전환). 이 브라우저의 끝점 호스트가 §4 목록 안인지도 이때 봅니다.

## 6. 웹 신규 문구(CPO 확인 필요)

모두 `src/features/pwa/reminderModel.ts REMINDER_TEXT`(코드에 `// 웹 신규 문구 — CPO 확인 필요`). 토글 라벨·알림 문구는 iOS 원문 그대로입니다.
| 키 | 문구 | 보이는 곳 |
|---|---|---|
| `denied` | "브라우저에서 이 사이트의 알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용한 뒤 다시 켜 주세요." | 권한 거부 상태 |
| `installHint` | "iPhone·iPad에서는 Safari의 공유 버튼 → '홈 화면에 추가'로 설치한 뒤, 홈 화면의 온맘에서 알림을 켤 수 있어요." | iOS Safari 탭 |
| `unsupported` | "이 브라우저는 알림을 지원하지 않아요." | 푸시 API 없는 브라우저 |
| `needsAccount` | "지금은 온맘 서버에 연결되지 않은 게스트라 알림을 켤 수 없어요. 카카오 계정을 연결하면 켤 수 있어요." | 서버 세션이 없는 게스트(2026-09-29) |
| `failed` | "알림 설정을 바꾸지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요." | 구독·해지 실패(role=alert) |
| `busy` | "알림 설정을 바꾸고 있어요" | 진행 중(낭독용, aria-live) |

## 7. 문제 해결

| 증상 | 원인·조치 |
|---|---|
| 토글 대신 "지금은 온맘 서버에 연결되지 않은 게스트라…" | 이 브라우저의 게스트에게 Supabase 세션이 없음 — 익명 로그인이 꺼져 있거나(대시보드 Authentication → Sign In / Providers → Anonymous), 요청 제한·CAPTCHA 실패(`NEXT_PUBLIC_TURNSTILE_SITE_KEY`와 대시보드 CAPTCHA가 짝이 맞는지)·오프라인. 카카오 계정을 연결하면 켤 수 있다 |
| 설정 > 알림이 여전히 "준비 중" | 사이트 빌드에 `NEXT_PUBLIC_SUPABASE_URL`·`…_PUBLISHABLE_KEY`·`NEXT_PUBLIC_VAPID_PUBLIC_KEY` 중 하나가 없음(F, `docs/SUPABASE_SETUP.md` C-3). VAPID 공개 키만 넣은 빌드도 Supabase 값이 없으면 "준비 중"이 맞다 |
| 사이트 빌드가 "NEXT_PUBLIC_VAPID_PUBLIC_KEY 형식이 틀립니다"로 멈춤 | 비밀 키(43자)를 넣었거나 공백이 섞임. 공개 키는 87자, B로 시작 |
| 토글을 켜면 "알림 설정을 바꾸지 못했어요" | 0004가 아직 적용되지 않음(표 없음) → C. 또는 오프라인, 또는 이 계정의 기기가 10개(오래된 기기에서 끄거나 Table Editor에서 행 삭제). 브라우저 콘솔의 `push_subscriptions` 요청 상태로 구분 |
| 토글을 켜면 "이 브라우저는 알림을 지원하지 않아요." | 이 브라우저의 푸시 서비스가 받는 목록(§4) 밖. 목록을 넓히려면 세 곳(브라우저·함수·새 마이그레이션의 check 제약)을 함께 바꾼다 |
| 함수 Logs `startup: missing_env` | 이름이 나온 비밀값이 없음(B) |
| 함수 응답 401 `unauthorized` | Vault `reminder_cron_secret`과 함수 비밀값 `REMINDER_CRON_SECRET`이 다름(E·B), 또는 16자 미만 |
| 게이트웨이 401(본문에 `code`가 없음) | `verify_jwt`가 켜져 있음 → D |
| 예약은 도는데(`cron.job_run_details` succeeded) `net._http_response`에 새 줄이 없음 | 정상 — Vault에 `reminder_cron_secret`이 아직 없음(E를 하지 않음). 켜지 않은 상태 |
| 503 `vapid_unavailable` / `vapid_subject_invalid` | 비밀 키 형식이 틀리거나 `VAPID_PUBLIC_KEY`가 어긋남 / `VAPID_SUBJECT`가 `mailto:`·`https:`가 아님 |
| 응답 `rejected`가 0이 아님 | 푸시 서비스가 서명·키를 거부(400·401·403)했거나 리다이렉트(3xx)를 답함. 사이트의 공개 키와 함수의 비밀 키가 다른 쌍 — 같은 실행의 A 값인지 확인. 사용자는 토글을 껐다 켜야 함 |
| `cron.job_run_details`에 실행이 없음 | pg_cron이 꺼져 있거나 프로젝트가 일시정지(무료 요금제는 비활성 프로젝트가 멈춤) |
| iPhone에서 토글이 안 보이고 설치 안내만 | 정상 — 홈 화면에 추가한 앱에서 켭니다(§2-2) |

## 8. 다른 파일에 넣은 것 (2026-09-29 통합)

처음에 이 작업 밖이라 남겼던 줄은 통합에서 모두 넣었습니다.
- `supabase/config.toml`: `[functions.send-reminders] verify_jwt = false`.
- `.github/workflows/supabase.yml`: 함수 파일 확인·배포에 `send-reminders`, 비밀값 단계에 `VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`·`REMINDER_CRON_SECRET`(Secrets)과 `VAPID_PUBLIC_KEY`(= Variables `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), 형식 확인(비밀 키 43자·공개 키 87자·subject `mailto:`/`https:`·크론 비밀 16자 이상), 서버에 셋이 없으면 "매일 리마인더 꺼짐" 알림.
- `src/app/page.tsx`: `robots: robotsFor("landing")` — `pwa.test.ts`가 서비스 소개만 이 값을 쓰는지 확인.
- `src/auth/session.ts`: 카카오 로그아웃의 `beforeSignOut`(기본 인스턴스 = `disableReminderNow`, 동적 가져오기, 최대 3초) — `session.test.ts`가 순서·unsynced·실패·시간 초과를 확인.
- `docs/SUPABASE_SETUP.md` C·D, `docs/SUPABASE_FUNCTIONS.md` 함수 표·배포, `docs/DEV_NOTES.md` §10.

## 9. 남은 결정·위험

- **CPO**: 08 §2의 매일 리마인더를 웹 푸시로 가는 것으로 확정할지(대안: 카카오 알림톡·이메일 — 유료 채널·수신 동의가 필요해 만들지 않음). iOS는 설치한 사용자만 받습니다.
- **개인정보**: (2026-09-29) 처리방침 초안에 넣었습니다 — 매일 리마인더를 켤 수 있는 빌드(`isReminderConfigured`)의 방침에만 2절 "알림 정보(매일 리마인더를 켠 경우에만): 브라우저 푸시 구독 주소·암호화 키·시간대", 3절 목적, 5절 보유(끄기·계정 삭제 즉시, 로그아웃·구독 끝남은 다음 발송 때), 6절 ⑤ 브라우저 푸시 서비스(Google FCM·Apple·Mozilla·Microsoft WNS — 국외, 브라우저 제조사가 정함, 가는 것은 끝점과 암호화된 고정 문구뿐). 코드 `src/features/privacy/webPolicyText.ts`, 검토 문서 `docs/privacy/CONSENT_AND_POLICY_DRAFT.md` 3절·5절 체크리스트(국외 이전/위탁 판단, 동의 (a)에 넣을지). **법률 검토·CPO 승인 전에는 Vault 값(켜기)을 넣지 않습니다.**
- **받는 푸시 서비스 목록**: 목록 밖의 푸시 서비스를 쓰는 브라우저(예: 자체 푸시 서버를 쓰는 일부 Chromium 계열)는 "지원하지 않아요"로 보입니다. 실제 기기에서 네이버 웨일·삼성 인터넷의 끝점 호스트를 G단계 때 확인하세요(대시보드 Table Editor `push_subscriptions.endpoint`의 호스트 — FCM이면 그대로 됩니다).
- **발송 시각**: 하루 한 번 11:00 UTC 고정. pg_cron이 몇 분 늦을 수 있고, 푸시 서비스는 기기가 꺼져 있으면 4시간(TTL)까지 보관합니다.
- **실제 푸시 서비스로는 아직 보내 보지 않았습니다**(암호화·서명은 RFC 시험 벡터·자체 검증으로 확인). G단계를 빠짐없이.
- `pushsubscriptionchange`는 다루지 않습니다(§3).
