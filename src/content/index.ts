// 사용자에게 보이는 규칙·임상 문구의 원본. iOS Swift에서 추출한 content.json을 그대로 쓴다
// (재입력 금지 — 인수인계 원칙 5). 임상 자문 회신은 이 JSON을 교체하는 것으로 반영한다.
// 원본 사본: 인수인계 패키지 web/reference/content.json (비공개, 저장소에 없음)
// 원본 사본과 다른 곳(JSON을 교체할 때도 같게 바꿔 넣는다):
//  1. 2026-10-14 CPO 결정: 화면의 em dash(—)는 하이픈(-)으로(" — " → " - ").
//  2. 2026-11-04 대표 결정 — 외부 임상·법률 검토 없이 임상 사전 검토의 출시 차단 항목(B1~B4)과 의료기기 경계(법률 사전 검토 H5)를 닫는
//     안전 갱신(rules-1.2): red_flags에 신호 7개(heavy_bleeding_dizzy·seizure·harm_thoughts·heavy_bleeding·headache_vision·
//     face_hand_swelling·upper_belly_pain)와, 출처 칩이 없던 셋(neuro_flag·cardioresp_flag·dvt_suspect)의 출처 칩을 더했다.
//     출처는 임상 사전 검토 §5에서 원문으로 확인한 자료만 쓴다. 문구는 웹 신규 문구(CPO 확인 필요 — 쓰는 곳 rules/redflag.ts 머리말).
import content from "./content.json";

export type Content = typeof content;
export default content;
