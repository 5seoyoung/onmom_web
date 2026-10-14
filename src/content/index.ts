// 사용자에게 보이는 규칙·임상 문구의 원본. iOS Swift에서 추출한 content.json을 그대로 쓴다
// (재입력 금지 — 인수인계 원칙 5). 임상 자문 회신은 이 JSON을 교체하는 것으로 반영한다.
// 원본 사본: 인수인계 패키지 web/reference/content.json (비공개, 저장소에 없음)
// 원본 사본과 다른 글자는 하나뿐이다 — 2026-10-14 CPO 결정: 화면의 em dash(—)는 하이픈(-)으로(" — " → " - ").
// JSON을 교체할 때도 같은 규칙으로 바꿔 넣는다.
import content from "./content.json";

export type Content = typeof content;
export default content;
