// Edge Function chat 공용 — 자해·자살 표현 안전 선필터(Deno·vitest 양쪽에서 읽는다. cors.ts 머리말 참고).
//
// 요청에 담긴 사용자 메시지 중 하나라도 자해·자살 의도 표현이 있으면 LLM을 부르지 않고, 앱 규칙 폴백과 같은 고정 위기 안내를 돌려준다(검수 #7).
// LLM은 판정 경로 밖이다(원칙 2) — 이 분기는 정해진 규칙(키워드)이 정한다.
// 놓치는 것보다 잘못 걸리는 쪽이 낫다(잘못 걸리면 위기 안내가 한 번 나올 뿐이고, 놓쳐도 시스템 프롬프트가 같은 연락처를 안내한다).
// 다만 산후 질문에 흔한 말("통증이 사라지고", "붓기가 사라지고")까지 막지 않도록 "사라지고"는 "사라지고 싶"처럼 의도가 드러나는 꼴로만 본다.
// 키워드를 찾기 전에 무해한 구절("붓기가 사라지" 등 SELF_HARM_BENIGN_PHRASES)을 지우고, 남은 글자에서 키워드를 찾는다(아래 "오탐 줄이기").
//
// 웹도 이 목록을 함께 쓴다(src/features/chat/chatModel.ts isCrisisMessage = content.json 키워드 ∪ 이 목록) — 위기 표현이면
// 동의 카드·AI 호출 없이 바로 위기 안내로 답하고, 그 턴은 뒤의 AI 요청에도 싣지 않는다. 그래서 이 파일은 가져오는 것이 없다(순수 모듈).
// 무해한 낱말 목록(위기·출혈)도 이 파일 한 곳에 둔다 — 웹 선필터·앱 규칙 폴백(src/rules/chat.ts)·이 함수가 같은 목록을 쓴다.
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

/** 자해·자살 의도 표현이 있는가 — 무해한 구절(SELF_HARM_BENIGN_PHRASES)을 지운 뒤 키워드를 찾는다 */
export function isSelfHarmMessage(text: string): boolean {
  const t = withoutSelfHarmBenign(normalizeForSafety(text));
  if (t.trim() === "") return false;
  return KEYWORDS.some((k) => k !== "" && t.includes(k));
}

// MARK: 오탐 줄이기 — 무해한 낱말·구절을 지운 뒤 원래 키워드로 찾는다
//
// 키워드 목록(content.json·위 목록)은 그대로 둔다. 찾기 전에 "그 키워드를 품었지만 뜻이 다른" 낱말·구절만 지우고, 남은 글자에서
// 원래 키워드를 찾는다. 그래서 무해한 낱말 바깥에 키워드가 하나라도 더 있으면 그대로 걸린다("커피 마셨는데 피가 나요").
// 지운 자리에는 공백 하나를 둔다 — 앞뒤 글자가 붙어 없던 키워드가 생기지 않게.
// 놓치지 않는 것이 먼저다: 낱말이 원래 키워드의 뜻일 수도 있는 자리(띄어 쓰지 않은 "피난다"·"피자국", "피로 젖었어요")는
// keepIfFollowedBy·onlyIfFollowedBy로 지우지 않는다 — 그런 자리는 예전처럼 걸린다(잘못 걸리는 쪽이 낫다).
// 목록은 웹 서버 신규 — 임상 자문 확인 필요. 바꾸면 src/rules/chat.test.ts·src/features/chat/chatModel.test.ts의 예문도 함께 본다.

/** 지울 낱말·구절 하나 */
export interface BenignPhrase {
  /** 지울 글자. 띄어쓰기 자리는 공백이 없거나 여러 개여도 맞는다("붓기가 사라지" = "붓기가사라지") */
  phrase: string;
  /** 바로 뒤가 이 꼴(정규식)이면 지우지 않는다 — 원래 키워드의 뜻일 수 있는 자리 */
  keepIfFollowedBy?: string;
  /** 바로 뒤가 이 꼴(정규식)일 때만 지운다 — 무해한 뜻이 확실한 자리만(그 밖은 모두 남긴다) */
  onlyIfFollowedBy?: string;
}

/**
 * 위기 키워드 "사라지고"(content.json)·"사라지…"(위 보강 목록)를 품은 산후 질문의 흔한 구절 — 주어가 몸의 증상이다.
 * "다 사라지고 싶어요"처럼 주어가 없거나 자기인 말은 지우지 않는다.
 */
export const SELF_HARM_BENIGN_PHRASES: readonly BenignPhrase[] = [
  "붓기가 사라지",
  "부기가 사라지",
  "통증이 사라지",
  "증상이 사라지",
  "열이 사라지",
  "멍이 사라지",
  "자국이 사라지",
  "흉터가 사라지",
  "오로가 사라지",
  "젖몸살이 사라지",
].map((phrase) => ({ phrase }));

/** "피"가 바로 뒤에 올 수 있는 조사·말 — 띄어 쓰지 않은 "어떡해피가"·"피하고 덩어리가"처럼 피(血)로 읽힐 수 있는 자리 */
const BLOOD_AFTER = "가|를|도|만|이|랑|와|하고|나|났|난|좀|계속|많|너무|안|멈|섞|묻|비|덩|흘";

/**
 * 출혈 키워드 "피"(content.json chat_fallback.bleeding_keywords)를 품은 다른 낱말 — 앱 규칙 폴백(src/rules/chat.ts)만 쓴다
 * (함수에는 출혈 분기가 없다. 목록을 한곳에서 검토하도록 여기 함께 둔다).
 * 뒤 꼴을 보는 낱말: 피로(피+로 "피로 젖었어요"), 피부(피 부족), 피자(피 자국·자꾸·자주), 피하(피 하고·하루·하혈·하나),
 * 해피(어떡해+피가), 피난(피 난다), 피드·피크·피동·피의자(피 드디어·크게·동반·자국) — 띄어 쓰지 않은 꼴은 피(血)일 수 있다.
 */
export const BLEEDING_BENIGN_WORDS: readonly BenignPhrase[] = [
  { phrase: "피곤" },
  // 피로(疲勞) — 뒤가 피로의 말(가·를·감·해·회복·누적 …)이거나 문장 끝일 때만. "피로 젖었어요"·"피로 시트가"(피+로)와
  // 띄어 쓰지 않은 "피로가득"(피로 가득)은 남긴다
  {
    phrase: "피로",
    onlyIfFollowedBy:
      "[가를는도감해하한증와랑에만]|로|까지|회복|누적|골절|때문|쌓|풀|물질|\\s*(?:$|[.,!?~ㅠㅜ])|\\s+(?:회복|누적|때문|쌓|풀|해소|증상|증후군|골절)",
    keepIfFollowedBy: "가득",
  },
  { phrase: "커피" },
  { phrase: "피부", keepIfFollowedBy: "족|분" },
  { phrase: "피임" },
  { phrase: "피자", keepIfFollowedBy: "국|꾸|주" },
  { phrase: "피아노" },
  { phrase: "피해" },
  { phrase: "피하", keepIfFollowedBy: "고|루|혈|나" },
  { phrase: "피드", keepIfFollowedBy: "디" },
  { phrase: "피크", keepIfFollowedBy: "게|기" },
  { phrase: "피트니스" },
  { phrase: "피클" },
  { phrase: "피망" },
  { phrase: "피규어" },
  { phrase: "피어싱" },
  { phrase: "스피커" },
  { phrase: "해피", keepIfFollowedBy: BLOOD_AFTER },
  { phrase: "슬리피" },
  { phrase: "피칭" },
  { phrase: "피날레" },
  { phrase: "피라미드" },
  { phrase: "피서" },
  // 피난(避難) — 뒤가 피난의 말(처·민·소·길·가방·훈련 …)일 때만. "피난다"·"피난 것 같아요"(피 난다)는 남긴다
  { phrase: "피난", onlyIfFollowedBy: "처|민|소|길|\\s*(?:가방|훈련|경로|용품|계획|시설|안내|대피)" },
  { phrase: "피동", keepIfFollowedBy: "반" },
  { phrase: "피의자", keepIfFollowedBy: "국" },
  { phrase: "피어나" },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 목록 → 정규식 하나(긴 낱말 먼저). 띄어쓰기 자리는 \s*, 뒤 꼴은 미리보기(lookahead)로만 본다(뒤보기는 쓰지 않는다 — 옛 Safari). */
export function benignPattern(list: readonly BenignPhrase[]): RegExp {
  const alternatives = [...list]
    .sort((a, b) => b.phrase.length - a.phrase.length)
    .map(({ phrase, keepIfFollowedBy, onlyIfFollowedBy }) => {
      const body = phrase.normalize("NFC").trim().split(/\s+/).map(escapeRegExp).join("\\s*");
      const only = onlyIfFollowedBy !== undefined ? `(?=${onlyIfFollowedBy})` : "";
      const keep = keepIfFollowedBy !== undefined ? `(?!${keepIfFollowedBy})` : "";
      return `${body}${only}${keep}`;
    });
  return new RegExp(alternatives.join("|"), "g");
}

const SELF_HARM_BENIGN_PATTERN = benignPattern(SELF_HARM_BENIGN_PHRASES);
const BLEEDING_BENIGN_PATTERN = benignPattern(BLEEDING_BENIGN_WORDS);

/** 비교용 접기(NFC·소문자) 뒤 목록의 낱말을 공백 하나로 바꾼다 */
function withoutBenign(text: string, pattern: RegExp): string {
  return text.normalize("NFC").toLowerCase().replace(pattern, " ");
}

/** 위기 키워드를 찾기 전 — "붓기가 사라지고 있어요" → " 고 있어요". 서버(위 isSelfHarmMessage)와 웹이 같이 쓴다. */
export function withoutSelfHarmBenign(text: string): string {
  return withoutBenign(text, SELF_HARM_BENIGN_PATTERN);
}

/** 출혈 키워드("피")를 찾기 전 — "커피 마셨어요" → "  마셨어요". 앱 규칙 폴백(src/rules/chat.ts)이 쓴다. */
export function withoutBleedingBenign(text: string): string {
  return withoutBenign(text, BLEEDING_BENIGN_PATTERN);
}

/**
 * 대화의 사용자 메시지 중 하나라도 자해·자살 표현인가 — Edge Function chat의 선필터가 요청마다 본다.
 * 마지막 메시지만 보면 앞선 턴에 위기 표현을 넣고 끝에 평범한 질문을 붙인 요청이 LLM으로 넘어간다.
 * 웹은 위기 턴을 AI 요청에서 이미 뺀다(chatModel withoutCrisisTurns) — 그래서 정상 대화는 여기 걸리지 않는다.
 * 어시스턴트 메시지는 보지 않는다 — 앱의 위기 안내(CRISIS_REPLY)에도 "자살예방상담"이 들어 있다.
 */
export function hasSelfHarmUserMessage(messages: readonly { role: string; content: string }[]): boolean {
  return messages.some((m) => m.role === "user" && isSelfHarmMessage(m.content));
}
