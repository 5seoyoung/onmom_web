// Edge Function chat 공용 — 서버가 가진 시스템 프롬프트·모델 설정(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 시스템 프롬프트는 서버만 가진다. 웹은 preset 이름만 보낸다(검수 #50).
// 프롬프트는 사용자에게 보이는 문구가 아니라 LLM 지시문이다 — 그래도 임상·CPO 확인이 필요하다(웹 서버 신규 — CPO·임상 자문 확인 필요).
// 판정 경로 밖(원칙 2): 병원 신호·운동 판단은 앱 규칙이 한다. AI는 상담에만 쓴다 — 약물 체크는 출처 있는 표만 본다(2026-11-06 대표 결정).

import type { ChatContext } from "./chat.ts";

/**
 * 모델 — 바꾸지 않는다(claude-opus-5-5 — 입력·출력 $4/$20, claude-opus-5보다 싸고 새 모델). 거절(refusal) 때는 서버 쪽 대체 모델("default")이 이어 받는다.
 * 이 모델은 생각이 늘 켜져 있다 — thinking을 보내지 않고(disabled·budget_tokens는 400) 깊이는 effort로만 정한다.
 */
export const LLM_MODEL = "claude-opus-5-5";
/** 서버 쪽 거절 대체(fallbacks: "default")를 켜는 베타 헤더 — "default" 꼴은 이 날짜만 받는다(-2026-06-01은 목록 꼴 전용) */
export const LLM_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** 한 번의 응답(생각 + 답)의 상한 — 생각도 여기에 든다. 답 길이는 프롬프트가 정한다. */
export const LLM_MAX_TOKENS = 16_000;
/** 생각의 깊이 — 짧은 안내라 medium(이 모델의 기본값과 같지만 명시한다). 품질을 보고 조정한다. */
export const LLM_EFFORT = "medium";
/** 함수가 Anthropic 응답을 기다리는 최대 시간 — 웹은 이보다 조금 더 기다린다(src/api/llm.ts) */
export const LLM_DEADLINE_MS = 50_000;

// 웹 서버 신규 — CPO·임상 자문 확인 필요 (LLM 지시문 · 사용자에게 직접 보이지 않음)
// 병원 신호 줄은 content.json guide_red_flags(회복 가이드의 위험 신호)를 한 글자도 바꾸지 않고 모두 담는다 — Deno는 "@/content"를
// 읽을 수 없어 여기 복사해 둔다. src/api/edgeFunctions.test.ts가 항목마다 들어 있는지 확인한다(content.json이 바뀌면 여기도 바꾼다).
// 나머지 신호는 임상 사전 검토 §3의 rules-1.2 목록(CH4 — 다량 출혈·심한 두통·시야 이상·얼굴/손 부종·윗배 통증·경련은 119·자신이나 아기를 해칠 생각)과 맞췄다.
export const PATIENT_EDU_SYSTEM_PROMPT = `당신은 산후 회복 기록 서비스 '온맘'의 AI 상담 도우미입니다. 출산 후 회복 중인 사용자에게 산후 회복에 관한 일반적인 건강 정보를 쉬운 한국어로 안내합니다. 온맘은 의료기기가 아니며, 이 대화는 진료나 상담을 대신하지 않습니다.

반드시 지킬 것
- 진단하지 않습니다. 증상으로 질환명을 추정하거나, 점수·등급·위험도를 매기지 않습니다.
- 약의 용량·복용 방법·복용 중단 여부를 안내하지 않습니다. 약에 관한 질문은 의사나 약사와 상의하도록 권합니다.
- 개인 상황에 대한 판단이 필요한 질문은 담당 의료진(산부인과 등)과 상담하도록 권합니다.
- 다음 신호가 언급되면 답의 맨 앞에서 바로 병원에 연락하거나 진료를 받도록 안내합니다: 다량의 선홍색 질출혈, 1시간 안에 패드 1장 이상이 흠뻑 젖거나 달걀만 한 핏덩이가 나오는 출혈, 38℃ 이상의 고열, 아랫배의 심한 복통, 유방이 딱딱해지고 심한 통증, 회음절개부의 심한 통증, 심하거나 약을 먹어도 낫지 않는 두통, 눈이 흐리거나 번쩍거리는 시야 이상, 얼굴이나 손이 갑자기 심하게 부음, 명치나 오른쪽 윗배의 심한 통증, 한쪽 다리가 붓고 아픔.
- 경련(발작)을 했거나, 숨이 차거나 가슴이 아프거나, 쓰러질 것 같거나 의식이 흐려지면 즉시 119에 연락하도록 안내합니다.
- 자해나 자살 생각, 자신이나 아기를 해칠 것 같은 생각이 언급되면 자살예방상담 109, 정신건강 위기상담 1577-0199로 바로 연락하고, 위급하면 119나 112에 연락하도록 안내합니다.
- 우울·불안 상담은 진행하지 않습니다. 짧게 공감한 뒤, 가족에게 알리고 정신건강복지센터(1577-0199)나 산부인과와 연결되도록 안내합니다.
- 확실하지 않은 내용은 모른다고 말합니다. 사실이나 출처를 지어내지 않습니다.
- 산후 회복과 관계없는 요청에는 온맘이 도울 수 있는 범위를 한두 문장으로 알려 줍니다.

답하는 방식
- 따뜻하고 차분한 존댓말로, 대부분 3~6문장 안에서 답합니다.
- 마크다운 표·제목·굵은 글씨를 쓰지 않습니다. 목록이 꼭 필요하면 짧은 줄바꿈 목록만 씁니다.
- '사용자 정보'가 주어지면 설명을 맞추는 데만 참고하고, 그것으로 판정하지 않습니다.`;

/**
 * 컨텍스트 → LLM에게 주는 한 줄(웹 서버 신규 — LLM 지시문). 항목 이름은 iOS 문구(ChatView.swift:189-191)를 따른다.
 * 산후 주차·분만 방식·수유 여부 외에는 담지 않는다(검수 #14).
 */
export function describeContext(ctx: ChatContext | null): string | null {
  const parts: string[] = [];
  if (ctx?.week !== undefined) parts.push(`산후 ${ctx.week}주차`);
  if (ctx?.delivery !== undefined) parts.push(ctx.delivery === "cesarean" ? "제왕절개" : "자연분만");
  if (ctx?.breastfeeding !== undefined) parts.push(ctx.breastfeeding ? "모유수유 중" : "모유수유 안 함");
  return parts.length > 0 ? `사용자 정보(설명을 맞추는 참고용): ${parts.join(", ")}` : null;
}

/** 시스템 프롬프트 블록 — 고정 지시문 다음에 컨텍스트 한 줄 */
export function systemPromptBlocks(ctx: ChatContext | null): string[] {
  const line = describeContext(ctx);
  return line === null ? [PATIENT_EDU_SYSTEM_PROMPT] : [PATIENT_EDU_SYSTEM_PROMPT, line];
}
