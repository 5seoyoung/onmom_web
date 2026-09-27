# 개발 메모

2026-09-23 기준으로 규칙·저장·UI·외부 연동 모듈을 합치며 쓰고, 2026-09-27 화면 구현(§6)과 주소 재구성(§4 주소 지도 — "/"는 서비스 소개, 앱 홈은 "/home/"), 서비스 소개·폰/PC 반응형 껍데기·카카오 로그인(Supabase) 통합(§7)을 더했습니다.
2026-09-28 실서비스 전환(게스트 = Supabase 익명 계정, 동의의 판, 영상·AI 서버 함수, 관리자 화면)을 §8에 더했습니다. §7의 서버 저장 동의 설명(7-0·7-3·7-4)은 §8이 대신합니다.
`[#n]`은 인수인계 검수 문서(비공개, `docs/private/handoff-audit-2026-09-23.md`)의 항목 번호입니다.
결정이 나면 해당 줄을 지우고 코드·테스트를 고칩니다. 규칙 값이 바뀌면 `src/rules/version.ts`의 버전도 올립니다.

---

## 1. 통합하면서 바꾼 것

- **앱 상태 연결**: `src/app/layout.tsx`가 `<StoreProvider>`로 앱 전체를 감쌉니다. 레이아웃은 서버 컴포넌트로 두고 Provider만 클라이언트 경계입니다.
  저장소는 마운트 뒤 첫 구독 때 읽으므로 정적 HTML에 사용자 데이터가 들어가지 않습니다.
- **규칙 한 곳으로(08 §3-1)**: 모듈마다 따로 있던 같은 규칙을 한쪽으로 모았습니다. 동작은 그대로입니다.
  | 중복 | 단일 출처 | 바꾼 쪽 |
  |---|---|---|
  | 레드플래그 활성 여부 | `rules/record.ts isRedFlagActive` | `rules/exercise.ts`는 다시 내보내기만 |
  | 분만 방식 표시명(자연분만/제왕절개) | `rules/exercise.ts DELIVERY_TITLE` | `rules/chat.ts` 사본 삭제 |
  | 병원 신호 타입 | `rules/redflag.ts RedFlag` | `rules/recovery.ts HospitalSignal = RedFlag` |
  | 통증 NRS 0~10 정수 자르기 | `rules/record.ts clampNrs` | `components/ui/numbers.ts`가 가져다 씀 |
  | 지표 상태 라벨(정상/관찰/확인 필요) | `rules/redflag.ts METRIC_STATUS_LABEL` | `components/ui/labels.ts`는 다시 내보내기만 |
  | 심각도 라벨(즉시 내원/당일 진료) | `rules/recovery.ts severityLabel` | `components/ui/labels.ts`는 다시 내보내기만 |
  | 최근 기록 · 기록 50건 제한 | `rules/record.ts` | `store/state.ts`가 위임 |
  | 오늘의 기분 답 · 접어두기 기한·판정 · 7일 | `rules/mood.ts` | `store/state.ts`가 위임 |
  | 모르는 기분 답 → "글쎄요" | `rules/mood.ts normalizeMoodAnswer` | `store/decode.ts`가 사용 |
  | 영상 조회 limit 500 · 영상 오류 문구 3개 | `rules/exercise.ts` | `api/video.ts`가 가져다 씀 |
- **모르는 심각도 코드**: 이제 UI에서도 `severityLabel`이 `null`을 돌려주고, `RedFlagCard`는 라벨 없이 아이콘만 그립니다.
  원시 코드를 화면에 내지 않습니다. 전에는 UI 쪽만 iOS처럼 코드를 그대로 보여줬습니다.
- **영상 필드명**: `api/video.ts`의 `VideoDBVideo`가 이제 `rules/exercise.ts`의 `Video`(서버 필드명 `video_id` 그대로)입니다.
  조회 결과를 변환 없이 `exercisePlan`·`runRecoveryAnalysis`에 넘깁니다. 전에는 `id`로 바꿔 담아서 화면마다 다시 옮겨야 했습니다.

## 2. Swift·문서와 의도적으로 다르게 한 것

### 공통
- **산후 일차 = 로컬 달력 날짜 차이** [#38]. iOS는 출산일에 남은 시각 기준이라 경계일에 하루 적게 셉니다. 웹은 오로 질문·오로 규칙이 iOS보다 최대 하루 빨리 시작됩니다.
- **저장 날짜 형식** [#23]. 웹은 ISO 문자열로 저장하고, iOS 형식(2001-01-01 기준 초, Double)은 읽을 때만 변환합니다.
  서버 state를 공유하기 전에 iOS 인코더를 `.iso8601`로 바꿔야 iOS가 웹 데이터를 읽을 수 있습니다.
- **content.json 형식 검사**: 규칙이 기대하는 형식과 다르면(레드플래그 코드 누락·중복·미지, 금기·주의 규칙이 모르는 단계·항목을 가리킴, 체중 칩 자리표시 위치 변경) 모듈을 불러올 때 예외가 나서 **빌드가 실패**합니다. 임상 회신으로 JSON을 바꿨을 때 조용히 틀리지 않게 하려는 것입니다.

### 레드플래그 · 기록 · 체중 (`rules/redflag`, `record`, `weight`)
- 규칙 집합과 평가 순서는 코드(`RED_FLAG_ORDER`, Swift 순서)가 정하고 content.json에서는 문구·칩만 읽습니다. 대표 신호 = severity가 가장 높은 것, 같으면 먼저 걸린 것 [#39]. 모르는 severity 문자열은 순위 0으로 봅니다(예외 없음).
- 판정 결과에서 Swift의 빈 `allowed/caution/forbidden` 배열은 뺐습니다.
- 산후 10일 전에는 오로 답을 `false`로 저장합니다(화면에 없는 질문의 값을 남기지 않음). 통증은 정수로 자르고 0~10, NaN은 0.
- "3시간 전·어제·지난주"는 Foundation 상대 시간 알고리즘을 옮기고 `Intl.RelativeTimeFormat("ko")`로 표기합니다(Swift 결과 7,600여 건과 대조해 일치). 로케일은 한국어·일요일 시작으로 고정, 상태 카드 날짜는 항상 "M월 d일".
- 소수 한 자리 표기는 iOS `%.1f`처럼 정확한 절반을 짝수 쪽으로 반올림합니다(22.25 → "22.2"). BMI 칩과 챗 컨텍스트가 같은 함수를 씁니다.
- 체중 계획에 `kind`("loss"/"recovery") 필드를 더했고, 첫 칩은 계산값이 content.json의 `"x.x"` 자리를 대신합니다 [#53].
- "위험 신호 없음" 결과 문구는 `disclaimers.record_normal`을 `" / "`에서 나눠 제목·본문으로 씁니다 [#53].

### 운동 · 회복 분석 (`rules/exercise`, `recovery`)
- 영상 태그는 `route_vaginal_delivery` / `route_cesarean_section` [#11]. 문서의 `route_{delivery}`는 틀렸습니다.
- 운동 탭 "영상 준비 중" 블록의 현재 단계에서 금기 단계를 뺍니다 — iOS `unavailableBlock` 버그 수정 [#4]. 제왕절개 9주 + 골반통이면 "골반저근".
- 분석은 순수 함수입니다. 영상 조회 결과를 입력으로 받고, 병원 신호는 늘 `null`(iOS와 같음).
- 출산일이 없거나 형식이 틀리면 분석하지 않습니다(`null`). iOS는 출산일이 늘 있었습니다. 0일차로 두면 지어낸 값입니다.
- `firedRules`의 `blocked:*`는 단계 순서로 싣습니다(iOS는 Dictionary 순서라 실행마다 달랐음).
- `generatedAt`은 밀리초 없는 UTC ISO(Swift `ISO8601Format()`과 같게). 영상 정렬은 `video_id`를 UTF-16 코드 단위로 비교합니다.
- 옛 저장 데이터의 `undefined`는 `null`로 봅니다.
- 문서 테스트 벡터를 Swift 실행 결과로 고쳤습니다: #8 키 `early_core_activation`·다음 단계 줄·주의 항목 [#41], #10 배지·섹션·본문 [#5].

### 기분 · 약물 · AI 상담 · 지원사업 (`rules/mood`, `substance`, `chat`, `support`)
- 약물 판정은 **표가 먼저, 표에 없을 때만 LLM** [#1]. LLM 답은 다시 검증하고, 실패·무효 답이면 표 결과를 그대로 둡니다. 결과에 `source: "table" | "llm"` 필드를 더했습니다.
- 약물·챗 키워드 비교 전에 양쪽을 NFC로 맞춥니다(Swift는 조합형·완성형 한글을 같게 봄). 빈 검색어는 아무것에도 맞지 않습니다. 앞뒤는 공백·탭만 자릅니다(Swift `.whitespaces`).
- LLM 답에서 `{` 앞에 `}`가 있으면 Swift는 멈추지만 웹은 `null`을 돌려줍니다.
- 날짜를 읽을 수 없는 기분 기록은 셈에서 뺍니다(iOS는 읽은 시각으로 채워 "오늘"로 셌음). 기분 신호에는 `MOOD_VERSION`을 싣지 않았습니다 [#43].
- 챗 요청은 `maxTokens`를 보내지 않습니다 — iOS처럼 기본값(`api/llm.ts LLM_PRESET_DEFAULTS.patient_edu`)을 씁니다.
- 문서 02 §7-3 기분 벡터 7행은 1행과 같아서 창 경계(13일 전 00:00 포함) 검사로 바꿨습니다 [#42].

### 앱 상태 (`store`)
- 타입이 틀린 값은 **그 필드(배열이면 그 원소)만** 기본값으로 둡니다. iOS는 저장 전체를 버렸습니다.
- 주인 계정 id를 읽을 수 없으면 "알 수 없는 실제 계정"으로 보고 다음 로그인 때 지웁니다(Swift와 같음). id가 빈 계정은 로그아웃 상태로 봅니다.
- 출산일이 없으면 `null`로 읽습니다(iOS는 오늘 날짜로 채움).
- 계정 전환으로 데이터를 지울 때 새 로그인은 유지합니다. iOS는 계정 키까지 지워 다음 실행 때 로그아웃되는 버그가 있었습니다.
- `updateProfile`·`updateMaternity`는 못 읽는 값을 무시하고 이전 값을 둡니다. 출산일은 한번 정하면 비울 수 없습니다(iOS DatePicker와 같음). 키·체중은 0으로 비웁니다.
- 기록장 글 제목은 공백·줄바꿈을 모두 자릅니다(줄바꿈만 있는 제목 거부). 게스트 id는 소문자 UUID.
- 새 값 `storageAvailable`: 마지막 상태 저장이 성공했는지(사생활 보호 모드·용량 초과면 false). 안내 문구는 아직 없습니다.
- 다른 탭의 변경은 `storage` 이벤트로 받고, 구독이 모두 끊겼다가 다시 붙으면 저장소를 다시 읽습니다(저장이 실패 중이면 메모리를 지킴).
- 브라우저 저장 키는 전부 `onmom.web.` 접두 — 계정 삭제가 이 접두를 전부 지웁니다.

### 공용 UI (`components/ui`)
- 문서 06과 Swift가 다르면 Swift: 출처 칩 스타일 [#26], SectionTitle 색·카드 패딩·그림자 [#61], 선택된 행은 배경 없이 테두리·아이콘만 [#62].
- 선택 행은 진짜 라디오(`SelectableGroup`에 라벨 필수), 토글은 `role="switch"` 버튼. 키보드·스크린리더에서 상태가 전달됩니다.
- 출처 칩에 화면에 안 보이는 "출처: " 접두를 붙였습니다(아이콘만으로 구분되지 않게).
- 고대비(forced-colors) 모드 스타일, 빈 라벨 배지의 기본 라벨 대체, NRS 값은 `aria-valuetext`로 한 번만 읽힘.
- 토글 꺼짐 트랙·슬라이더 빈 트랙 색은 기존 토큰으로 만들었습니다(Swift는 시스템 색).
- 면책 배너는 `disclaimers.home_footer`를 첫 문장에서 나눠 두 줄로 씁니다(재입력 없음).

### 외부 연동 (`api`)
- 가까운 산부인과 검색 반경 **20km**(카카오 최대). iOS 8km 영역은 힌트여서 더 먼 곳도 나왔지만 카카오 `radius`는 잘라냅니다.
- 병원 카테고리(`HP8`)만 검색, 좌표 없는 장소는 뺌("직선거리 0m"를 지어내지 않음). 결과 없음·주소 없음은 Swift가 의도한 구체 문구를 씁니다.
- 카카오 키가 없으면 `notConfigured`(문구 `null` — Swift에 해당 문구 없음). 카카오는 주소만 이해해서 "강남역" 같은 장소명은 "주소를 찾지 못함"이 됩니다.
- LLM: 빈 응답(공백만 포함) → `empty` 종류, 맨 앞 인사말(assistant)은 빼고 보냄, 사용자 메시지가 없으면 요청 없이 `server` 실패. 약물 프리셋 기본값 512토큰·25초.
- 요청은 쿠키를 보내지 않고(`credentials: "omit"`), 타임아웃은 응답 본문까지 포함합니다. 응답 형식이 틀리면 Swift처럼 `network`로 묶습니다.
- 설정된 상태에서 `fetchVideos("")`만 예외(`TypeError`) — 두 분만 경로 영상이 섞이는 호출자 버그라서.

## 3. 결정이 필요한 것

### CPO — 제품·문구·개인정보
1. **챗 폴백의 운동 답** [#3]: 레드플래그를 보지 않습니다. 분석·운동 탭은 D1로 막았습니다(§6).
2. **레드플래그 만료**: 가장 최근 기록 하나만 보므로, 몇 주 전 신호도 새 기록을 넣을 때까지 운동을 막습니다(iOS와 같음). 유지?
3. **위험 증상 토글 4개 저장** [#46]: 지금은 판정에만 쓰고 저장하지 않습니다. 어지러움만 켠 기록은 지표가 전부 "정상"인데 홈 상태는 "확인 필요"입니다. `boolean | null`로 저장할지.
4. **상대 시간과 제목의 어긋남**(iOS 그대로): 같은 날 00:10 기록을 23:40에 보면 지표는 "어제", 카드 제목은 "오늘의 회복 상태".
5. **LLM으로 나가는 정보** [#14]: 챗 컨텍스트의 BMI·목표·위험 신호 여부는 처리방침 고지 범위를 넘습니다. 약물 요청은 품목명·수유 여부·산후 일수를 보냅니다. 수신자는 미국 Anthropic. 항목을 빼거나 방침을 고쳐야 합니다.
6. **자해 표현 선필터** [#7]: iOS처럼 없습니다. LLM이 켜지면 자해 메시지가 LLM으로 가고, 1577-0199/109/119 고정 답은 폴백에서만 나옵니다.
7. **LLM 답의 출처**: LLM이 준 출처가 확인된 표 출처와 같은 `src:` 칩으로 보입니다 [원칙 4]. 다른 모양으로 할지, 빼거나 둘지. LLM이 "unknown"이면 표의 "정보 부족"을 대체하는 것도 확인 필요.
8. **로그아웃·공용 PC** [#19]: 로그아웃해도 건강 데이터가 브라우저에 평문으로 남습니다. 게스트 데이터는 다음 카카오 로그인 계정으로 넘어갑니다. 실계정 로그아웃 시 지울지, 게스트에게 "이 브라우저에서 삭제"를 줄지. (2026-09-27: 카카오 계정은 서버에 다 올라간 뒤 로그아웃하면 브라우저 사본을 지웁니다 — §7-3. 게스트·서버 저장 전 카카오는 그대로 남습니다.)
9. **"이 기기" 문구** [#48]: 로그아웃·계정 삭제·기록장 안내 문구가 iOS 그대로 "이 기기"입니다(D5로 우선 유지). 저장 실패(`storageAvailable=false`) 안내 문구도 없습니다.
10. **여러 탭 경합**: 변경 이벤트가 조금 늦게 오거나(뒤로 가기 캐시 복원 등) 받지 못하면 다른 탭의 최근 기록을 덮을 수 있습니다. 저장 직전마다 다시 읽을지.
11. **기록 날짜가 없는 손상 데이터**는 읽은 시각으로 채워집니다(iOS와 같음). 오래된 레드플래그 기록이 오늘 것처럼 보일 수 있습니다.
12. **색 대비** [#52]: iOS 팔레트 그대로라 WCAG AA에 못 미칩니다 — 레드플래그 카드 흰 글씨 2.76:1, 카드 안 칩 2.22, 상태 배지 1.67~2.45, 출처 칩 2.50, placeholder 3.04, 토글 켬 2.76·끔 1.65, 구분선 테두리 1.06~1.10, 슬라이더 트랙 1.27, **포커스 링(코랄) 2.64~2.76**. 텍스트 전용 색 토큰과 3:1 이상 포커스 링 토큰(예: #191F28)을 `globals.css`에 정해야 합니다. 화면을 만들며 더 나온 곳: 홈·운동 탭의 "{단계} 제외 — {사유}" 줄(`text-state-watch` #FFB020, 흰 배경 약 1.8:1), 홈 면책·기분 카드 안내(`text-text-subtle` #8B95A1, 약 3.0:1). 아이콘·배지용 watch 색은 두고 글자용 짙은 watch 토큰을 더할지, iOS 색을 그대로 받아들일지 — 정하면 모든 화면에 한 번에 적용합니다.
13. **숨은 "출처: " 낭독 문구** 유지 여부.
14. ~~`/dev/components` 카탈로그~~ — 2026-09-27 삭제했습니다(예시 라벨이 실제 서비스에 나가지 않게). 번호는 참조용으로 남깁니다.
15. **"src:회복 단계 기준" 칩** [#37]: 문헌이 아닌 라벨인데 출처 칩 모양입니다.
16. **용어** [#63]: 주의 라벨 "치골결합 이개" vs 차단 사유 "치골결합 통증".
17. **다음 단계 동률**: 자연분만 2~5주에 '골반저근'이 '기능 강화'(6주)보다 먼저 나옵니다(Swift `min(by:)` 그대로).
18. **가까운 산부인과**: 20km 안에 없으면 "주변에서 산부인과를 찾지 못했어요."로 끝납니다 — 그대로 둘지, 119·응급실 안내 줄을 붙일지(문구 필요), 서버 프록시로 넓힐지. 키 미설정 문구(§6 웹 신규 문구), `HP8` 필터 승인, 장소명 검색 대체, 처리방침의 "Apple" → "카카오" 수정 [#34], 응답 형식 오류를 "네트워크" 문구로 둘지.
19. **전화 링크**: 데스크톱 브라우저에서 `tel:`이 아무 일도 안 할 수 있습니다. 표시 방식 결정.

### 임상 자문
1. 레드플래그 `neuro_flag`·`cardioresp_flag`·`dvt_suspect`의 출처(지금은 출처 칩 없음 — 지어내지 않음).
2. 주차 기준·금기 3매핑(ExerciseRules.swift:74) 확정. 바뀌면 `RULES_VERSION`을 올립니다.
3. 기분 기준 14일·5회·연속 3회(`mood-draft-0.1`) 확정.
4. 약물·챗 키워드가 부분 문자열로 맞아 엉뚱한 답이 나옵니다 — "회음부"·"회복"→날생선(회), "파티"→차(티), "생선회"→수은, 챗 "커피"·"피곤"→출혈. 단어 단위로 바꾸면 규칙 변경이라 버전을 올립니다.
5. 체중 목표 수치(주당 0.5kg, 6개월 5~10%, BMI 23)의 출처 [#37].

### content.json 수정 요청
- `home_metrics.lochia.gate` 문구가 실제 규칙과 다름 [#40] — 코드는 Swift대로(일수 없음 → 표시·판정 보류, 10일 미만 → 숨김, 10일 이상 → 판정).
- `record_normal`을 `{title, body}`로, `weight_plan` 칩을 템플릿 키로 [#53]. 바꾸면 `record.ts`·`weight.ts`가 일부러 실패하니 한 줄씩 고칩니다.
- Swift에서 손으로 옮긴 화면 문구를 키로 추가 [#5, #25, #27]: 지표 이름·상태 라벨·회복 상태 라벨·상태 카드 제목, 운동 탭 섹션·배지, 단계 라벨, 약물 화면 헤더·"AI 답변" 칩, 챗 인사말·FAQ 제목, 지원사업 화면 문구, 분만 방식·목표 이름. 지금은 코드에 `// 원문: File.swift:LINE`으로 표시돼 있습니다.

### 백엔드
서버 쪽 요청 사항은 비공개 문서 `docs/private/BACKEND_TODO.md`에 있습니다(공개 저장소에 올리지 않음).

## 4. 화면을 만들 때 지킬 연결 규칙

### 주소 지도 (2026-09-27 재구성)
"/"는 누구나 보는 **서비스 소개(랜딩)** 이고, 앱은 로그인·온보딩을 마친 뒤 `/home/`부터 시작합니다. 경로 파일은 얇게 두고 화면은 `src/features/<기능>/`에 있습니다.

| 주소 | `ROUTES` | 파일(`src/app/…`) | 관문(`features/flow/gate.ts`) | 폭 |
|---|---|---|---|---|
| `/` | `landing` | `page.tsx` → `features/landing/LandingPage.tsx` | 공개 — 늘 그림, 이동 없음 | 전체 폭 |
| `/privacy/` | `privacy` | `privacy/page.tsx` | 공개 | 카드 기둥(`CardColumn`) |
| `/auth/callback/` | `authCallback` | `auth/callback/page.tsx` → `features/flow/AuthCallbackScreen.tsx` | 공개 — 카카오 로그인(Supabase)에서 돌아오는 주소. 설정이 없는 빌드에서도 파일은 있고, 열면 실패 안내 | 카드 기둥 |
| `/admin/` | `admin` | `admin/page.tsx` → `features/admin/AdminScreen.tsx` | 공개 — 관문이 옮기지 않음(로그인·온보딩과 무관). 권한은 화면이 Supabase `is_admin()`으로 확인하고 데이터는 서버 함수가 막음(§8). 메뉴에 링크하지 않음. 공개 주소라 예전 게스트를 익명 계정으로 옮기지 않음 | 전체 폭(본문 최대 64rem 가운데 — §9) |
| `/login/` | `login` | `login/page.tsx` | 로그인 전만. 로그인했으면 `rootScreenFor`대로 `/onboarding/` 또는 `/home/` | 카드 기둥 |
| `/onboarding/` | `onboarding` | `onboarding/page.tsx` | 로그인했고 온보딩 전만. **다시 동의**(Supabase 빌드에서 온보딩을 마쳤지만 지금 판의 동의가 없음 — `rootScreenFor` "consent")도 이 주소: `SCREEN_PATH.consent` = `/onboarding/?consent=1`, 화면은 `hasOnboarded`로 동의 단계만 그림 | 카드 기둥 |
| `/home/` `/exercise/` `/record/` `/journal/` `/journal/write/` `/journal/post/?id=` `/profile/` | `home` `exercise` `record` `journal` `journalWrite` `journalPost` `profile` | `(app)/(tabs)/…` (탭바 레이아웃) | main — 로그인·온보딩을 마친 뒤만 | 앱 껍데기(`AppShell`) |
| `/analyze/` `/guide/` `/lifestyle/` `/support/` `/substance/` `/chat/` `/region/` `/settings/` `/settings/profile/` | `analyze` `guide` `lifestyle` `support` `substance` `chat` `region` `settings` `settingsProfile` | `(app)/…` | main | 앱 껍데기 |
| 그 밖 | — | Next 404(`404.html`) | main으로 봄 — 로그인 전이면 `/login/`, 뒤면 404 | 전체 폭 |

- **레이아웃**: 루트 `layout.tsx`는 `StoreProvider` + `AppGate`만 두고 폭을 정하지 않습니다. 앱 화면은 `(app)/layout.tsx`의 `components/shell/AppShell.tsx`(폰 = 폰 폭 기둥 + 떠 있는 탭바, PC = 왼쪽 사이드바 + 넓은 본문), 로그인·온보딩·처리방침·콜백은 `components/shell/CardColumn.tsx`(폰 = 폰 폭 기둥, PC = 가운데 카드)를 씁니다. 자세한 폭 규칙은 §7-2. (옛 `components/MobileColumn.tsx`는 쓰는 곳이 없어 지웠습니다.)
- **관문**: 공개 주소(`/`·`/privacy/`·`/auth/callback/`·`/admin/`)는 저장소를 읽기 전에도 정적 HTML 그대로 그립니다. 그 밖은 읽기 전에는 아무것도 그리지 않습니다. `SCREEN_PATH.main`은 `ROUTES.home`입니다.
- **`(app)` 묶음 = main**: `src/routes.test.ts`가 `src/app`의 모든 `page.tsx`에 `ROUTES` 값이 있는지, 모든 `ROUTES` 값에 페이지가 있는지(콜백 제외), `(app)` 안 페이지는 관문이 main으로, 밖 페이지는 main이 아닌 것으로 보는지 확인합니다. 새 화면은 `ROUTES`에 먼저 더하고, 로그인 뒤 화면이면 `(app)` 안에 둡니다.
- `/dev/components` 카탈로그는 지웠습니다(§3 CPO 14).

### 연결 규칙
- **주소는 `ROUTES`로**(`src/routes.ts`): 링크·`backHref`·`router.push/replace`·관문 모두 `ROUTES.*`를 씁니다. `"/…/"` 문자열을 새로 적지 않습니다. **앱 홈은 `ROUTES.home`("/home/")** — `"/"`는 서비스 소개라 앱 안에서 "홈으로"에 쓰면 안 됩니다(탭바 홈, `SubPageHeader` 기본 뒤로, 분석 [완료], 챗 `?from=home` 뒤로 모두 `/home/`). 주소 비교는 `normalizePathname`·`isPathWithin`(끝 슬래시 무시, 접두만 같은 주소 제외).
- **하이드레이션**: `useAppStore()`의 `hydrated`가 false인 동안(정적 HTML·첫 렌더)은 사용자 데이터를 그리지 않습니다. 현재 시각에 따라 달라지는 값(`recoveryStateTitle`, `relativeRecordTime`, 산후 일차, 오늘의 기분 문항)은 브라우저에서 계산합니다 — 빌드 시각이 박히지 않게.
- **분석 폼** [#2]: [분석 시작] 때 폼 값(분만 방식·출산일·키·체중·산모수첩 7항목)을 `actions.updateProfile`·`updateMaternity`로 **먼저 저장**하고, 저장된 값으로 `runRecoveryAnalysis`를 부릅니다. 끝에서 끝 테스트: 폼에서 DRA를 켜면 13주 운동 탭의 `full_core`가 잠기고 홈에 "코어 강화 제외 — …" — 2026-09-27 빌드에서 브라우저로 확인했습니다.
- **영상 조회 결과 → 분석 입력**: `fetchVideos(routeTag(delivery))` 결과를 바꿔 넣습니다.
  `res.ok ? { state: "ok", videos: res.videos } : res.kind === "notConfigured" ? { state: "notConfigured" } : { state: "failed" }`
- **기록**: `buildSymptomRecord(form, profile.deliveryDate, now, id)`가 산후 일수를 계산하고 판정합니다. 결과 `record`를 그대로 `actions.addSymptomRecord(record)`에 넘깁니다.
  스토어가 id를 새로 붙이고 `record.date`(판정 시각)는 그대로 씁니다 — id 생성기가 둘이라 `buildSymptomRecord`의 `id` 인자는 저장에 쓰이지 않습니다(정리 후보).
- **마음 연계 카드**: `moodCardSignal(state.moodChecks, state.moodCardSnoozedUntil, now)`.
- **약물 체크**: 빈 입력 판정은 `normalizeSubstanceQuery`로. 늦게 도착한 이전 요청 결과는 버립니다(SubstanceCheckView.swift:95).
- **AI 상담**: `buildChatLlmRequest` 결과는 `llmComplete` 입력과 모양이 같아 그대로 넘깁니다. LLM 답은 plain text로만 렌더(마크다운·HTML 금지) [#51].
- **외부 링크**(영상·카카오 장소)는 `safeExternalUrl`과 `EXTERNAL_LINK_PROPS`를 거칩니다 [#51].
- **심각도 라벨**이 `null`이면 배지를 뺍니다(원시 코드 금지).
- 브라우저에 개인 데이터를 새로 저장하면 키 접두 `onmom.web.`를 씁니다(계정 삭제가 지움).
- **AI 상담으로 가는 링크**: 홈에서는 `/chat/?from=home`(`HOME_CHAT_HREF`) — 챗의 [뒤로]가 홈 탭(`/home/`)으로 옵니다. 쿼리가 없으면 프로필로 갑니다(`chatBackHref`).
- **하위 화면 떠나기**: 글쓰기·글 상세·프로필 편집은 `features/profile/LeaveSubPage.tsx`의 `useLeaveSubPage(부모)`로 떠납니다. 바로 앞 기록이 **부모 화면**일 때만 `router.back()`, 아니면 부모로 `replace`(주소로 바로 들어온 경우 등).
- **탭 밖 화면의 링크 끝은 늘 `/`**(trailingSlash). 쿼리는 `/journal/post/?id=…`처럼 슬래시 뒤에 붙입니다.

## 5. 아직 남은 중복

| 무엇 | 위치 | 제안 |
|---|---|---|
| "src:" 칩 토큰 해석 | `rules/recovery.ts evidenceChip` · `components/ui/evidence.ts parseEvidenceToken` | 화면은 UI 쪽을 쓰므로 `evidenceChip`을 지우거나 한쪽으로 합침 |
| 약물 LLM 512토큰 | `rules/substance.ts buildSubstanceLlmRequest` · `api/llm.ts LLM_PRESET_DEFAULTS.substance` | 요청이 늘 값을 싣으므로 api 쪽 값은 대체값일 뿐 — 하나만 남김 |
| 목표 표시명(전업/복직 예정) | `rules/chat.ts`(비공개) · `features/home/homeViewModel.ts GOAL_TITLE` · `features/profile/profileView.ts` · `features/onboarding/onboardingModel.ts GOAL_OPTIONS` | `rules/exercise.ts DELIVERY_TITLE` 옆으로 옮겨 내보내고(또는 content.json) 화면 사본 셋을 지움 |
| 분만 방식 선택지 | `onboarding/onboardingModel.ts` · `analyze/analyzeModel.ts` · `settings/settingsView.ts`의 `DELIVERY_OPTIONS` | 제목은 모두 `DELIVERY_TITLE`을 씀 — 배열 하나로 합칠 수 있음 |
| 브라우저 시계 훅 | `home/useNow.ts` · `profile/useNow.ts` · `onboarding/useLocalToday.ts` · `record/localDay.ts` | 공용 훅 하나(`useNow`·`useLocalDay`)로 합침 |
| 하위 화면 떠나기 | `features/profile/subPageExit.ts`·`LeaveSubPage.tsx` vs 공용 `SubPageHeader`(늘 고정 경로 push) | `SubPageHeader`에 `onBack`을 두거나 이 판단을 `components/ui`로 옮김 |
| 외부 링크 허용 호스트 | `api/safeUrl.ts` · `features/support/supportViewModel.ts SUPPORT_LINK_HOSTS`(www.gov.kr) | gov.kr을 공용 목록으로 옮김 |
| SF Symbol → lucide 아이콘 | `features/guide/sfIcons.ts` | 다른 화면이 쓰면 `components/ui`로 |
| 산모수첩 차단 칩 | `rules/recovery.ts BLOCKED_CHIPS` = content.json 주의 오버레이 칩과 같은 글자 | Swift도 별도 리터럴(RecoveryAnalysis.swift:35) — content.json 키가 생기면 그쪽으로 |

## 6. 화면 구현 (2026-09-27)

`src/app`의 자리표시(`ScreenPlaceholder`)를 모두 걷어내고 지웠습니다. 경로 파일은 얇게 두고 화면은 `src/features/<기능>/`에 있습니다.
주소·파일 위치는 §4 주소 지도가 기준입니다(2026-09-27 재구성으로 앱 홈이 `/`에서 `/home/`으로, 앱 화면이 `src/app/(app)/`으로 옮겨졌습니다).
보기 규칙(무엇을 어떤 조건에서 보일지)은 순수 함수로 두고 테스트합니다(DOM 테스트 환경은 없음).

### 만든 화면
| 화면 | 경로 | 폴더 | 요점 |
|---|---|---|---|
| 서비스 소개 | `/` | `landing` | 머리(로고·PC 섹션 링크·시작 버튼) · 두 칸 히어로(PC) · 한 줄 사명 · 주요 기능 6 · 이용 방법 3 · 지키는 것 4 · 마지막 권유(안내 줄은 버튼 아래) · 바닥글(면책·처리방침). 전체 폭. 시작 버튼은 하이드레이션 뒤 `/login/`·`/onboarding/`·`/home/`로 바뀌고, 앱을 쓰는 사람에게는 안내 줄을 숨김. 카카오·AI·산부인과 찾기 문장은 빌드 설정마다 다름 — §7-1 |
| 앱 관문 | 전체(`layout.tsx`) | `flow` | `rootScreenFor`로 로그인 → 온보딩 → (Supabase 빌드: 다시 동의 `/onboarding/?consent=1`) → 탭(`/home/`). `/`·`/privacy/`·`/auth/callback/`·`/admin/`은 늘 열림. 그 밖은 읽기 전에는 아무것도 그리지 않음 |
| 로그인 | `/login/` | `flow` | 카카오 버튼 비활성 + "준비 중"(D2 — Supabase 설정이 있는 빌드는 활성, §7-3), [게스트로 시작], 처리방침 시트 |
| 온보딩 4단계 | `/onboarding/` | `onboarding` | 출산일(오늘까지)·분만·수유 → 목표(복직일·체중 선택) → 동의. 입력은 [온맘 시작하기] 때 한 번에 저장(동의 전 저장 금지, 감사 #15) |
| 홈 | `/home/` | `home` | 히어로(출산일 있을 때만 n일차)·회복 상태·마음 카드·분석 링크·지표·지금 단계·체중 목표·빠른 기록·면책. 레드플래그면 "확인 필요"+단계 카드 대신 "운동 안내를 멈췄어요", 체중 카드 숨김, 마음 카드는 유지(D1) |
| 운동 | `/exercise/` | `exercise` | 분만 방식 없음 / 레드플래그(D1) / 출산일 없음(웹 신규) / 영상 준비 중 + 현재 단계 + 제외 줄(D7) / 연결 실패 / 없음 / 목록 |
| 기록 | `/record/` | `record`·`clinics` | 증상 폼 → 레드플래그 카드 + 가까운 산부인과(키 없으면 준비 중, D6) 또는 "위험 신호 없음", 오늘의 한 가지 질문, 최근 기록 5개 |
| 기록장 | `/journal/`·`/journal/write/`·`/journal/post/?id=` | `journal` | 이 기기 저장 안내, 목록/빈 상태, 글쓰기(제목 필수, Enter로 등록 안 됨), 상세·댓글 |
| 프로필 | `/profile/` | `profile` | 이름·산후 일차·주차, 내 정보(BMI 등), 재활 고려사항 칩, 허브 7개 |
| 설정·프로필 편집 | `/settings/`·`/settings/profile/` | `settings` | 로그아웃·계정 삭제(확인 창 — Supabase가 켜진 빌드는 `src/auth`를 거침, §7-3), 프로필 행, 알림 준비 중(D4), 개인정보. 편집은 출산일 먼저(D11) |
| 회복 단계 분석 | `/analyze/` | `analyze` | 폼 미리 채움 → 저장 후 분석(D10) → 결과. 레드플래그면 '가능'·영상 대신 멈춤 안내(D1) |
| 약물·음식 체크 | `/substance/` | `substance` | 표 먼저, LLM은 설정됐을 때 표에 없는 품목만 |
| AI 상담 | `/chat/` | `chat` | 미설정: 노란 배너 + 인사말 + 규칙 폴백 답, FAQ 숨김(D8). 기록은 저장하지 않음 |
| 지역 연계 | `/region/` | `region`·`clinics` | 안내 문구·동네 입력은 늘, 검색은 카카오 키가 있을 때만(D6) |
| 회복 가이드·생활 권고·지원사업 | `/guide/`·`/lifestyle/`·`/support/` | `guide`·`lifestyle`·`support` | content.json만. 출처가 빈 칩은 그리지 않음 |
| 개인정보처리방침 | `/privacy/` | `privacy` | PrivacyPolicyView.swift 원문 + 웹 안내 한 줄. [뒤로]: 바로 앞 기록이 서비스 소개·설정이면 그곳으로 돌아가고(history back), 아니면 로그인·온보딩을 마친 사람은 설정, 그 밖은 서비스 소개로(`privacyView.ts PRIVACY_BACK_FROM·privacyBackHref`) |

### 적용한 제품 결정 (기본값 — CPO가 바꿀 수 있음)
- **D1 레드플래그 활성**(최근 기록에 `redFlagCode`): 홈 "확인 필요"·단계 카드 → "운동 안내를 멈췄어요"·체중 카드 숨김, 운동 탭 레드플래그 블록(영상 조회 안 함), 분석 결과 '가능'·영상 숨김(`suppressExerciseOnRedFlag: true`) + 멈춤 안내. 마음 카드는 숨기지 않음.
- **D2** 카카오 로그인 비활성 + "준비 중", 게스트만 동작. 웹에 Apple 로그인 없음. (2026-09-27: Supabase 설정이 있는 빌드에서만 켜짐 — §7)
- **D3** 음성 입력 없음(마이크 버튼 없음). 홈 상단 버튼은 "AI 상담"으로 챗을 엶(iOS "말로 물어보기").
- **D4** 매일 리마인더 알림 미구현 — 설정에 토글 없이 "준비 중".
- **D5** "이 기기" 등 iOS 문구 그대로(§3 CPO 9).
- **D6** 카카오 JS 키가 없으면 가까운 산부인과는 준비 중 카드 + 검색 버튼 비활성. 지역 연계 화면의 안내·입력은 그대로.
- **D7** 영상 서버 미설정이면 운동 탭 "영상 준비 중" + 현재 단계(금기 단계 제외) + "{단계} 제외 — {사유}" 줄.
- **D8** LLM 미설정이면 챗 배너(`disclaimers.chat_banner`) + 인사말 + `chatReply` 폴백, FAQ 숨김, 선필터 없음.
- **D9** 온보딩 동의 문구 iOS 그대로(지금 웹도 이 브라우저에만 저장).
- **D10** 분석 폼은 프로필로 미리 채우고, 출산일 필수(오늘까지). [분석 시작] → 저장 → 저장값으로 분석.
- **D11** 프로필 편집에 출산일(맨 앞, 오늘까지) + MoreView 항목 + 산모수첩 7토글.
- **D12** 날짜는 네이티브 `<input type="date">`(과거만이면 `max`=오늘), 표시는 Swift처럼 한국어 형식.

### 웹 신규 문구 (CPO 확인 필요 — 코드에 `// 웹 신규 문구 — CPO 확인 필요`)
| 파일 | 문구 | 보이는 곳 |
|---|---|---|
| `features/flow/LoginScreen.tsx` | "준비 중" | 카카오 버튼 안(D2) |
| `features/onboarding/onboardingModel.ts` | "시작하기 진행 단계" | 단계 표시의 낭독 이름(안 보임) |
| `features/onboarding/OnboardingSteps.tsx` | "분만 방식" | 분만 선택 묶음의 낭독 이름(안 보임) |
| `features/privacy/policyText.ts` | "이 방침은 iOS 앱 기준이에요. 웹에 맞게 개정할 예정이에요." | 처리방침 화면 |
| `features/settings/settingsView.ts` | "준비 중" | 설정 > 알림(D4) |
| `features/exercise/exerciseModel.ts` | "출산일이 필요해요" / "운동은 출산 후 지난 주차에 따라 열려요. 프로필 > 설정 > 프로필 편집에서 출산일을 골라주세요." | 운동 탭, 분만 방식은 있고 출산일이 없을 때 |
| `features/exercise/exerciseModel.ts` | "운동 영상을 불러오고 있어요" | 영상 조회 스피너 낭독(안 보임) |
| `features/clinics/clinicsView.ts` | "가까운 산부인과 찾기는 준비 중이에요." | 카카오 키가 없을 때(D6) |
| `features/clinics/clinicsView.ts` | "산부인과를 찾고 있어요" | 검색 스피너 낭독(안 보임) |
| `features/substance/SubstanceCheckScreen.tsx` | "확인하고 있어요" | 조회 스피너 낭독(안 보임) |
| `features/chat/ChatScreen.tsx` | "나: " / "온맘: " | 말풍선 화자 낭독(안 보임) |
| `features/chat/ChatScreen.tsx` | "답변을 준비하고 있어요" | 답 기다리는 스피너 낭독(안 보임) |
| `features/support/SupportProgramScreen.tsx` | " (새 창)" | 새 탭 링크 낭독(안 보임) |
| `features/home/homeViewModel.ts` | "AI 상담" | 홈 상단 버튼(iOS "말로 물어보기", D3 — 2026-09-27 결정) |
| (서비스 소개·앱 껍데기·카카오 로그인·설정 서버 계정 문구) | — | §7-5에 따로 모았습니다. "산후 회복, 하루 1분 기록으로"는 APP_STORE.md §1 부제 원문이라 신규 문구가 아닙니다(전에 이 표에 잘못 있었음) |

### Swift와 다르게 한 것 (화면)
- **출산일이 없을 때 지어내지 않음**: 홈 n일차·단계 카드, 기록 부제의 일차, 설정 산후 일수("미설정"), 운동 탭(출산일 필요 블록). iOS는 출산일이 늘 있었습니다.
- **iOS 시트 → 하위 페이지**: 글쓰기·글 상세·프로필 편집·챗·빠른 기록(→ 기록 탭). 처리방침은 온보딩·로그인에서는 주소를 바꾸지 않는 `<dialog>` 시트(입력 보존).
- **온보딩 저장 시점**: 단계마다가 아니라 [온맘 시작하기] 때 한 번(동의 전 건강 정보 저장 금지).
- **홈**: 히어로 칩이 가로 스크롤 대신 줄바꿈. 지표의 상대 시간은 "지금"과 최근 기록 시각 중 늦은 쪽 기준("40초 후" 방지).
- **분석**: 실패는 iOS 알림 대신 `role="alert"` 카드, 닫기 대신 뒤로 링크, 출산일 필수.
- **챗**: [뒤로]가 늘 있음(홈에서 오면 홈, 아니면 프로필). 앞뒤 줄바꿈도 잘라 빈 메시지 방지. 보낸 뒤 입력창에 초점 유지.
- **기록장**: 댓글 입력은 Enter로 등록(Swift TextField는 onSubmit 없음 — 의도적으로 유지). 글 제목 Enter는 내용 칸으로 이동.
- **가까운 산부인과**: MapKit 대신 카카오 지도 SDK, 검증된 카카오 장소 주소가 없으면 지도 버튼 숨김, 아이콘 버튼 2.75rem.
- **SF Symbol** → lucide 근사 아이콘(가이드·지원사업).
- **접근성 추가**: 단계 전환 시 제목·결과로 초점 이동, 상태 영역 `aria-live`, 스피너 낭독 이름.

### 확인한 것 (2026-09-27)
`npm run typecheck`·`lint`·`test`(45파일 792개)·`build` 통과. `BASE_PATH=/onmom_web` 빌드를 `/onmom_web/` 아래에 띄워 헤드리스 Chrome으로 29항목을 확인했습니다:
첫 방문 → 로그인 → 게스트 → 온보딩 4단계 → 홈(63일차·아직 기록이 없어요), 기록 탭 어지러움 → 레드플래그 카드 → 홈 "확인 필요"·멈춤 안내 → 운동 탭 레드플래그 블록 → 분석 결과에 '가능' 없음,
프로필 허브 7개, 계정 삭제 → 로그인·`onmom.web.*` 비움, 코데인 → 피하세요, 챗 배너·FAQ 없음·폴백 답, 홈 → 챗 → 뒤로 = 홈, 분석 DRA → 홈·운동 탭 "코어 강화 제외", 탭 이동·깊은 주소 새로고침·기록장 글 등록, 콘솔 오류·4xx 없음.

### 알려진 한계 · 남은 일
- **카카오 지도는 실제 키로 한 번도 돌려보지 않았습니다.** 키를 켜기 전에 브라우저에서 지도·핀·목록을 확인해야 합니다(`features/clinics/ClinicMap.tsx`, 지도 타입은 화면 쪽에 따로 선언).
- **공용 `SubPageHeader`의 [뒤로]는 늘 고정 경로로 push** — 분석·설정·챗 등에서 방문 기록에 같은 화면이 두 번 남습니다(§5).
- **색 대비 토큰 결정**(§3 CPO 12)이 모든 화면에 걸려 있습니다.
- 스크린리더 실기기 점검, 글씨 150%·키보드 점검은 아직입니다. E2E는 저장소·CI에 없습니다(위 점검은 수동).
- 서버가 필요한 기능(카카오 로그인·영상·LLM·카카오 검색)은 지금 배포에서 모두 준비 중 상태로 동작합니다. 켜면 해당 화면을 다시 확인합니다(카카오 로그인은 §7-4 체크리스트를 먼저).
- 저장 실패(`storageAvailable=false`) 안내, PWA 매니페스트는 남았습니다.
- ~~처리방침(`/privacy/`)의 [뒤로]는 늘 설정으로 갑니다~~ — 2026-09-27 고침(위 화면 표).

## 7. 서비스 소개 · 폰/PC 반응형 · 카카오 로그인(Supabase) (2026-09-27 통합)

> 2026-09-28: 7-0의 "서버 저장" 줄, 7-3의 서버 저장 동의(`acceptServerStorageConsent`·`SERVER_STORAGE_CONSENT_VERSION` — 지금은 없음), 7-4 체크리스트는 **§8이 기준**입니다(동의 화면·동의의 판·웹 처리방침 초안이 생겼고, 게스트도 Supabase 익명 계정).

요청: "웹이니 서비스를 소개하는 메인 페이지, 실제 사용을 위한 로그인과 접속, 폰·PC 화면 크기에 맞게 바뀌는 화면. 가짜 목업이 아니다."
세 갈래(서비스 소개·앱 껍데기·Supabase)를 따로 만들고 검수·수정한 뒤 여기서 합쳤습니다.

### 7-0. 지금 상태 한눈에
| 무엇 | 지금 배포(설정 없음) | 설정을 넣으면 |
|---|---|---|
| 서비스 소개 `/` | 동작. 누구나 봄, 이동 없음 | 문장 일부가 빌드별로 바뀜(7-1) |
| 폰/PC 반응형 | 동작(7-2) | — |
| 게스트 로그인 | 동작. 기록은 그 브라우저에만 | 같음 |
| 카카오 로그인 | 버튼 비활성 + "준비 중" | `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(GitHub Variables)가 있으면 켜짐 — **7-4 체크리스트를 먼저** |
| 서버 저장(Supabase) | 없음(요청·번들 없음) | 카카오 사용자의 **서버 저장 동의** 뒤에만 올림. 그 동의를 받는 화면이 **아직 없어** 켜도 아무것도 올라가지 않음(7-4 첫 항목) |
| 설정 로그아웃·계정 삭제 | 지금까지처럼 브라우저에서만 | `src/auth`를 거침(7-3) |

### 7-1. 서비스 소개(`/`, `features/landing`)
- 구성: 머리(로고·PC에서만 섹션 링크 3개·시작 버튼) → 히어로(한 줄 소개·앱 설명·[시작하기]·[서비스 알아보기], PC는 오른쪽에 로고 판) → 사명 한 줄 → 주요 기능 6(App Store 설명 ■ 순서) → 이용 방법 3 → 온맘이 지키는 것 4 → 마지막 권유(버튼 + 아래 안내 줄) → 바닥글(면책·처리방침·©).
- **가짜 없음**: 이용자 수·평점·후기·통계·파트너 로고·예시 화면이 없습니다. 문구는 APP_STORE.md·Swift·content.json 원문을 쓰고, 새로 쓴 줄은 7-5에 있습니다.
- **시작 버튼**: 정적 HTML은 [시작하기] → `/login/`. 브라우저가 저장소를 읽으면 관문과 같은 판단(`startAction(rootScreenFor)`)으로 로그인 전 → `/login/`, 온보딩 중 → `/onboarding/`, 앱 사용자 → [내 회복 기록 열기] `/home/`. 앱 사용자에게는 안내 줄을 숨깁니다(자리는 남겨 버튼이 움직이지 않음).
- **빌드별 문장**(`LandingBuild` — `landingContent.ts paragraphText·ctaNoteFor`):
  - 카카오 로그인 켜짐(`isSupabaseConfigured`): 저장 둘째 문단·마지막 안내 줄이 "준비 중·예정"에서 켜진 문구로.
  - AI 켜짐(`isLLMBackendConfigured`): "서버로 전송되지 않습니다"·"AI는 판단하지 않아요."를 뺀 문구로(AI 상담이 BMI·위험 신호 여부를 보내고, 약물 체크의 표에 없는 항목은 AI가 답하므로).
  - 산부인과 찾기 꺼짐(카카오 JS 키 없음): 해당 문단 옆에 "가까운 산부인과 찾기는 준비 중이에요."
- 서비스 소개는 `/`에 늘 그려지고(공개 주소), 로그인한 사람도 이동시키지 않습니다. 검색 노출 막기(robots)는 루트 레이아웃 것을 그대로 받습니다.

### 7-2. 폰/PC 반응형 (`components/shell`)
| 폭 | 앱 화면(`(app)` — `AppShell`) | 로그인·온보딩·처리방침·콜백(`CardColumn`) | 서비스 소개 |
|---|---|---|---|
| 폰(48rem 미만) | 폰 폭 기둥(최대 30rem 가운데). 탭 5개 화면은 아래에 떠 있는 탭바, 하위 화면은 [뒤로] 머리만 | 폰 폭 기둥, 화면 높이 가득 | 한 줄, 좌우 1.25rem, 머리 메뉴 없음, 버튼 전체 폭 |
| 태블릿(48~64rem) | 같은 모양, 기둥 36rem | 같음 | 기능 2열 |
| PC(64rem 이상) | 왼쪽 16rem 사이드바(로고·탭 5·"더보기" 서비스 7·면책, 스크롤해도 제자리) + 본문 최대 64rem. 탭바 숨김. 키보드용 "본문 바로가기" | 배경 위 가운데 카드(최대 28rem, 창 높이에 맞춤) | 머리 섹션 링크, 두 칸 히어로, 기능 3열·단계 3열·원칙 4열, 본문 최대 72rem |
- 메뉴 정의는 한 곳(`appNav.ts`) — 탭바와 사이드바가 같이 쓰고, 서비스 7개는 프로필 허브(`PROFILE_MENU`)를 그대로 가져옵니다. 폰에는 탭바, PC에는 사이드바만 보여 "주요 메뉴" nav는 늘 하나입니다.
- 껍데기는 위아래 여백을 두지 않습니다 — 각 화면이 자기 여백을 갖습니다. AI 상담(`h-dvh`)이 PC에서 창보다 길어지지 않게 하려는 것이라, 껍데기에 세로 여백을 다시 넣으면 안 됩니다.
- PC 화면별: 기록 = 두 칸(왼쪽 폼, 오른쪽 결과·오늘의 질문·최근 기록) — 결과가 떠 있는 동안 폼은 잠기고 [확인하기]는 사라짐(iOS와 같은 흐름, 결과와 폼이 어긋나거나 같은 기록이 겹쳐 저장되지 않게). 읽기·입력 화면의 폭과 머리 위치는 **§9 PC 화면 틀**이 기준(2026-09-28 — 예전 40·42·44·60rem 제각각과 AI 상담 가운데 정렬을 없앰). AI 상담은 창 높이를 채움.
- 폰 화면은 바뀌지 않았습니다(각 담당이 전후 스크린샷을 픽셀 비교).

### 7-3. 카카오 로그인 · 서버 저장 · 설정 연결
- 설정 방법·동작 표·문제 해결은 `docs/SUPABASE_SETUP.md`. 코드는 `src/auth`(세션·콜백·복원), `src/store/sync`(엔진·합치기·표시), `supabase/migrations/0001_user_states.sql`(한 사람 = 한 행, RLS 본인만, `delete_my_account()`).
- **서버 저장 동의가 따로 있어야 올립니다**: 온보딩의 "내 기기에만 저장" 동의(`profile.consentAccepted`)만으로는 올리지 않고, `acceptServerStorageConsent()`가 불린 뒤(또는 이미 서버 행이 있고 게스트 기록을 가져온 것이 아닐 때)만 올립니다. 게스트 기록을 가져온 카카오 로그인은 다시 동의받을 때까지 서버 행에 섞지 않습니다. **지금 이 함수를 부르는 화면이 없습니다**(7-4).
- **설정 연결(이번 통합)**: `SettingsScreen.tsx`가 `useAccountSession()`(= `signOutEverywhere`·`deleteAccountEverywhere`)을 부릅니다. 판단은 `settingsView.ts performSignOut·performDeleteAccount`(테스트 있음).
  - Supabase가 없는 빌드: 지금까지와 똑같이 스토어에서 바로(로그아웃은 기록을 남기고, 삭제는 `onmom.web.*`을 비움).
  - 있는 빌드, 게스트: 결과는 같습니다.
  - 있는 빌드, 카카오: 확인 창 문구가 서버 안내로 바뀜 → 로그아웃은 남은 변경을 최대 8초 올리고("로그아웃하고 있어요", 두 버튼 잠김), 다 올라갔으면 Supabase 로그아웃 + 브라우저 사본 삭제. 못 올렸으면(네트워크·동의 전·새 형식 서버 기록) "아직 서버에 저장되지 않은 기록이 있어요" 창 → [그래도 로그아웃]이면 기록을 브라우저에 남긴 채 로그아웃, [취소]면 그대로.
  - 계정 삭제는 서버 `delete_my_account()`가 성공했을 때만 브라우저를 비웁니다. 실패하면 아무것도 지우지 않고 계정 카드 아래에 이유(네트워크 / 로그인이 끝남)를 `role="alert"`로 알립니다.
  - `<dialog>`의 close 이벤트가 늦게 와도 다음 창(경고 창)을 닫지 않게, 창마다 자기 것만 닫습니다(`closeConfirm`).
- 브라우저로 확인: 가짜 Supabase 주소로 빌드하고 응답을 흉내 내 A(새 카카오 사용자 — 쓰기 0번, 로그아웃 경고·[취소]·[그래도 로그아웃] 뒤 기록 남음·Supabase 로그아웃 1번), B(서버 행 있음, PC — 삭제 503 → 안내·아무것도 안 지움 → 다시 삭제 → 행 삭제·`/login/`·`onmom.web.*` 0개), C(다 올라간 카카오 로그아웃 → 브라우저 사본 0개)를 확인했습니다. **실제 Supabase·카카오로는 아직 한 번도 돌려보지 않았습니다.**

### 7-4. 카카오 로그인(Supabase)을 켜기 전 — 개인정보 체크리스트
전체 목록과 방법은 `docs/SUPABASE_SETUP.md` 맨 아래 "켜기 전 확인". 여기에는 화면·문구 쪽만 모읍니다. **첫 항목 없이 켜지 않습니다.**
1. **[필수] 서버 저장 동의 화면** — CPO 문구가 필요합니다(민감정보 별도 동의인지 법률 확인). 온보딩 3단계(카카오 계정일 때)에서 동의 → `acceptServerStorageConsent()`. 게스트 기록을 가져온 카카오 사용자(`useSyncStatus() === "waitingConsent"` + 온보딩 완료)에게 다시 받는 화면. 문구를 바꾸면 `SERVER_STORAGE_CONSENT_VERSION`을 올림(이미 서버 행이 있는 사용자는 예전 동의로 봄 — 다시 받아야 하면 행에 판을 저장하는 작업이 추가로 필요).
2. 온보딩 동의 문구 "건강 정보는 내 기기에만 저장 (서버 계정 없음)"·소제목 — 카카오 사용자에게 사실이 아니게 됨. 게스트/카카오를 나눠 씀.
3. 설정 "개인정보·안전" 문구 "건강 데이터는 내 기기에만 저장됩니다."(`settingsView.ts privacyBody`) — 같은 이유. 계정 삭제 힌트 "계정과 이 기기의 모든 건강 데이터가…"도 카카오는 서버까지 지운다는 점이 빠져 있음(확인 창 본문은 서버 문구로 바뀜).
4. 처리방침 2·3절(`features/privacy/policyText.ts`) 다시 쓰기, 수탁자 Supabase(서울)·국외 이전 고지 검토·수집 항목(카카오 회원번호·닉네임·이메일·사진 주소)·보관/파기, "이 방침은 iOS 앱 기준이에요…" 안내 정리.
5. 로그인 화면 "로그인 시 개인정보·민감정보 처리 방침에 동의하게 됩니다."가 개정된 방침을 가리키는지.
6. 서비스 소개의 카카오 켜짐 문장 "카카오로 로그인하면 기록을 서버에 저장해, 여러 기기에서 이어 쓸 수 있어요." — 1이 없으면 **거짓**(아무것도 올라가지 않음). 켜짐 제목 "건강 정보는 이 브라우저에"도 게스트에게만 맞음.
7. 7-5의 설정 서버 계정 문구 9개 확인.
8. 관리자 접근(조직 멤버 최소·MFA·`state` 열람 금지 원칙), Email 공급자·익명 로그인 끄기, 백업 보관 기간·사고 대응 연락 체계.
9. 켠 뒤: 휴대폰·PC로 로그인·동기화·로그아웃·계정 삭제를 실제로 한 번씩(SUPABASE_SETUP §8).

### 7-5. 웹 신규 문구 (CPO 확인 필요 — 코드에 `// 웹 신규 문구 — CPO 확인 필요`)
| 파일 | 문구 | 보이는 곳 |
|---|---|---|
| `features/landing/landingContent.ts` | "내 회복 기록 열기" | 시작 버튼 — 로그인·온보딩을 마친 사람 |
| 〃 | "서비스 알아보기" | 히어로 보조 버튼(아래 소개로) |
| 〃 | "출산 후 퇴원부터 산후 6주 검진까지, 아무도 산모의 회복을 확인하지 않는 공백을 메우는 서비스입니다." | 사명 한 줄(web/README 첫 문장) |
| 〃 | "주요 기능" / "이용 방법" / "온맘이 지키는 것" | 섹션 이름·PC 머리 메뉴 |
| 〃 | "지금은 게스트로 시작할 수 있어요. 카카오 로그인은 준비 중이에요." | 마지막 권유 안내 줄(카카오 꺼짐) |
| 〃 | "게스트 또는 카카오 계정으로 시작할 수 있어요." | 같은 자리(카카오 켜짐) |
| 〃 | "© 온맘" | 바닥글 |
| 〃 | "온맘 — 산후 회복, 하루 1분 기록으로" | 브라우저 탭 제목(`LANDING_META`) |
| 〃 | "건강 정보는 이 브라우저에" | 기능 카드 제목(APP_STORE "내 기기에" → 브라우저) |
| 〃 | "게스트로 시작하면 증상 기록, 오늘의 질문 답변, 산모수첩 확인 항목, 체중, 기록장 글은 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 언제든 설정에서 계정과 모든 데이터를 삭제할 수 있어요." | 저장 카드 첫 문단(AI 켜짐이면 "…저장됩니다."로 "서버로 전송되지 않습니다"를 뺌) |
| 〃 | "카카오 로그인은 준비 중이에요. 로그인이 열리면 동의를 받은 뒤 기록을 서버에 저장해, 여러 기기에서 이어 쓸 수 있게 할 예정이에요." | 저장 카드 둘째 문단(카카오 꺼짐) |
| 〃 | "카카오로 로그인하면 기록을 서버에 저장해, 여러 기기에서 이어 쓸 수 있어요." | 같은 자리(카카오 켜짐 — 7-4의 6) |
| 〃 | "의료기기가 아니에요" / "판정은 정해진 규칙이 해요" / "출처를 함께 표시해요" | 지키는 것 카드 제목("점수를 매기거나 진단하지 않아요"는 APP_STORE 원문) |
| 〃 | "병원에 가야 할 신호인지, 지금 주차에 할 수 있는 운동이 무엇인지는 미리 정해 둔 규칙으로 안내해요. AI는 판단하지 않아요." | 규칙 카드(AI 켜짐이면 마지막 문장을 뺌) |
| 〃 | "질환명을 추정하거나 등급을 내지 않고, 즉시 병원 확인이 필요한 신호까지만 알려드려요." | 점수 카드 |
| 〃 | "회복 가이드의 모든 항목에 출처를 표시해요." / "출처가 확인되지 않은 내용에 출처를 지어 붙이지 않아요." | 출처 카드 |
| `components/shell/appNav.ts` | "주요 메뉴" | 탭바·사이드바 nav 낭독 이름(안 보임) |
| 〃 | "더보기" | PC 사이드바 서비스 7개 묶음 이름 |
| 〃 | "본문 바로가기" | PC 건너뛰기 링크(초점을 받을 때만 보임) |
| `features/flow/AuthCallbackScreen.tsx` | "로그인하고 있어요" / "기록을 불러오지 못했어요" / "잠시 후 다시 시도해주세요." | 카카오 로그인 콜백(카카오 켜짐일 때만 쓰임) |
| `features/settings/settingsView.ts` | "서버에 저장된 기록은 같은 카카오 계정으로 다시 로그인하면 이어서 볼 수 있어요. 공용 기기에 남지 않도록 이 브라우저의 기록은 지워요." | 로그아웃 확인 창(카카오 + Supabase) |
| 〃 | "아직 서버에 저장되지 않은 기록이 있어요" / "지금 로그아웃하면 이 기록은 서버에 저장되지 않고 이 브라우저에만 남아요." / "그래도 로그아웃" | 못 올린 기록 경고 창 |
| 〃 | "계정 정보와 서버·이 브라우저에 저장된 프로필·증상 기록·글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요." | 계정 삭제 확인 창(카카오 + Supabase — MoreView.swift:109에 서버를 더함) |
| 〃 | "계정을 삭제하지 못했어요. 아무것도 삭제되지 않았어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요." | 서버 삭제 실패 |
| 〃 | "로그인이 끝나 계정을 삭제하지 못했어요. 아무것도 삭제되지 않았어요. 로그아웃한 뒤 카카오로 다시 로그인해 삭제해 주세요." | 서버 삭제 — 세션 없음 |
| 〃 | "로그아웃하고 있어요" / "계정을 삭제하고 있어요" | 진행 중(계정 카드 아래, `aria-live`) |

**문구에서 CPO가 따로 볼 것**: 사명 줄 "아무도 … 확인하지 않는"이 강함 · 기능 제목 "1분 이상 증상 기록"(APP_STORE 원문)이 "1분 넘게"로 읽힘 · 카카오 켜짐 빌드의 "건강 정보는 이 브라우저에"는 게스트에게만 맞음 · AI 켜짐 빌드에서 약물 체크는 표에 없는 항목을 AI가 판정하므로 "판정은 정해진 규칙이 해요"가 넓음 · 카카오 꺼짐 문단의 "동의를 받은 뒤 … 예정"은 아직 없는 동의 화면을 약속함 · 설정 서버 계정 문구는 "이 브라우저"를 쓰지만 iOS 원문(로그아웃·삭제 힌트)은 "이 기기"(§3 CPO 9).

### 7-6. 적용한 결정 (기본값 — 바꿀 수 있음)
- **D13** `/` = 공개 서비스 소개, 앱 홈 = `/home/`. 로그인한 사람도 `/`에서 이동시키지 않고 버튼만 [내 회복 기록 열기]로.
- **D14** 반응형 경계: md 48rem(기둥 30 → 36rem), lg 64rem(사이드바). PC에서 탭바 대신 사이드바, 폰 화면 모양은 그대로.
- **D15** 서버 저장은 별도 동의 뒤에만. 서버 행이 있으면 예전 동의로 봄. 동의 화면이 생기기 전에는 카카오 사용자 기록도 브라우저에만.
- **D16** 설정 로그아웃·삭제는 Supabase 빌드에서 `src/auth`를 거침. 카카오 로그아웃은 다 올라갔을 때만 브라우저 사본을 지우고, 못 올렸으면 경고 뒤 사용자가 고름. 삭제는 서버 먼저, 실패하면 아무것도 지우지 않음.
- **D17** 서비스 소개의 카카오·AI·산부인과 찾기 문장은 빌드 설정에 따라 바뀜(켜지면 거짓이 되는 문장을 남기지 않음).
- **D18** 처리방침 [뒤로]: 앞 기록이 서비스 소개·설정이면 그곳으로, 아니면 앱 사용자는 설정·그 밖은 서비스 소개.

### 7-7. 확인한 것 (2026-09-27 통합)
- `npm run typecheck` 통과 · `npm run lint` 통과 · `npm test` 55파일 956개 통과 · `npm run build`·`BASE_PATH=/onmom_web npm run build` 통과(정적 페이지 24개, `out/index.html` = 서비스 소개, `out/home/index.html` 있음).
- `BASE_PATH=/onmom_web` 빌드를 `/onmom_web/` 아래에 띄워 헤드리스 Chrome으로 43항목 통과: 서비스 소개가 이동 없이 뜨고 폰 가로 스크롤 없음 · [시작하기] → `/login/` · 카카오 버튼 비활성 + "준비 중"(폰·PC) · 게스트 → 온보딩 4단계 → `/home/`(63일차·아직 기록이 없어요) · 로그인 뒤 `/`도 그대로, [내 회복 기록 열기] → `/home/` · 기록 어지러움 → 레드플래그 카드 → 홈 "확인 필요"·"운동 안내를 멈췄어요" · 운동 탭 "운동 영상 추천을 멈췄어요" · 게스트 로그아웃 → `/login/`·기록 남음 → 다시 게스트면 온보딩 없이 홈 · PC 1440: 보이는 "주요 메뉴" 1개, 프로필 허브 7개·사이드바 12개 모두 열리고 현재 표시가 맞음, AI 상담 높이 = 창 높이, 서비스 소개 머리 메뉴 · 계정 삭제 → `/login/`·`onmom.web.*` 0개 · 콘솔 오류 0, 4xx 0.
- 설정 연결은 가짜 Supabase 빌드로 따로 14항목 통과(7-3). 확인 뒤 설정 없는 보통 빌드로 되돌렸습니다.

### 7-추가 (2026-09-27 배포 직전)
- **"온맘" 글자·로고 → 소개 페이지(`ROUTES.landing`)**: 앱 홈 상단(휴대폰), PC 사이드 메뉴 로고, 로그인 화면 로고. 앱 홈으로 가는 길은 탭바·사이드 메뉴의 '홈'. (CPO 요청)
- **PC 앱 홈 상단의 "온맘" 글자 숨김**: 사이드 메뉴에 로고가 있어 중복. 스크린 리더용 제목(h1)은 남긴다.
- **회복 단계 분석(PC)**: 폼도 결과처럼 왼쪽 정렬(최대 40rem) — 단계가 바뀔 때 머리가 옆으로 튀지 않게(화면 QA).
- **PC 사이드 메뉴 — 낮은 창**: 창 높이 52rem 이하에서 로고·묶음·면책 간격만 줄인다(메뉴 항목 높이 2.75rem 유지). 640px 미만에서는 사이드 메뉴 자체가 스크롤된다.
- **가이드 전화번호**: `1577-0199`처럼 하이픈에서 줄바뀌지 않게 번호만 한 덩어리로 묶는다(`splitPhoneNumbers`, 글자는 그대로).

## 8. 실서비스 전환 (2026-09-28 통합)

요청(CPO, 2026-09-28): Supabase로 실제 사용자 관리 — **게스트 = Supabase 익명 사용자**(동의 뒤에만 서버 저장), 나중에 카카오로 로그인하면 같은 계정(`linkIdentity`), 가까운 산부인과는 카카오 지도, 운동 영상은 서버 함수 프록시(영상 서버에 CORS 없음), AI 상담은 서버 함수 → Anthropic, 관리자 화면은 집계·계정 메타데이터만. **Supabase 값이 없는 빌드(지금 배포)는 지금과 똑같이** 브라우저 전용 게스트로 동작.
다섯 갈래(계정·동의/개인정보·서버 함수·관리자·CI/문서)를 따로 만들고 검수·수정한 뒤 여기서 합쳤습니다. 설정 방법은 `docs/SUPABASE_SETUP.md`, 켜기 전 법·운영·제품 점검은 `docs/LAUNCH_CHECKLIST.md`, 함수는 `docs/SUPABASE_FUNCTIONS.md`, 동의·방침 초안은 `docs/privacy/CONSENT_AND_POLICY_DRAFT.md`.

### 8-0. 구조
```
브라우저 — GitHub Pages 정적 사이트(/onmom_web, 서버 코드 없음)
│   빌드 값(공개): NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — 둘 중 하나라도 없으면 아래 Supabase 화살표가 모두 없다
│                  NEXT_PUBLIC_KAKAO_JS_KEY(지도, Supabase와 별개) · NEXT_PUBLIC_TURNSTILE_SITE_KEY(선택) · NEXT_PUBLIC_AI_CHAT_ENABLED(기본 꺼짐)
│
├─▶ Supabase Auth(서울) ─ 게스트: signInAnonymously(+Turnstile 토큰, 선택)
│        │               카카오: OAuth PKCE — 새 사용자 signInWithOAuth, 게스트는 linkIdentity
│        └─▶ 카카오 로그인(kauth.kakao.com) — REST 키·클라이언트 시크릿은 Supabase 대시보드에만
│
├─▶ Supabase DB(서울, RLS) ─ user_states: 한 사람 = 한 행(건강 기록 JSON + consent_version·consent_accepted_at 칸)
│        │                    ↑ 첫 읽기 전에는 쓰지 않고, 지금 판의 동의(hasCurrentConsent) 전에는 올리지 않음
│        ├ delete_my_account()  — 계정 삭제(서버 먼저, 성공해야 브라우저를 비움)
│        ├ admins · is_admin() · admin_overview() · admin_list_users() — /admin/(집계·계정 메타데이터만)
│        └ llm_usage · llm_consume_quota() — AI 한도(사용자 id·시각만, 2일 뒤 삭제, 브라우저 접근 없음)
│
├─▶ Supabase Edge Functions
│        ├ videos (verify_jwt=false, 사용자 식별값 없음) ──▶ 영상 서버 hackathon-video-api.onrender.com
│        └ chat   (함수 안에서 getUser로 토큰 확인 · 위기 표현 선필터 · 한도) ──▶ Anthropic(미국, claude-opus-5)
│                  브라우저는 NEXT_PUBLIC_AI_CHAT_ENABLED=true + 이 계정의 AI 국외 이전 동의 뒤에만 부름.
│                  보내는 것: 같은 대화의 최근 메시지(최대 20개, 위기 표현 턴 제외) + 산후 주차·분만 방식·수유 여부
│
└─▶ 카카오 지도 JS SDK(dapi.kakao.com) — 입력한 동네 주소 → 좌표 → 반경 20km 병원(HP8) 검색 · 지도
```
비밀 값(Anthropic 키, DB 비밀번호, Supabase 액세스 토큰, 카카오 REST 키·시크릿, Turnstile 비밀 키)은 코드·저장소에 없습니다 — GitHub Secrets → Supabase 함수 비밀값, 또는 대시보드에만. 함수의 서버 키는 Supabase가 넣어 주는 `SUPABASE_SECRET_KEYS`("default")를 먼저, 없으면 예전 `SUPABASE_SERVICE_ROLE_KEY`(`_shared/auth.ts pickServerKey`).

### 8-1. 모듈과 파일
| 갈래 | 파일 | 요점 |
|---|---|---|
| 계정 | `src/auth/**`(`session.ts`·`authFlow.ts`·`turnstile.ts`·`kakaoAccount.ts`·`remote.ts`·`useAuth.ts`), `src/store/sync/**`, `features/flow/{AppGate,LoginScreen,loginText,AuthCallbackScreen,callbackRoute}`, `features/settings` | 게스트 = 익명 계정("guest-<Supabase id>"). 익명 로그인이 안 되면(꺼짐·한도·CAPTCHA·오프라인) 이 브라우저 전용 게스트로 시작하고 **앱 화면**을 열 때 다시 옮김(공개 화면은 옮기지 않음 — `allowGuestUpgrade`). 게스트 → 카카오는 `linkIdentity`, 취소 말고 모든 거절은 "카카오로 로그인 → 익명 사용자 삭제(서버에 카카오가 안 붙었을 때만) → `mergeStates`로 합침". 설정: 게스트 = [카카오 계정 연결]·삭제(로그아웃 없음), 카카오 = 로그아웃·삭제(서버 먼저) |
| 동의·개인정보 | `domain/consent.ts`, `features/onboarding/{consentText,ServerConsentStep,OnboardingFlow,onboardingModel}`, `features/privacy/{dataItems,webPolicyText,policy}` | Supabase 빌드의 온보딩 동의 = 필수 (a) 개인정보 수집·이용 (b) 민감정보(건강정보) 처리 (c) 만 14세 이상 — 따로따로, 전부 켜야 시작. (d) AI 국외 이전은 **안내만**(동의는 AI를 처음 쓸 때). 법이 명확히 표시하라는 줄은 크게·굵게·밑줄. [동의하지 않고 나가기] → 확인 창 → 계정 삭제. `/privacy/`는 웹 방침 초안("초안 — 법률 검토 전") |
| 서버 함수 | `supabase/functions/**`, `src/api/{llm,video,http}.ts`, `features/chat/{aiConsent,AiConsentCard,chatModel,ChatScreen}`, `features/substance` | `llmComplete`·`fetchVideos`는 Supabase가 있으면 함수를, 없으면 예전처럼 `NEXT_PUBLIC_LLM_URL`·`NEXT_PUBLIC_VIDEO_URL`. 위기 표현(content.json + 서버 목록)은 어떤 모드에서도 규칙 답(1577-0199/109/119)으로, AI로 보내지 않고 나중 요청에서도 뺌. 약물 체크는 표 먼저, 표에 없는 항목만 AI("AI 답변" 표시) |
| 관리자 | `src/app/admin/page.tsx`, `features/admin/**`, `supabase/migrations/0002_admin.sql` | `public.admins`에 있는 카카오 사용자만(익명 사용자는 명단에 있어도 거절). 숫자 카드 5·최근 30일 신규 막대(표로 보기)·사용자 목록 20개씩. 이메일·닉네임·건강 기록 없음 |
| CI·문서 | `.github/workflows/{supabase,deploy}.yml`, `supabase/config.toml`, `.env.example`, `docs/{SUPABASE_SETUP,SUPABASE_FUNCTIONS,LAUNCH_CHECKLIST}.md` | "Supabase" 워크플로(main만): 값 확인 → `npm test` → link → `db push`(0001→0003) → 함수 비밀값(빈 값은 건너뜀, 지우지 않음) → videos·chat 배포 → chat 로그인 확인. 사이트 배포는 Variables만 읽음 |

**마이그레이션**: `0001_user_states`(표·RLS 본인 행·`delete_my_account()`·동의 칸 — 예전 판 표에는 칸을 더함) → `0002_admin`(0001의 동의 칸이 없으면 멈춤) → `0003_llm_usage`. 모두 여러 번 실행해도 같은 결과.

### 8-2. 동의 계약(모든 모듈 공통)
- `UserProfile.consentVersion`·`consentAcceptedAt`(기본 `null`). `CURRENT_CONSENT_VERSION = "web-2026-09-28"`, `hasCurrentConsent(profile)` = `consentAccepted && consentVersion === CURRENT_CONSENT_VERSION`.
- `rootScreenFor`: Supabase 빌드에서 로그인·온보딩을 마쳤는데 `!hasCurrentConsent` → `"consent"` → 관문이 `/onboarding/?consent=1`로(모든 앱 주소에서). 온보딩 화면은 `hasOnboarded`면 동의 단계만 그리고, [동의하고 계속하기] 뒤 `/home/`. 설정 없는 빌드는 이 단계가 없음(판을 보지 않음).
- 서버 업로드는 `hasCurrentConsent`일 때만. 이 브라우저에 남아 있던 다른 사람일 수 있는 기록을 가져왔으면(`marks.ts`) 서버의 동의 시각과 무관하게 이 브라우저에서 다시 동의해야 올림.
- 문구를 바꾸면 판을 올림 — `consentStep.test.ts`(온보딩 (a)~(c)·부제·안내 줄)와 `aiConsent.test.ts`(AI 카드·전문)가 글자의 지문을 판에 묶어 둠. AI 동의는 따로 `AI_CONSENT_VERSION = "web-2026-09-28.2"`, 이 브라우저의 계정별 localStorage(`onmom.web.aiConsent.v1`).

### 8-3. 동작 — 설정 없음 vs 있음
| 상황 | 설정 없음(지금 배포) | Supabase 값 있음 |
|---|---|---|
| 서비스 소개 | 저장 카드 "건강 정보는 이 브라우저에" | "건강 정보는 동의한 뒤에만 저장해요"(`sectionTitle`), 카카오 켜짐 문장 |
| 로그인 | 카카오 "준비 중", iOS 원문 안내 줄 | 카카오 켜짐(→ Supabase authorize, PKCE), 안내 줄은 알림만("건강 정보는 따로 동의를 받은 뒤에만 서버에 저장돼요.") |
| 게스트로 시작 | 브라우저 전용, 요청 없음 | 익명 계정. 못 만들면 브라우저 전용으로 이어지고 다음 앱 화면에서 다시 시도(오류 창 없음 — 기록은 잃지 않음) |
| 온보딩 동의 | iOS 한 토글 | 필수 3개 + AI 안내 + [동의하지 않고 나가기] |
| 예전 게스트(판 없는 동의) | 그대로 | 앱 주소를 열면 `/onboarding/?consent=1` |
| 운동 영상 | `NEXT_PUBLIC_VIDEO_URL`이 있으면 직접, 없으면 준비 중 | 함수 `videos` |
| AI 상담·약물 AI | 준비 중 배너·규칙 답 | `NEXT_PUBLIC_AI_CHAT_ENABLED=true`일 때만 → 처음 쓸 때 AI 국외 이전 동의 카드 → 함수 `chat` |
| 설정 | iOS 문구·로그아웃·삭제(브라우저) | 개인정보 문구 서버판, 게스트 = 카카오 연결·삭제, 카카오 = 로그아웃·삭제(서버 먼저) |
| `/admin/` | "권한이 없어요" + 설정 없는 빌드 안내, 요청 없음 | 로그인 전·게스트·일반 사용자 = "권한이 없어요"(내 계정 ID), 관리자 = 집계 |
| 산부인과 찾기 | 카카오 JS 키가 있으면 동작(Supabase와 별개) | 같음 |

### 8-4. 지금 상태 (2026-09-28 03:30 확인)
| 무엇 | 상태 |
|---|---|
| 공개 사이트 | 바뀌지 않음(설정 없는 빌드) — 아래 스모크 ① |
| Supabase Auth 설정 | 공개 `/auth/v1/settings`로 확인: **익명 로그인 ON, 카카오 ON, Email OFF, 가입 허용** — SETUP B-1·B-2 일부는 이미 됨. 공개 값으로 확인할 수 없는 것: **Allow manual linking**, **Allow users without an email**, **URL Configuration**(Site URL·Redirect URLs), 카카오 키·시크릿 값(카카오 authorize로 이동은 함) |
| DB | 마이그레이션 **미적용** — `user_states` 없음(`PGRST205`). SETUP D-1 필요 |
| 함수 | **미배포** — `/functions/v1/videos` 404. SETUP D-1 필요 |
| GitHub Variables·Secrets | 없음(C-1·C-2·C-3) |
| 카카오 지도 | 실제 JavaScript 키로 `http://localhost:3000` 빌드에서 확인 — "서울 강남구 역삼동" → 산부인과 목록(314m…)·지도·핀, 폰·PC, 콘솔 오류 0(스모크 ③). 공개 사이트는 Variable `NEXT_PUBLIC_KAKAO_JS_KEY` + D-2로 켜짐 |
| 시험 흔적 | 스모크 ②가 운영 프로젝트에 **익명 사용자 1명**을 만들었습니다(2026-09-28 03:22 KST 무렵, 건강 기록 없음 — 표가 아직 없음). **Authentication → Users**에서 지워 주세요(SETUP F-14와 같은 정리) |

### 8-5. 주인이 할 일 (순서는 SETUP이 기준)
1. **B** Supabase 대시보드: B-1 **Allow manual linking ON** 확인(익명 로그인·가입은 이미 ON), B-2 카카오 REST API 키·Client Secret·**Allow users without an email ON**, B-3 Site URL `https://5seoyoung.github.io/onmom_web/`·Redirect URLs 두 개, B-4 Publishable key 복사(Secret key `default`는 건드리지 않음). 카카오 A-7 동의항목 3개 "선택 동의"(KOE205 방지)·A-8 시크릿 활성화.
2. **C-1·C-2** GitHub Secrets(`SUPABASE_ACCESS_TOKEN`·`SUPABASE_DB_PASSWORD`, AI는 나중에 `ANTHROPIC_API_KEY`)와 Variable `SUPABASE_PROJECT_REF` → **D-1** "Supabase" 워크플로(main) — 표 0001~0003·함수 videos·chat. Summary 경고 확인.
3. `LAUNCH_CHECKLIST` 1~3단계(법·개인정보·운영·제품) — 특히 1-10(동의 전 익명 계정), 동의·방침 초안 법률 검토, Auth 감사 로그 보관, 백업 보관 기간.
4. **C-3** Variables `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`NEXT_PUBLIC_KAKAO_JS_KEY`(지도만 먼저 켜도 됨)·`NEXT_PUBLIC_AI_CHAT_ENABLED=false` → **D-2** 사이트 배포.
5. **E** 카카오로 로그인 → `/admin/`의 내 계정 ID → `insert into public.admins …`. **F** 휴대폰·PC 확인 14항목(F-4는 같은 UID 또는 새 UID + 익명 사용자 삭제, 둘 다 정상).
6. AI는 LAUNCH_CHECKLIST 5단계(CAPTCHA B-6 먼저, `CHAT_HOURLY_LIMIT=10` 권장, Anthropic 연락처·보유 기간 문구) 뒤에만 `true`.

### 8-6. 웹 신규 문구 (CPO 확인 필요 — 코드에 `// 웹 신규 문구 — CPO 확인 필요`)
| 파일 | 문구 | 보이는 곳 |
|---|---|---|
| `features/onboarding/consentText.ts` | **파일 전체**(법률 검토 전 초안): 부제 "건강 정보는 민감정보라, 동의를 받은 뒤에만 온맘 서버(대한민국 서울)에 저장해요." · 안내 2줄 · (a)(b)(c) 제목·요약·전문(보유 기간·접속 기록·AI 이용 시각 2일 포함) · 배지 "필수"/"안내" · "자세히" · "동의하지 않고 나가기" · "개인정보 처리 방식이 바뀌어 다시 동의를 받아요." · "동의하고 계속하기" · (d) "AI 상담 이용 시 국외 이전 안내" 전문 | 온보딩 동의·다시 동의(Supabase 빌드) |
| `features/privacy/dataItems.ts`·`webPolicyText.ts` | **웹 개인정보처리방침 초안 전체**(수집 항목·수탁사·국외 이전·보유 기간·파기·권리·13절 동의하지 않고 나가기 등) | `/privacy/`·방침 시트(Supabase 빌드) |
| `features/flow/loginText.ts` | "건강 정보는 따로 동의를 받은 뒤에만 서버에 저장돼요." | 로그인(Supabase 빌드) |
| `features/settings/settingsView.ts` | "카카오 계정 연결" / "기록을 잃지 않고 다른 기기에서도 이어 쓰기" / "이 기기에서 기록 지우기(계정 삭제)" / "게스트는 로그아웃하면 기록을 다시 찾을 수 없어요. 기록을 지키려면 카카오 계정을 연결해 주세요." / "건강 데이터는 동의를 받은 뒤에만 온맘 서버(대한민국 서울)에 저장돼요." | 설정(Supabase 빌드) |
| `features/landing/landingContent.ts` | "건강 정보는 동의한 뒤에만 저장해요" / "게스트로 시작해도, 카카오로 로그인해도 … 동의를 받은 뒤 온맘 서버(대한민국 서울)에 저장돼요. …" / "카카오로 로그인하면 다른 기기에서도 기록을 이어 쓸 수 있어요." | 서비스 소개(Supabase 빌드) |
| `features/chat/AiConsentCard.tsx` | "AI 답변 국외 이전 동의" / "AI 답변을 받으려면 질문 내용과 산후 주차·분만 방식·수유 여부가 미국 Anthropic으로 전송되는 데 동의가 필요해요. …" / "동의하지 않기"(동의 버튼은 "동의하고 계속하기") | AI 상담·약물 체크(AI 켜짐) |
| `features/chat/chatModel.ts` | "AI 답변에 동의하지 않아"(배너·기본 답의 "지금은 AI 서버에 연결되지 않아"만 바꿈) | AI 상담(AI 동의 거절 뒤) |
| `features/admin/adminModel.ts` | `ADMIN_TEXT` 전체(제목 "온맘 관리자", "권한이 없어요", 오류·안내, 숫자 카드·표 이름, "카카오", 쪽 "21–40 / 전체 N명" 등 9곳) | `/admin/`(운영자용) |
| `supabase/functions/_shared/safety.ts` | 서버 위기 키워드 추가: 사라지고만싶·없어지고만싶·(내가/제가/나는/저는)+사라졌으면/없어졌으면·세상에서사라지/없어지 — **임상 검토** | chat 함수·AI 상담 선필터 |

운영자용 워크플로 알림("AI 상담 — 로그인 확인 불가" 등)은 사용자에게 보이지 않아 표에서 뺐습니다.

### 8-7. 결정·위험 (남은 것)
- **동의 전 익명 계정**: 게스트로 시작하는 순간 계정 ID·가입/접속 시각·Auth 로그 IP가 Supabase에 생김(LAUNCH_CHECKLIST 1-10 법률 승인, 안 되면 익명 로그인을 동의 뒤로). 예전 브라우저 전용 게스트도 앱 화면을 열면 옮겨짐.
- **게스트 → 카카오가 늘 "같은 ID"는 아님**: 카카오 이메일이 확인된 계정만 `linkIdentity`가 성공. 이메일이 없거나 확인 안 됨·일시 서버 오류 등 취소 말고 모든 거절은 새 카카오 사용자로 로그인 + 게스트 기록 합침 + 익명 사용자 삭제(서버에 카카오가 안 붙은 것을 확인한 뒤에만). 사용자 SMTP를 켜면 이메일 미확인 카카오 사용자에게 Supabase 확인 메일이 갈 수 있음.
- **AI 국외 이전 동의**: 카드에 받는 자 연락처·구체 보유 기간이 없음(CPO가 Anthropic 약관으로 정할 값 — 넣으면 `AI_CONSENT_VERSION` 올림). 동의 기록이 이 브라우저 localStorage에만 있어 서버에 증빙이 없음. 이전 항목 문구 "질문 내용"은 실제로 같은 대화의 최근 메시지(이전 질문·AI 답, 최대 20개)를 보냄 — 설정 안내 H·LAUNCH_CHECKLIST는 정확히 적었지만 카드·방침은 CPO 결정 문구 그대로. 법률 검토에서 맞출지 결정.
- **위기 표현**: content.json의 "사라지고"가 AI 모드에서 "붓기가 사라지고 나서…"도 위기 답으로 보냄. 설정 없는 빌드에서도 서버 목록에만 있는 표현("극단적 선택" 등)에 위기 답이 나감(의도 — 안전 우선).
- **동의 표시 방식**: "자세히"로 접힌 전문이 법의 "명확히 표시"를 충족하는지, "동의하지 않음 = 계정 삭제"가 괜찮은지 — 법률 검토. 조항 번호는 코드 주석에 "검토 필요".
- **계정 삭제의 흔적**: 카카오 "연결 끊기"를 부르지 않음(Admin 키 필요), Supabase Auth 감사 로그 보관·백업 보관 기간(LAUNCH_CHECKLIST).
- **관리자 SQL**은 CI에서 텍스트로만 검사(실제 DB 실행은 로컬 PGlite로 한 번). 사용자 목록의 마지막 저장일은 메타데이터지만 CPO 확인.
- **chat 배포 확인**은 게이트웨이의 잘못된 토큰 응답을 실제 프로젝트로 확인하지 못함 — 틀리면 "확인 못 함" 경고(조용히 통과하지는 않음).
- **워크플로 테스트 게이트**: 관계없는 테스트가 실패해도 DB·함수 배포가 멈춤(의도).
- AI 동의 카드가 전문을 펼쳐 폰 화면 대부분을 차지함.
- **실제 카카오 로그인·연결·동기화·삭제는 아직 끝에서 끝까지 돌려 보지 않음**(대시보드 B·D-1 전). F단계를 빠짐없이.

### 8-8. 확인한 것 (2026-09-28 통합)
- 통합에서 고친 것: `src/rules/chat.test.ts` 프로필 픽스처에 동의 칸 2개(타입 오류로 `typecheck`·배포가 막혀 있었음) · `LandingPage.tsx`가 `sectionTitle(section, build)`로 그림(Supabase 빌드의 저장 카드 제목) + 건너뛰던 테스트를 늘 돌게 · `ServerConsentStep`의 낡은 주석 · `supabase/config.toml` 서버 키 주석 · `SUPABASE_SETUP.md`(0-1·B-4 Legacy 키·E 관리자 화면 항목·F-4·H 게스트→카카오) · `LAUNCH_CHECKLIST.md` 2-7 · 이 문서 §4(`/admin/`·다시 동의 주소).
- `npm run typecheck` 통과 · `npm run lint` 통과 · `npm test` 72파일 1378개 통과(건너뜀 0) · `npm run build`·`BASE_PATH=/onmom_web npm run build` 통과(정적 페이지 25개, `/admin/` 포함). 마지막 `out/`은 설정 없는 `/onmom_web` 빌드이고 Supabase 주소·키가 번들에 없음.
- 헤드리스 Chrome 스모크(스크립트는 저장소 밖):
  - ① 설정 없는 `/onmom_web` 빌드 25/25 — 랜딩 → 시작하기 → 로그인(카카오 준비 중·iOS 안내 줄) → 게스트 → 온보딩(iOS 한 토글) → `/home/` 63일차, 기록 어지러움 → 레드플래그 카드·산부인과 준비 중 → 홈 "확인 필요"·운동 탭 멈춤, 챗 배너·폴백 답, 코데인 → 피하세요(AI 칩 없음), 설정 iOS 문구, `/admin/` 권한 없음(설정 없는 빌드), 계정 삭제 → `/login/`·`onmom.web.*` 0개, PC 사이드바, 콘솔 오류 0·4xx 0·**localhost 밖 요청 0**.
  - ② 공개값 두 개만 넣은 `/onmom_web` 빌드, 실제 프로젝트: 랜딩 서버판 제목·안내 줄, 공개 화면에서 익명 가입 요청 0, `/admin/` 로그인 전 "권한이 없어요", 카카오 버튼 켜짐 → `…/auth/v1/authorize?provider=kakao`(PKCE S256, `redirect_to=…/onmom_web/auth/callback/` — 요청은 끊음), [게스트로 시작] → `POST /auth/v1/signup` **200(익명 로그인이 이미 켜져 있음)** → 온보딩, 첫 읽기 `GET user_states` 404(표 없음)에도 깨지지 않음, 서버 동의 단계(필수 3·AI 안내·거절 버튼, 동의 전 시작 잠김) — 여기서 멈춤(운영 DB에 쓰지 않게) 17/17.
    익명 로그인이 꺼진 경우는 `signup`을 422 `anonymous_provider_disabled`로 흉내 내어(REST 쓰기는 모두 차단) 30/30: 브라우저 전용 게스트로 이어져 동의 → `/home/`, 서버 쓰기 0, 운동 탭 → `functions/v1/videos` 404 → "영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."(원문), AI 상담 준비 중·chat 호출 0, `/admin/` 게스트 권한 없음·익명 가입 재시도 없음, 설정 서버판 문구·[카카오 계정 연결]·삭제 → `/login/`·비움, **예전 게스트(설정 없는 빌드에서 온보딩) → `/home/`·`/record/` 모두 `/onboarding/?consent=1` → 다시 동의 → `/home/` 63일차 그대로**, 콘솔 오류 0.
  - ③ 카카오 JavaScript 키만 넣은 빌드를 `localhost:3000`에: 역삼동 → 산부인과 목록·지도·핀(폰·PC) 7/7.
- 확인 뒤 `.env*` 파일 없이 보통 빌드(`BASE_PATH=/onmom_web`, 설정 없음)로 되돌렸습니다.

## 9. PC 화면 틀 통일 · 서비스 소개 로고 (2026-09-28 디자인 정리)

요청(주인): PC에서 사이드바 "더보기" 화면마다 [뒤로] 위치가 달라지고 작은 어긋남이 있음 → 한 가지 틀로. 서비스 소개 머리의 "온맘" 로고를 누르면 맨 위로.
- **틀 한 곳**: `components/shell/pageFrame.ts`(`PAGE_FRAME.wide`·`.reading`, `READING_BLOCK`). 앱 화면(`(app)` 16개)의 `<main>`이 모두 이 값을 붙인다(`pageFrame.test.ts`가 소스로 확인). 값은 전부 `lg:` — **폰·태블릿은 그대로**(402×874 전후 25화면 픽셀 비교 동일, 다른 곳은 시드 시각 글자뿐).
- **PC 규칙**: 왼쪽 선 = 껍데기 2rem + 화면 1.5rem(1440 창에서 모든 제목·카드 x=392 — 전에는 388·392·520이 섞임). 위 1.5rem(창 높이 52rem 이하는 0.75rem, 사이드바와 같은 기준) — 제목은 모두 y=32(전: 탭 16, 서비스 60), 제목 24 bold(프로필 34 → PC 24, 기록장 1024 창의 17 → 24). 아래 3rem. 폭: 읽기 화면(설정·약물 체크·글쓰기·글 상세·분석 폼·AI 상담) 최대 48rem 왼쪽 정렬, 격자 화면(가이드·생활·지원사업·지역·프로필 편집·분석 결과·탭) 껍데기 전부(64rem), 넓은 화면 안 한 줄 블록(동네 입력·운동 안내) 45rem = 읽기 글줄. 두 열 간격 16으로 통일(지원사업 24·기록장 12였음). AI 상담 기둥은 가운데(44rem) → 왼쪽 48rem, 배너·말풍선·입력창도 같은 왼쪽 선.
- **[뒤로]**: 사이드바에 있는 서비스 7개는 PC(lg)에서 숨김(`SubPageHeader hideBackWithSidebar`). 더 깊은 화면(프로필 편집·글쓰기·글 상세·분석)은 PC에서도 맨 위 줄 같은 자리(x=384, y=24 — 사이드바 로고 줄과 같은 높이). 폰·태블릿은 전과 같이 모두 보임.
- **관리자**(`/admin/` 대시보드, 사이드바 없음): 본문 72rem → 64rem 가운데, 좌우 3.5rem(= 앱 넓은 화면과 같은 912px 글줄), 제목 y=32, 카드 간격 16. 권한 없음 화면은 로그인·콜백처럼 가운데 그대로.
- **서비스 소개 로고**(`features/landing/LandingHomeLink.tsx`·`landingTop.ts`): 서비스 소개에서 누르면 맨 위로 부드럽게(움직임 줄이기면 바로), 주소의 `#섹션`은 지움(방문 기록은 늘리지 않음), 초점은 로고에 그대로. 전에는 Next Link가 같은 주소에서 스크롤을 유지해 아무 일도 없었음. 다른 화면의 로고(사이드바·로그인·홈 머리)는 보통 링크 — 새 화면 맨 위에서 열림(Next 기본).
- 새 문구 없음. 확인: 폰 402×874·PC 1440×900·1366×657·1024×768, 설정 없는 빌드와 Supabase 빌드(가짜 주소 — 다시 동의·설정 게스트 칸·관리자 권한 없음)에서 캡처(저장소 밖).

