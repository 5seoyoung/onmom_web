# src/api — 외부 서비스 브라우저 클라이언트

| 파일 | 하는 일 | 설정이 비면 |
|---|---|---|
| `http.ts` | fetch + 타임아웃 + `x-onmom-key`(온맘 백엔드 origin에만) | — |
| `video.ts` | `GET {VIDEO_URL}/videos?include=<route 태그>&limit=500` (iOS VideoDBClient) | `notConfigured` + iOS 원문 "준비 중" |
| `llm.ts` | `POST {LLM_URL}/chat` — preset만 보내고 `system`은 보내지 않음 (iOS LLMClient) | `notConfigured` |
| `clinics.ts` | 가까운 산부인과: 순수 로직(거리·정렬·6곳·표기) + 흐름 | `notConfigured` (`message: null`) |
| `kakaoMaps.ts` | 카카오 지도 JS SDK 지연 로드 + 지오코딩·키워드 검색 | — |
| `safeUrl.ts` | 외부 링크 허용 목록(https + youtube/youtu.be/place.map.kakao.com), `rel="noopener noreferrer"` | — |

모든 함수는 실패를 결과 값(`{ ok: false, kind, message }`)으로 돌려준다. 가짜 데이터로 채우지 않는다(원칙 3).
예외는 하나 — 설정된 상태에서 `fetchVideos("")`는 호출자 버그라 `TypeError`를 던진다(두 라우트 영상이 섞이므로). 미설정이면 먼저 `notConfigured`.
자동 재시도는 없다 — 다시 시도는 화면 버튼 몫(검수 #57).

## 지금 막혀 있는 것

- **CORS** — 2026-09-23 현재 영상 서버는 CORS 헤더가 없고 preflight(OPTIONS)가 405다(검수 #12).
  브라우저에서는 `network`(연결 실패)로 끝난다. 백엔드에 `CORSMiddleware`(웹 origin 명시, GET/POST/PUT/OPTIONS,
  `content-type`·`x-onmom-key` 허용, 와일드카드 금지)가 들어가야 풀린다. 앱 키를 설정하면 GET도 preflight를 타므로 OPTIONS 처리가 꼭 필요하다.

## 아직 구현하지 않은 것 — 계정 API · 카카오 로그인

백엔드(`account_api`)가 아직 없고, 정적 호스팅(GitHub Pages)만으로는 안전하게 만들 수 없어 비워 두었다.

- 카카오 OAuth의 code → token 교환은 REST 키 + client secret이 필요하다. 이 값은 브라우저 번들에 넣을 수 없다(검수 #22).
  → 교환은 서버(계정 API 또는 BFF)가 한다. redirect_uri도 그 서버로 받는다.
- 로그인 CSRF를 막으려면 난수 `state`를 HttpOnly 쿠키에 두고 콜백에서 검증해야 한다 — 서버 없이는 불가(검수 #17).
- 계정 API의 자격 증명이 `user_id`(URL 쿼리) + 공개 앱 키뿐이면 누구나 남의 state를 읽고 덮을 수 있다(검수 #16).
  → 서버 발급 HttpOnly 세션(또는 BFF) 전에 `ACCOUNT_URL`을 켜지 않는다.
- 붙일 때 함께 정할 것: 동의 전 전송 금지(#15), GET 전 PUT 금지·게스트 병합(#13), 탈퇴 실패 처리, 날짜 직렬화(#23).

## 주의

- `NEXT_PUBLIC_*`는 전부 공개값이다. 앱 키(`x-onmom-key`)는 인증 수단이 아니다.
- 병원 검색 반경은 카카오 최대 20km다. iOS 8km 영역은 힌트여서 더 먼 병원도 나왔기 때문이다. radius를 빼면 SDK 기본 5km가 되므로
  20km 밖에 산부인과가 없는 지역은 "주변에서 산부인과를 찾지 못했어요."로 끝난다(iOS와 다른 점).
- 카카오 JS 키는 개발자 콘솔의 "사이트 도메인"으로만 보호된다. SDK가 Referer로 도메인을 확인하므로
  페이지 전체에 `Referrer-Policy: no-referrer`를 걸면 병원 검색이 막힌다.
- 서버·LLM 응답은 신뢰하지 않는다: 링크는 `safeExternalUrl`을 거치고, LLM 답은 plain text로만 렌더한다(검수 #51).
- 영상 요청 URL에는 분만 방식이 실린다. 분석·모니터링 도구가 네트워크 URL을 수집한다면 온맘 API 요청은 빼거나 쿼리를 지운다(검수 #49).
