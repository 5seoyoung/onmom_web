# 개발 메모

2026-09-23 기준으로 규칙·저장·UI·외부 연동 모듈을 합치며 쓰고, 2026-09-27 화면 구현(§6)을 더했습니다.
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
8. **로그아웃·공용 PC** [#19]: 로그아웃해도 건강 데이터가 브라우저에 평문으로 남습니다. 게스트 데이터는 다음 카카오 로그인 계정으로 넘어갑니다. 실계정 로그아웃 시 지울지, 게스트에게 "이 브라우저에서 삭제"를 줄지.
9. **"이 기기" 문구** [#48]: 로그아웃·계정 삭제·기록장 안내 문구가 iOS 그대로 "이 기기"입니다(D5로 우선 유지). 저장 실패(`storageAvailable=false`) 안내 문구도 없습니다.
10. **여러 탭 경합**: 변경 이벤트가 조금 늦게 오거나(뒤로 가기 캐시 복원 등) 받지 못하면 다른 탭의 최근 기록을 덮을 수 있습니다. 저장 직전마다 다시 읽을지.
11. **기록 날짜가 없는 손상 데이터**는 읽은 시각으로 채워집니다(iOS와 같음). 오래된 레드플래그 기록이 오늘 것처럼 보일 수 있습니다.
12. **색 대비** [#52]: iOS 팔레트 그대로라 WCAG AA에 못 미칩니다 — 레드플래그 카드 흰 글씨 2.76:1, 카드 안 칩 2.22, 상태 배지 1.67~2.45, 출처 칩 2.50, placeholder 3.04, 토글 켬 2.76·끔 1.65, 구분선 테두리 1.06~1.10, 슬라이더 트랙 1.27, **포커스 링(코랄) 2.64~2.76**. 텍스트 전용 색 토큰과 3:1 이상 포커스 링 토큰(예: #191F28)을 `globals.css`에 정해야 합니다. 화면을 만들며 더 나온 곳: 홈·운동 탭의 "{단계} 제외 — {사유}" 줄(`text-state-watch` #FFB020, 흰 배경 약 1.8:1), 홈 면책·기분 카드 안내(`text-text-subtle` #8B95A1, 약 3.0:1). 아이콘·배지용 watch 색은 두고 글자용 짙은 watch 토큰을 더할지, iOS 색을 그대로 받아들일지 — 정하면 모든 화면에 한 번에 적용합니다.
13. **숨은 "출처: " 낭독 문구** 유지 여부.
14. **`/dev/components` 카탈로그**가 운영 빌드에 포함됩니다(사이트 전체 noindex). 출시 전 뺄지.
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
- **AI 상담으로 가는 링크**: 홈에서는 `/chat/?from=home`(`HOME_CHAT_HREF`) — 챗의 [뒤로]가 홈으로 옵니다. 쿼리가 없으면 프로필로 갑니다(`chatBackHref`).
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
보기 규칙(무엇을 어떤 조건에서 보일지)은 순수 함수로 두고 테스트합니다(DOM 테스트 환경은 없음).

### 만든 화면
| 화면 | 경로 | 폴더 | 요점 |
|---|---|---|---|
| 앱 관문 | 전체(`layout.tsx`) | `flow` | `rootScreenFor`로 로그인 → 온보딩 → 탭. `/privacy/`·`/dev/*`는 늘 열림. 읽기 전에는 아무것도 그리지 않음 |
| 로그인 | `/login/` | `flow` | 카카오 버튼 비활성 + "준비 중"(D2), [게스트로 시작], 처리방침 시트 |
| 온보딩 4단계 | `/onboarding/` | `onboarding` | 출산일(오늘까지)·분만·수유 → 목표(복직일·체중 선택) → 동의. 입력은 [온맘 시작하기] 때 한 번에 저장(동의 전 저장 금지, 감사 #15) |
| 홈 | `/` | `home` | 히어로(출산일 있을 때만 n일차)·회복 상태·마음 카드·분석 링크·지표·지금 단계·체중 목표·빠른 기록·면책. 레드플래그면 "확인 필요"+단계 카드 대신 "운동 안내를 멈췄어요", 체중 카드 숨김, 마음 카드는 유지(D1) |
| 운동 | `/exercise/` | `exercise` | 분만 방식 없음 / 레드플래그(D1) / 출산일 없음(웹 신규) / 영상 준비 중 + 현재 단계 + 제외 줄(D7) / 연결 실패 / 없음 / 목록 |
| 기록 | `/record/` | `record`·`clinics` | 증상 폼 → 레드플래그 카드 + 가까운 산부인과(키 없으면 준비 중, D6) 또는 "위험 신호 없음", 오늘의 한 가지 질문, 최근 기록 5개 |
| 기록장 | `/journal/`·`/journal/write/`·`/journal/post/?id=` | `journal` | 이 기기 저장 안내, 목록/빈 상태, 글쓰기(제목 필수, Enter로 등록 안 됨), 상세·댓글 |
| 프로필 | `/profile/` | `profile` | 이름·산후 일차·주차, 내 정보(BMI 등), 재활 고려사항 칩, 허브 7개 |
| 설정·프로필 편집 | `/settings/`·`/settings/profile/` | `settings` | 로그아웃·계정 삭제(확인 창), 프로필 행, 알림 준비 중(D4), 개인정보. 편집은 출산일 먼저(D11) |
| 회복 단계 분석 | `/analyze/` | `analyze` | 폼 미리 채움 → 저장 후 분석(D10) → 결과. 레드플래그면 '가능'·영상 대신 멈춤 안내(D1) |
| 약물·음식 체크 | `/substance/` | `substance` | 표 먼저, LLM은 설정됐을 때 표에 없는 품목만 |
| AI 상담 | `/chat/` | `chat` | 미설정: 노란 배너 + 인사말 + 규칙 폴백 답, FAQ 숨김(D8). 기록은 저장하지 않음 |
| 지역 연계 | `/region/` | `region`·`clinics` | 안내 문구·동네 입력은 늘, 검색은 카카오 키가 있을 때만(D6) |
| 회복 가이드·생활 권고·지원사업 | `/guide/`·`/lifestyle/`·`/support/` | `guide`·`lifestyle`·`support` | content.json만. 출처가 빈 칩은 그리지 않음 |
| 개인정보처리방침 | `/privacy/` | `privacy` | PrivacyPolicyView.swift 원문 + 웹 안내 한 줄 |

### 적용한 제품 결정 (기본값 — CPO가 바꿀 수 있음)
- **D1 레드플래그 활성**(최근 기록에 `redFlagCode`): 홈 "확인 필요"·단계 카드 → "운동 안내를 멈췄어요"·체중 카드 숨김, 운동 탭 레드플래그 블록(영상 조회 안 함), 분석 결과 '가능'·영상 숨김(`suppressExerciseOnRedFlag: true`) + 멈춤 안내. 마음 카드는 숨기지 않음.
- **D2** 카카오 로그인 비활성 + "준비 중", 게스트만 동작. 웹에 Apple 로그인 없음.
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
- 서버가 필요한 기능(카카오 로그인·영상·LLM·카카오 검색)은 모두 준비 중 상태로 동작합니다. 켜면 해당 화면을 다시 확인합니다.
- 저장 실패(`storageAvailable=false`) 안내, PWA 매니페스트, `/dev/components` 운영 빌드 제외 여부(§3 CPO 14)는 남았습니다.
