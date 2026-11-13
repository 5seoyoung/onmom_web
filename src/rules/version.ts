// 규칙 버전 — 결과·기록에 실어 감사 추적에 쓴다(02). 임상 자문으로 값이 바뀌면 올린다.
import content from "@/content";

// 레드플래그·게이팅·금기·지표. 기준값(redflag.ts·weight.ts의 이름 붙인 상수)을 바꾸면 이 값을 올리고
// version.test.ts의 판별 기록에 새 판을 더한다 — 올리지 않으면 그 테스트가 실패한다.
// rules-1.2(2026-11-04): 다량 출혈(산후 일수와 상관없이)·자간전증·자간증 신호·나/아기를 해칠 것 같은 생각 규칙과
// 119(emergency)·위기 상담(crisis) 등급을 더했다 — 임상 사전 검토 §0-2 B1~B3, §3 T1~T5·T11.
// rules-1.3(2026-11-13): 임상 자체 검토(docs/dev/clinical/CLINICAL_SELF_REVIEW_2026-11.md §2~§4 — 공식 지침 원문 대조) — 흉통·호흡곤란 119,
// 10일 이후 오로 "늘거나 또는 붉음", 발열에 오한, 상처·다리/팔 토글을 넓히고 오로 냄새·심한 구토·유방 붉음 하루 넘게·갑자기 몹시 지침을 더했다.
// 같은 판에서 골반저근 단계를 0주부터 열고(NICE NG210 1.3.13), 체중 목표 카드는 산후 28일부터 보인다(weight.ts WEIGHT_PLAN_FROM_DAY).
export const RULES_VERSION = "rules-1.3";
// 기분 문항·기준 — 문항·수치와 함께 content.json mood_check에 있다(임상 회신은 그 JSON을 교체하는 것으로 반영).
// 판은 그 JSON의 config_version을 그대로 쓴다(따로 적어 두면 JSON만 바뀌고 판이 남는다).
export const MOOD_VERSION: string = content.mood_check.config_version;
