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
 * 과장 표현("힘들어 죽겠다")·죽음에 대한 걱정("죽을까 봐 무서워요")은 넣지 않았다. 바꾸면 docs/dev/SUPABASE_FUNCTIONS.md에도 적는다.
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
  // 2026-11-13 임상 자체 검토(docs/dev/clinical/CLINICAL_SELF_REVIEW_2026-11.md §7 M5·KW): 아기·자기를 해칠 생각과 삶을 끝내려는 말이 빠져 있었다
  // — 기록 탭의 위기 토글 문구("…해칠 것 같은 생각")조차 챗이 잡지 못했다. CDC "You may think about hurting your baby", AWHONN 911.
  // "죽을 것 같아요"·"다 끝내고 싶어요"·"아기가 없었으면"·"약을 한꺼번에"는 과장·수유 끝내기·약 질문과 겹쳐 넣지 않았다(기본 답의 109 줄로 대신 —
  // content.json chat_fallback.replies.default).
  "해칠것같",
  "해치고싶",
  "해칠생각",
  "해치는생각",
  "해칠충동",
  "때릴것같",
  "던져버리고싶",
  "던질것같",
  "죽이고싶",
  "죽일것같",
  "죽어야겠",
  "죽어버려야",
  "삶을끝내",
  "인생을끝내",
  "목숨을버리",
  "사는게의미가없",
  "사는게의미없",
  "살아야할이유가없",
  "살아갈이유가없",
  "같이죽을까",
  "같이죽자",
  "세상에없었으면",
  "태어나지말걸",
  "태어나지말았어야",
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

/**
 * 공백을 지워서 생긴 두 글자 키워드 오탐을 가리는 규칙 — "피자 살"(자살)·"초보자 해도"(자해)·"전복죽 고기"(죽고).
 * 키워드가 띄어쓰기를 넘고, 앞 낱말의 끝 글자에서 시작하면 세지 않는다. 다만 뒤가 이 꼴이면 위기 표현이 띄어쓰기로 갈라진 것일 수 있어 그대로 센다.
 * 놓치지 않는 것이 먼저다:
 * - "자 살"·"자 해"처럼 첫 글자가 홀로 떨어진 꼴은 앞 낱말의 끝이 아니라서 그대로 걸린다(띄어 써서 피하는 입력).
 * - 띄어쓰기를 넘지 않는 자리("피자살"처럼 붙여 쓴 꼴)는 그대로 걸린다(잘못 걸리는 쪽이 낫다).
 * - 세 글자 이상 키워드("살기싫"·"목을매")는 이 규칙을 쓰지 않는다 — "이제그만 살고 싶어"처럼 앞말이 붙어도 놓치지 않게.
 *   그래서 "목을 매일 스트레칭"은 그대로 걸린다(위기 안내가 한 번 나올 뿐).
 * 낱말 목록으로 가리지 않는다 — "과자살"을 가리면 "우울증과 자살 생각"(우울증과자살…)까지 지워진다.
 * 웹 서버 신규 — 임상 자문 확인 필요. 바꾸면 src/api/edgeFunctions.test.ts의 예문도 함께 본다.
 */
const CROSS_WORD_KEYWORD_CRISIS_AFTER: Readonly<Record<string, RegExp>> = {
  죽고: /^(?:싶|파|프|만싶)/,
  자살: /^(?:하|시도|충동|생각|했|할)/,
  자해: /^(?:하|를|충동|생각|했|할)/,
};

/** 비교용 글자(normalizeForSafety와 같은 글자) + 글자마다 원문의 몇 번째 낱말인지·그 낱말의 첫 글자인지 */
function joinWords(text: string): { joined: string; wordOf: number[]; startsWord: boolean[] } {
  let joined = "";
  const wordOf: number[] = [];
  const startsWord: boolean[] = [];
  text
    .normalize("NFC")
    .split(/\s+/)
    .forEach((word, index) => {
      const part = normalizeForSafety(word);
      for (let i = 0; i < part.length; i++) {
        wordOf.push(index);
        startsWord.push(i === 0);
      }
      joined += part;
    });
  return { joined, wordOf, startsWord };
}

/** 자해·자살 의도 표현이 있는가 — 무해한 구절(SELF_HARM_BENIGN_PHRASES)을 가린 뒤 키워드를 찾는다 */
export function isSelfHarmMessage(text: string): boolean {
  const { joined, wordOf, startsWord } = joinWords(text);
  // 가린 자리는 같은 길이의 공백 — 글자 자리가 그대로라 아래에서 원문의 낱말 경계를 볼 수 있다
  const t = joined.replace(SELF_HARM_BENIGN_PATTERN, (phrase) => " ".repeat(phrase.length));
  if (t.trim() === "") return false;
  return KEYWORDS.some((k) => {
    if (k === "") return false;
    const crisisAfter = CROSS_WORD_KEYWORD_CRISIS_AFTER[k];
    for (let at = t.indexOf(k); at !== -1; at = t.indexOf(k, at + 1)) {
      const end = at + k.length;
      const tailOfPreviousWord = wordOf[at] !== wordOf[end - 1] && !startsWord[at];
      if (crisisAfter === undefined || !tailOfPreviousWord || crisisAfter.test(t.slice(end))) return true;
    }
    return false;
  });
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
 * 몸의 증상을 주어로 "사라지"는 구절의 주어 — 2026-11-13 임상 자체 검토 §7 KW("뱃살이 사라지고"·"기미가 사라지고"·"두통이 사라지고"·
 * "모유가 사라지고"가 위기 안내로 갔다). 조사(이·가·은·는·도)와 사이 말(다·싹·거의·점점·조금씩)을 붙인 꼴을 모두 만든다(VANISHING_PHRASES).
 */
export const VANISHING_SUBJECTS: readonly string[] = [
  "뱃살", "기미", "두통", "복통", "요통", "골반통", "훗배앓이", "배뭉침", "멍울", "모유", "젖", "여드름", "트러블", "두드러기", "발진",
  "땀띠", "황달", "태열", "착색", "주근깨", "다크서클", "입덧", "부종", "저림", "염증", "상처", "혹", "냄새", "가려움", "임신선", "살",
];
const VANISHING_PARTICLES = ["이", "가", "은", "는", "도"] as const;
const VANISHING_BETWEEN = ["", "다 ", "싹 ", "거의 ", "점점 ", "조금씩 "] as const;
// "혹은"은 접속사("또는")이기도 하다 — "그냥 혹은 사라지고 싶어"를 지우지 않게 뺀다
const VANISHING_PHRASES: readonly string[] = VANISHING_SUBJECTS.flatMap((subject) =>
  VANISHING_PARTICLES.flatMap((particle) => VANISHING_BETWEEN.map((between) => `${subject}${particle} ${between}사라지`)),
).filter((phrase) => !phrase.startsWith("혹은 "));

/**
 * 위기 키워드 "사라지고"(content.json)·"사라지…"(위 보강 목록)를 품은 산후 질문의 흔한 구절 — 주어가 몸의 증상이다.
 * "다 사라지고 싶어요"처럼 주어가 없거나 자기인 말은 지우지 않는다. 구절만 지우므로 "통증이 사라지고 나니 이제 내가 사라지고 싶어요"는
 * 뒤의 "사라지고 싶"이 남아 그대로 걸린다.
 */
export const SELF_HARM_BENIGN_PHRASES: readonly BenignPhrase[] = [
  ...[
    "붓기가 사라지",
    "부기가 사라지",
    "통증이 사라지",
    "증상이 사라지",
    "열이 사라지",
    "멍이 사라지",
    "자국이 사라지",
    "흉터가 사라지",
    "오로가 사라지",
    "오로가 다 사라지",
    "튼살이 사라지",
    "젖몸살이 사라지",
  ],
  ...VANISHING_PHRASES,
].map((phrase) => ({ phrase }));

/** "피"가 바로 뒤에 올 수 있는 조사·말 — 띄어 쓰지 않은 "어떡해피가"·"피하고 덩어리가"처럼 피(血)로 읽힐 수 있는 자리 */
const BLOOD_AFTER = "가|를|도|만|이|랑|와|하고|나|났|난|좀|계속|많|너무|안|멈|섞|묻|비|덩|흘";

/**
 * 출혈 키워드 "피"·"오로"·"패드"(content.json chat_fallback.bleeding_keywords)를 품은 다른 낱말 — 앱 규칙 폴백(src/rules/chat.ts)만 쓴다
 * (함수에는 출혈 분기가 없다. 목록을 한곳에서 검토하도록 여기 함께 둔다).
 * 뒤 꼴을 보는 낱말: 피로(피+로 "피로 젖었어요"), 커피(커피색·커피빛 — 분비물 색), 피부(피 부족·피 부터), 피자(피 자국·자꾸·자주), 피하(피 하고·하루·하혈·하나),
 * 해피(어떡해+피가), 피난(피 난다), 피드·피크·피동·피의자(피 드디어·크게·동반·자국), 오로지(오로 지금·지속·지나서) — 띄어 쓰지 않은 꼴은 피(血)·오로일 수 있다.
 * 뜻이 확실한 낱말만 더한다 — "기피"·"도피"·"회피"는 붙여 쓴 "아기 피"·"오늘도 피"·"3회 피"를 지울 수 있어 넣지 않았다.
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
  // "커피색 분비물"·"커피빛 오로"는 오래된 피의 색이라 남긴다
  { phrase: "커피", keepIfFollowedBy: "\\s*(?:색|빛)" },
  { phrase: "피부", keepIfFollowedBy: "족|분|터" },
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
  { phrase: "레시피" },
  { phrase: "테라피" },
  { phrase: "에피소드" },
  { phrase: "오피스" },
  { phrase: "스피닝" },
  { phrase: "피스타치오" },
  { phrase: "피톤치드" },
  { phrase: "오로지", keepIfFollowedBy: "금|속|나|난|날" },
  { phrase: "오로라" },
  // 출혈 키워드 "패드"(2026-11-13 — "패드가 한 시간 만에 다 젖어요")를 품은 물건 이름 — 띄어쓰기와 상관없이 맞는다("수유패드")
  { phrase: "수유 패드" },
  { phrase: "아이스 패드" },
  { phrase: "방수 패드" },
  { phrase: "패드형" },
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
