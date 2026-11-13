// 사용자에게 보이는 규칙·임상 문구의 원본. iOS Swift에서 추출한 content.json을 그대로 쓴다
// (재입력 금지 — 인수인계 원칙 5). 임상 자문 회신은 이 JSON을 교체하는 것으로 반영한다.
// 원본 사본: 인수인계 패키지 web/reference/content.json (비공개, 저장소에 없음)
// 원본 사본과 다른 곳(JSON을 교체할 때도 같게 바꿔 넣는다):
//  1. 2026-10-14 CPO 결정: 화면의 em dash(—)는 하이픈(-)으로(" — " → " - ").
//  2. 2026-11-04 대표 결정 — 외부 임상·법률 검토 없이 임상 사전 검토의 출시 차단 항목(B1~B4)과 의료기기 경계(법률 사전 검토 H5)를 닫는
//     안전 갱신(rules-1.2): red_flags에 신호 7개(heavy_bleeding_dizzy·seizure·harm_thoughts·heavy_bleeding·headache_vision·
//     face_hand_swelling·upper_belly_pain)와, 출처 칩이 없던 셋(neuro_flag·cardioresp_flag·dvt_suspect)의 출처 칩을 더했다.
//     출처는 임상 사전 검토 §5에서 원문으로 확인한 자료만 쓴다. 문구는 웹 신규 문구(CPO 확인 필요 — 쓰는 곳 rules/redflag.ts 머리말).
//     disclaimers.record_normal(판정이 아니라 정보로), guide_cards "산후 정신건강"의 넷째 요점(109·1577-0199·119),
//     chat_fallback.replies.mood의 ③(109·119)·replies.bleeding(양 기준·119)·bleeding_keywords, substances의 별칭(B4)과 "안전합니다" 문장·칩도 바꿨다.
//     JSON에는 주석을 달 수 없어 표시는 쓰는 곳(rules/record·guideContent·rules/chat·rules/substance)에 있다.
//  3. 2026-11-08 (DEV_NOTES §3 content.json 수정 요청, 화면 글자는 그대로):
//     home_metrics.lochia.gate 설명 글을 코드의 세 갈래(10일 이상 판정 · 10일 미만 숨김 · 일수 없음은 표시하되 판정 보류)에 맞췄다(감사 #40).
//     판정에는 쓰이지 않는 설명 글이다 — rules/version.test.ts가 LOCHIA_GATE_DAYS와 대조한다.
//     disclaimers.record_normal을 " / "로 이은 한 줄에서 {title, body}로 나눴다(쓰는 곳 rules/record, 감사 #53).
//     weight_plan.loss·recovery.chips의 첫 칩(자리표시 글자 "BMI x.x 또는 임신 전 +x.xkg"·"BMI x.x")을 빼고 계산값 칩의 틀을
//     chip_templates({bmi}·{kg} — content/template.ts)로 뒀다(쓰는 곳 rules/weight, 감사 #53).
//     ui 묶음을 더했다 — 코드에 손으로 옮겨 두었던 Swift 화면 문구(감사 #5·#25·#27). 원본 사본에는 없는 키다. 글자는 Swift 원문
//     그대로이고(화면의 "—"만 1번대로 "-"), 원문 위치(Swift 파일·줄 표시)는 키를 쓰는 줄에 둔다. "{이름}"은 계산값 자리
//     (content/template.ts가 모듈 로드 때 확인). 웹 신규 문구("CPO 확인 필요" 표시)는 옮기지 않고 코드에 둔다.
//     화면 글자가 그대로인지는 content/uiCopy.test.ts가 옮기기 전 글자와 대조한다. 쓰는 곳: ui.home.metric_names → rules/redflag,
//     ui.exercise·ui.profile → rules/exercise, ui.analyze → rules/recovery, ui.substance → rules/substance·features/substance/substanceModel,
//     ui.chat → rules/chat, ui.support → rules/support.
//  4. 2026-11-13 임상 자체 검토(docs/dev/clinical/CLINICAL_SELF_REVIEW_2026-11.md — 공식 지침 대조, 임상의가 쓴 것이 아님) 반영(rules-1.3):
//     red_flags — cardioresp_flag 119 등급, pph_suspect "증가 또는 선홍", fever_infection 오한, severe_pain·dvt_suspect·neuro_flag 문구·칩,
//     새 신호 넷(lochia_odor·severe_vomiting·breast_red_swelling·extreme_tiredness). home_metrics.lochia(살펴볼 신호 구간 없앰),
//     ui.home.metric_names.fever("발열·오한"), stage_buckets(골반저근 0주, 회복 우선기 요약), caution_overlays(라벨·칩 — "src:산모수첩 확인항목"은
//     문헌이 아니라 일반 칩으로), substances(생선·날생선·코데인·아스피린 문구, 트라마돌·먹는 세마글루타이드 행, 철분 별칭, 출처 칩),
//     lifestyle_tips·guide_red_flags(15줄)·guide_cards(문구·출처), chat_fallback(출혈·기본·기분 답, 출혈 키워드).
//     모두 웹 신규 문구(CPO 확인 필요) — 표시는 쓰는 곳(rules/redflag·features/record·guideContent·rules/chat·rules/substance·rules/exercise)에 있다.
//     같은 날 법률 자체 검토: disclaimers.home_footer를 식약처 「의료기기와 개인용 건강관리(웰니스) 제품 판단기준」 권고 주의 문구로
//     (쓰는 곳 components/ui/DisclaimerBanner·features/home/homeViewModel·components/shell/appNav·features/report/reportModel).
import content from "./content.json";

export type Content = typeof content;
export default content;
