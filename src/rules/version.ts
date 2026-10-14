// 규칙 버전 — 결과·기록에 실어 감사 추적에 쓴다(02). 임상 자문으로 값이 바뀌면 올린다.
import content from "@/content";

// 레드플래그·게이팅·금기·지표. 기준값(redflag.ts·weight.ts의 이름 붙인 상수)을 바꾸면 이 값을 올리고
// version.test.ts의 판별 기록에 새 판을 더한다 — 올리지 않으면 그 테스트가 실패한다.
export const RULES_VERSION = "rules-1.1";
// 기분 문항·기준 — 문항·수치와 함께 content.json mood_check에 있다(임상 회신은 그 JSON을 교체하는 것으로 반영).
// 판은 그 JSON의 config_version을 그대로 쓴다(따로 적어 두면 JSON만 바뀌고 판이 남는다).
export const MOOD_VERSION: string = content.mood_check.config_version;
