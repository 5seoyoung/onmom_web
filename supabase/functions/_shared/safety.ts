// Edge Function chat 공용 — 자해·자살 표현 안전 선필터(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 마지막 사용자 메시지에 자해·자살 의도 표현이 있으면 LLM을 부르지 않고, 앱 규칙 폴백과 같은 고정 위기 안내를 돌려준다(검수 #7).
// LLM은 판정 경로 밖이다(원칙 2) — 이 분기는 정해진 규칙(키워드)이 정한다.
// 놓치는 것보다 잘못 걸리는 쪽이 낫다(잘못 걸리면 위기 안내가 한 번 나올 뿐이고, 놓쳐도 시스템 프롬프트가 같은 연락처를 안내한다).
// 다만 산후 질문에 흔한 말("통증이 사라지고", "붓기가 사라지고")까지 막지 않도록 "사라지고"는 "사라지고 싶"처럼 의도가 드러나는 꼴로만 본다.
//
// 웹도 이 목록을 함께 쓴다(src/features/chat/chatModel.ts isCrisisMessage = content.json 키워드 ∪ 이 목록) — 위기 표현이면
// 동의 카드·AI 호출 없이 바로 위기 안내로 답하고, 그 턴은 뒤의 AI 요청에도 싣지 않는다. 그래서 이 파일은 가져오는 것이 없다(순수 모듈).
//
// Deno는 Next의 "@/content"를 읽을 수 없어 문구를 여기 복사해 둔다.
// src/api/edgeFunctions.test.ts가 content.json(chat_fallback)과 한 글자씩 비교한다 — content.json이 바뀌면 여기도 바꾼다.

/** 원문: content.json chat_fallback.replies.self_harm (OnmomEngine.swift:127) */
export const CRISIS_REPLY =
  "지금 많이 힘드시군요. 혼자 견디지 마세요. 지금 곁의 가족에게 바로 알리고, 정신건강 위기상담 1577-0199 또는 자살예방상담 109로 연락해 주세요. 위급하면 119입니다. (이 답변은 상담·진단이 아닙니다.)";

/**
 * content.json chat_fallback.self_harm_keywords 중 그대로 쓰는 것 — "사라지고"만 뺐다(위 머리말).
 * 앱 규칙 폴백(rules/chat chatReply)은 content.json 목록 전체를 그대로 쓴다.
 */
export const CONTENT_SELF_HARM_KEYWORDS: readonly string[] = ["죽고", "자해", "자살"];

/**
 * 선필터 보강 키워드(웹 서버 신규 — 임상 자문 확인 필요). 띄어쓰기·하이픈·따옴표를 지운 뒤 비교하므로 붙여 쓴 꼴로 적는다.
 * 과장 표현("힘들어 죽겠다")·죽음에 대한 걱정("죽을까 봐 무서워요")은 넣지 않았다. 바꾸면 docs/SUPABASE_FUNCTIONS.md에도 적는다.
 */
export const EXTRA_SELF_HARM_KEYWORDS: readonly string[] = [
  // 한국어
  "죽어버리고",
  "죽어버릴",
  "죽고파",
  "죽고프",
  "죽는게나을",
  "죽는게낫",
  "사라지고싶",
  "사라지고만싶",
  "사라지고파",
  "사라져버리고",
  "없어지고싶",
  "없어지고만싶",
  // "사라졌으면·없어졌으면"은 주어가 자기일 때만 — "뱃살이 없어졌으면", "통증이 사라졌으면"은 산후 질문에 흔하다
  "내가사라졌으면",
  "제가사라졌으면",
  "나는사라졌으면",
  "저는사라졌으면",
  "내가없어졌으면",
  "제가없어졌으면",
  "나는없어졌으면",
  "저는없어졌으면",
  "세상에서사라지",
  "세상에서없어지",
  "목숨을끊",
  "목숨끊",
  "스스로목숨",
  "극단적선택",
  "극단적인선택",
  "살기싫",
  "살고싶지않",
  "그만살고싶",
  "살이유가없",
  "뛰어내리고싶",
  "뛰어내릴까",
  "투신",
  "손목을긋",
  "손목긋",
  "목을매",
  "목매달",
  "유서를쓰",
  "유서써",
  // 영어
  "suicide",
  "suicidal",
  "killmyself",
  "endmylife",
  "endingmylife",
  "selfharm",
  "hurtmyself",
  "harmmyself",
  "cutmyself",
  "wanttodie",
  "wannadie",
  "dontwanttolive",
  "donotwanttolive",
  "betteroffdead",
];

/**
 * 비교용으로 다듬기 — NFC, 소문자, 공백·제로폭 문자(U+200B~U+200D, U+2060, U+FEFF)·하이픈·밑줄·마침표·따옴표 제거.
 * "자 살", "self-harm", "don't want to live"도 같은 글자로 본다.
 */
export function normalizeForSafety(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s​-‍⁠﻿\-_.'`"‘’“”]/g, "");
}

const KEYWORDS: readonly string[] = [...CONTENT_SELF_HARM_KEYWORDS, ...EXTRA_SELF_HARM_KEYWORDS].map(normalizeForSafety);

/** 자해·자살 의도 표현이 있는가 */
export function isSelfHarmMessage(text: string): boolean {
  const t = normalizeForSafety(text);
  if (t === "") return false;
  return KEYWORDS.some((k) => k !== "" && t.includes(k));
}
