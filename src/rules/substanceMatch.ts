// 약물·음식 표의 별칭 맞추기 — 낱말 단위로만 맞춘다(부분 문자열로 맞추지 않는다).
//
// 왜: 예전 조회는 "입력에 별칭이 들어 있으면" 표 순서대로 첫 행을 골랐다(iOS localizedCaseInsensitiveContains).
// 그래서 "수술 후 진통제"가 술 행("피하세요"), "세티리진·레보티록신·아티반"이 티 행(카페인), "콜라겐"이 콜라 행,
// "회음부 연고"가 회 행으로 갔고, "다이어트 영양제"·"퀴놀론계 항생제"는 "수유 중 가능"이 나왔다(임상 사전 검토 §4-6).
// 틀린 "수유 중 가능"은 안전 문제다. 그래서 확실히 그 품목일 때만 표가 답하고, 아니면 "맞춤 없음"을 돌려준다 —
// 화면은 그때 지금과 같은 "정보 부족"(AI가 켜져 있으면 AI)으로 간다. 추측해서 다른 행을 고르지 않는다.
//
// 규칙 (입력과 별칭 모두 NFC로 맞추고 소문자로 바꾼 뒤):
//  1. 별칭 앞은 입력의 처음이거나 띄어쓰기·문장부호여야 한다 — "수술"의 술, "회음부"의 회, "세티리진"의 티, "전자담배"의 담배는 맞지 않는다.
//     영문 별칭만 한글·숫자 바로 뒤에서도 시작한다(김치tea — 놓치지 않고 아래 규칙으로 본다).
//  2. 별칭 뒤는 입력의 끝·띄어쓰기·문장부호, 또는 그 낱말의 나머지가 전부 허용한 꼬리(토씨·어미·먹어도·마셔도…)여야 한다
//     — "콜라겐"(겐), "커피우유"(우유), "맥주효모"(효모)는 맞지 않는다.
//  3. 한 글자 별칭(술·회·티)은 기본 토씨와 먹어도·마셔도 같은 말만 붙는다. 의·에·로·고·나나 복용처럼 한 글자 뒤에 붙으면
//     다른 낱말이 되는 꼬리(회의·회로·회고·회복용·티나다)는 받지 않는다.
//  4. 두 글자 이상 별칭은 꼬리를 더 받는다: 의·에·로·나…, 거·것(매운거), 약 모양 꼬리 제·정·액·시럽·캡슐(철분제·홍삼정).
//  5. 한글 별칭 바로 뒤의 영문·숫자는 낱말 경계로 본다(비타민C·타이레놀500·커피2잔). 영문 별칭 뒤의 영문은 아니다(teaspoon).
//  6. 세 글자 이상 한글 별칭은 사이를 띄어 써도 맞는다(종합 감기약·에너지 드링크·생선 회). 별칭 안의 띄어쓰기·문장부호는
//     입력에서 있어도 없어도 된다(앞으로 "경구 세마글루타이드"·"glp-1" 같은 별칭이 들어와도).
//  7. 맞은 별칭이 겹치면 더 긴(더 구체적인) 별칭이 이긴다 — "생선회"는 생선 행이 아니라 생선회 행.
//     같은 자리에 다른 행이 맞거나 일부만 겹치면 맞춤 없음.
//  8. 서로 다른 행의 별칭이 입력의 다른 곳에 있으면(타이레놀이랑 술) 한 판정을 고를 수 없어 맞춤 없음.
//  9. 별칭 바로 앞 낱말이 그 품목을 꾸미면(다이어트 영양제·퀴놀론계 항생제·허브 티·어린이 타이레놀) 표에 적힌 그 품목이
//     아닐 수 있어 맞춤 없음. 상황만 말하는 앞말(수유 중·출산 후·제왕절개 후·산후·혹시·언제부터…)과 같은 행의 다른 별칭은 괜찮다.
// 10. 별칭(과 붙은 꼬리) 바로 뒤 낱말도 같다 — 먹어도·되나요·한 잔·500mg·시럽 같은 말이나 같은 행의 다른 별칭만 괜찮다.
//     "타이레놀 콜드"(복합 감기약)·"아세트아미노펜 트라마돌"(울트라셋 성분)·"맥주 효모"·"마늘 주사"·"타이레놀 말고 다른 진통제"는
//     표의 그 품목이 아니므로 맞춤 없음.
//
// 앞뒤 한 낱말만 본다. 더 떨어진 곳의 다른 품목(타이레놀 먹고 트라마돌)은 그 품목이 표에 있을 때만 규칙 8로 걸린다 —
// 표에 행·별칭을 더하면(겹치면 긴 별칭이 이긴다) 이 규칙들이 그대로 따른다.
// 이 파일은 다른 모듈을 불러오지 않는다(표는 부르는 쪽이 넘긴다 — rules/substance.ts가 content.json 표를 넘긴다).

export interface AliasRow {
  readonly aliases: readonly string[];
}

/** 맞춤 결과 — match일 때만 표가 답한다. 나머지는 모두 "표에 없음"으로 간다(이유는 시험·기록용). */
export type SubstanceMatch<Row extends AliasRow> =
  | { kind: "match"; row: Row; alias: string }
  | { kind: "none" }
  /** 다른 행의 별칭이 함께 맞았다(같은 자리·일부 겹침·다른 곳) */
  | { kind: "ambiguous"; aliases: string[] }
  /** 별칭 바로 앞(before)이나 뒤(after) 낱말이 품목을 바꿀 수 있다 */
  | { kind: "qualified"; alias: string; qualifier: string; position: "before" | "after" };

type CharKind = "hangul" | "latin" | "digit" | "other" | "sep";

// ── 꼬리(별칭 바로 뒤에 띄어 쓰지 않고 붙는 말) ─────────────────────────────────────────────
// 낱말의 나머지가 이 조각들로 끝까지 나뉠 때만 같은 품목으로 본다("는요" = 는 + 요, "먹어도되나요" = 먹어도 + 되나요).

/** 한 글자 별칭에도 붙는 꼬리 — 술·회·티 뒤에 붙어 흔한 다른 낱말이 되지 않는 것만 */
const SHORT_SUFFIXES = [
  // 토씨
  "이", "가", "은", "는", "을", "를", "도", "만", "랑", "이랑", "하고", "과", "와", "까지", "부터", "보다", "처럼", "만큼", "이나",
  // 이다·물음
  "요", "이요", "예요", "이에요", "인가요", "인지", "인데", "인데요", "일까요", "이죠",
  // 먹다·마시다·쓰다·바르다·피우다 + 되다·괜찮다·가능
  "먹어도", "먹어요", "먹으면", "먹고", "먹는", "먹었는데", "먹었어요", "먹을까요",
  "마셔도", "마셔요", "마시면", "마시고", "마시는", "마셨는데", "마셨어요", "마실까요",
  "드셔도", "드시면", "피워도", "피우면", "피우는", "피웠는데", "써도", "쓰면", "발라도", "바르면", "해도", "하면", "안",
  "되나요", "돼요", "되요", "될까요", "되죠", "되는지", "되는데",
  "괜찮나요", "괜찮아요", "괜찮을까요", "괜찮은가요", "괜찮은지", "가능", "가능한가요", "가능해요", "가능할까요",
  "안전", "안전한가요", "안전해요", "어때요", "어떤가요", "어떨까요",
  // 양
  "한잔", "두잔", "세잔", "반잔", "한캔", "한병", "한알", "두알", "한개", "한번", "조금", "약간",
] as const;

/** 두 글자 이상 별칭(영문 별칭 포함)에만 더 붙는 꼬리 */
const LONG_ONLY_SUFFIXES = [
  // 토씨 — 한 글자 뒤에서는 회의·회로·회고·티나다가 된다
  "의", "에", "에서", "에는", "엔", "에도", "로", "으로", "나", "든", "이든", "라도", "이라도", "들", "같은",
  // 이다
  "에요", "이다", "입니다", "죠", "이야", "야", "이라", "라", "이라서", "라서", "이면", "면", "이니까", "니까", "이고", "고",
  // 것 — 매운거·매운것
  "거", "것", "건", "걸",
  // 복용·섭취 — 한 글자 뒤에서는 회복용이 된다
  "복용", "복용해도", "복용하면", "복용중", "섭취", "섭취해도", "섭취하면",
  // 약 모양 — 철분제·홍삼정·홍삼액·부루펜시럽·철분캡슐(같은 품목을 다른 모양으로 부르는 말만. 주사·연고·패치처럼 쓰는 길이 바뀌는 말은 넣지 않는다)
  "제", "정", "액", "시럽", "캡슐",
] as const;

// ── 앞말(별칭 바로 앞 낱말) ─────────────────────────────────────────────
// 꾸밈이 아니라 상황만 말하는 앞말. 여기 없는 앞말은 품목을 꾸미는 말로 보고 표가 답하지 않는다(규칙 9).

/** 그 자체로 상황·때·물음을 말하는 낱말(뒤에 꼬리가 붙어도 된다 — 요즘에·지금은·제가) */
const CONTEXT_WORDS = [
  "산후", "지금", "요즘", "오늘", "혹시", "매일", "가끔", "식후",
  "언제", "언제부터", "언제까지", "얼마나", "다시", "계속", "그냥", "좀",
  "저", "제", "나", "내",
] as const;
/** 수유·출산 같은 상황 이름 — 뒤에 중·후가 붙으면(수유 중·수유중·출산 후에) 상황을 말하는 앞말이 된다 */
const SCENE_NOUNS = ["수유", "모유수유", "완모", "혼합수유", "단유", "출산", "분만", "제왕절개", "자연분만", "수술", "산후"] as const;
const SCENE_TAILS = ["중", "후", "뒤", "이후", "직후", "동안", "때"] as const;

// ── 뒷말(별칭과 꼬리 바로 뒤 낱말) ─────────────────────────────────────────────
// 품목을 바꾸지 않는 뒷말 — 이 조각과 꼬리로 끝까지 나뉘는 한글 낱말, 숫자, 세 글자 이하 영문(mg·ml·er·c·d3)만(규칙 10).
// 주사·연고·패치·콜드·효모·우유·말고처럼 여기 없는 말이 바로 뒤에 오면 표가 답하지 않는다.
const FOLLOW_WORDS = [
  // 먹다·마시다·복용·섭취·드시다·피우다·쓰다·바르다·하다
  "먹어도", "먹어요", "먹으면", "먹고", "먹는", "먹는데", "먹었는데", "먹었어요", "먹을까요", "먹을", "먹기", "먹어", "먹어야", "먹은",
  "마셔도", "마셔요", "마시면", "마시고", "마시는", "마시는데", "마셨는데", "마셨어요", "마실까요", "마실", "마시기", "마셔", "마셔야", "마신",
  "복용", "복용해도", "복용하면", "복용중", "복용해야", "섭취", "섭취해도", "섭취하면",
  "드셔도", "드시면", "드실", "피워도", "피우면", "피우는", "피울", "피웠는데",
  "써도", "쓰면", "쓸", "사용", "사용해도", "사용하면", "발라도", "바르면", "바를",
  "해도", "하면", "할까요", "해요", "했는데", "했어요", "하나요", "하는", "하는데",
  // 되다·괜찮다·가능·안전·위험·있다·없다·물음
  "되나요", "돼요", "되요", "될까요", "되죠", "되는지", "되는데", "되나", "될", "돼", "되는", "된", "됐는데",
  "괜찮나요", "괜찮아요", "괜찮을까요", "괜찮은가요", "괜찮은지", "괜찮죠", "괜찮은", "괜찮을", "괜찮아",
  "가능", "가능한가요", "가능해요", "가능할까요", "가능한지", "가능한", "안전", "안전한가요", "안전해요", "안전한지", "안전한",
  "위험", "위험한가요", "위험해요", "위험한지", "있나요", "있어요", "있을까요", "있는지", "없나요", "없어요", "수",
  "어때요", "어떤가요", "어떨까요", "싶어요", "싶은데", "알려주세요", "궁금", "궁금해요", "걱정", "때문",
  // 양·횟수·때
  "한", "두", "세", "네", "반", "몇", "하루", "매일", "일주일", "주", "일", "시간",
  "잔", "캔", "병", "알", "알약", "정", "개", "컵", "번", "회", "포", "스푼", "모금", "개월",
  "조금", "약간", "소량", "많이", "적당히", "정도", "이상", "이하", "씩", "마다",
  // 물음·상황
  "언제", "언제부터", "언제까지", "얼마나", "얼마", "어떻게", "왜", "다시", "계속", "그냥", "좀", "너무", "정말", "진짜", "같이", "함께", "혹시",
  "수유", "수유중", "모유", "모유수유", "중", "후", "이후", "동안", "때", "산후", "출산", "출산후", "지금", "요즘", "오늘", "가끔", "자주",
] as const;

const isShortSuffixRun = atomSplitter(SHORT_SUFFIXES);
const isLongSuffixRun = atomSplitter([...SHORT_SUFFIXES, ...LONG_ONLY_SUFFIXES]);
const isFollowRun = atomSplitter([...FOLLOW_WORDS, ...SHORT_SUFFIXES, ...LONG_ONLY_SUFFIXES]);
const SCENE_NOUN_SET: ReadonlySet<string> = new Set(SCENE_NOUNS);
/** 별칭 안의 띄어쓰기·문장부호 자리 — 입력에서는 0개 이상(호환 자모도 문장부호처럼) */
const SEP_RUN = "(?:[^\\p{L}\\p{M}\\p{N}]|[\\u3130-\\u318f])*";
const LATIN_RE = /\p{Script=Latin}/u;
const DIGIT_RE = /\p{Nd}/u;
const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}]/u;

/** 입력·별칭을 같은 모양으로 — 한글 자모가 분리된(NFD) 입력도 같은 글자로 보고, 영문 대소문자를 무시한다 */
export function foldForMatch(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

interface CompiledAlias {
  rowIndex: number;
  /** content.json에 적힌 그대로 */
  alias: string;
  pattern: RegExp;
  /** 한 글자 한글 별칭(술·회·티)이면 꼬리를 좁게 받는다(규칙 3) */
  short: boolean;
}

interface Occurrence {
  rowIndex: number;
  alias: string;
  /** 별칭이 차지한 자리 [start, end) */
  start: number;
  end: number;
  /** 붙은 꼬리까지 포함한 낱말의 끝 */
  tokenEnd: number;
}

/**
 * 표를 받아 맞추는 함수를 만든다(별칭 패턴은 한 번만 만든다). 빈 별칭·문장부호뿐인 별칭은 어떤 입력에도 맞지 않는다.
 * 표 순서는 결과에 영향을 주지 않는다 — 행을 고르는 기준은 위 규칙뿐이다.
 */
export function createSubstanceMatcher<Row extends AliasRow>(table: readonly Row[]): (query: string) => SubstanceMatch<Row> {
  const compiled: CompiledAlias[] = [];
  table.forEach((row, rowIndex) => {
    for (const alias of row.aliases) {
      const c = compileAlias(alias, rowIndex);
      if (c) compiled.push(c);
    }
  });

  return (query) => {
    const q = foldForMatch(query);
    const found = findOccurrences(q, compiled);
    if (found.length === 0) return { kind: "none" };

    // 규칙 7 — 다른 별칭 자리 안에 완전히 들어가는 것은 버린다(긴 별칭이 이긴다)
    const kept = found.filter((o) => !found.some((p) => p !== o && strictlyContains(p, o)));
    for (let i = 0; i < kept.length; i++) {
      for (let k = i + 1; k < kept.length; k++) {
        const a = kept[i];
        const b = kept[k];
        if (a.rowIndex === b.rowIndex) continue;
        // 같은 자리에 다른 행, 또는 일부만 겹침 — 어느 쪽이 맞는지 정할 수 없다
        if (a.start < b.end && b.start < a.end) return { kind: "ambiguous", aliases: [a.alias, b.alias] };
      }
    }

    // 규칙 8 — 서로 다른 행이 남았다
    const rows = [...new Set(kept.map((o) => o.rowIndex))];
    if (rows.length > 1) {
      const aliases = rows.map((r) => kept.find((o) => o.rowIndex === r)!.alias);
      return { kind: "ambiguous", aliases };
    }

    // 규칙 9 — 바로 앞 낱말이 품목을 꾸미는가
    for (const o of kept) {
      const before = wordBefore(q, o.start);
      if (before === null) continue;
      if (kept.some((p) => p.tokenEnd === before.end)) continue; // 같은 행의 다른 별칭(녹차 홍차·녹차랑 홍차)
      if (isContextWord(before.word, wordBefore(q, before.start)?.word ?? null)) continue;
      return { kind: "qualified", alias: o.alias, qualifier: before.word, position: "before" };
    }

    // 규칙 10 — 바로 뒤 낱말이 품목을 바꾸는가
    for (const o of kept) {
      const after = wordAfter(q, o.tokenEnd);
      if (after === null) continue;
      if (kept.some((p) => p.start === after.start)) continue; // 같은 행의 다른 별칭(철분 영양제·타이레놀(아세트아미노펜))
      if (isNeutralFollower(after.word)) continue;
      return { kind: "qualified", alias: o.alias, qualifier: after.word, position: "after" };
    }

    const first = kept.reduce((a, b) => (b.start < a.start ? b : a));
    return { kind: "match", row: table[rows[0]], alias: first.alias };
  };
}

function compileAlias(alias: string, rowIndex: number): CompiledAlias | null {
  const chars = [...foldForMatch(alias)];
  // 앞뒤 띄어쓰기·문장부호는 별칭의 일부로 보지 않는다
  while (chars.length > 0 && charKind(chars[0]) === "sep") chars.shift();
  while (chars.length > 0 && charKind(chars[chars.length - 1]) === "sep") chars.pop();
  if (chars.length === 0) return null;

  const allHangul = chars.every((ch) => charKind(ch) === "hangul");
  // 규칙 6 — 세 글자 이상 한글 별칭은 글자 사이 띄어쓰기를 받는다
  const between = allHangul && chars.length >= 3 ? "\\s*" : "";
  let source = "";
  let prevWord = false;
  for (const ch of chars) {
    if (charKind(ch) === "sep") {
      // 별칭 안의 띄어쓰기·문장부호 — 입력에서는 있어도 없어도 된다
      if (prevWord) source += SEP_RUN;
      prevWord = false;
      continue;
    }
    if (prevWord) source += between;
    source += escapeRegExp(ch);
    prevWord = true;
  }
  return { rowIndex, alias, pattern: new RegExp(source, "gu"), short: allHangul && chars.length === 1 };
}

function findOccurrences(q: string, compiled: readonly CompiledAlias[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const c of compiled) {
    c.pattern.lastIndex = 0;
    for (let m = c.pattern.exec(q); m !== null; m = c.pattern.exec(q)) {
      const start = m.index;
      const end = start + m[0].length;
      // 겹치는 자리도 찾는다(다음 검색은 한 글자 뒤에서)
      c.pattern.lastIndex = start + 1;
      if (!leftBoundary(q, start)) continue; // 규칙 1
      const tokenEnd = rightBoundary(q, end, charKind(q[end - 1]), c.short); // 규칙 2·3·4·5
      if (tokenEnd === null) continue;
      if (!out.some((o) => o.rowIndex === c.rowIndex && o.start === start && o.end === end)) {
        out.push({ rowIndex: c.rowIndex, alias: c.alias, start, end, tokenEnd });
      }
    }
  }
  return out;
}

/**
 * 별칭이 start에서 시작해도 되는가 — 입력의 처음이거나 띄어쓰기·문장부호 뒤. 영문 별칭만 한글·숫자 바로 뒤에서도 시작한다
 * (김치tea의 tea를 놓치지 않게 — 그래야 규칙 8·9가 본다). 한글 별칭은 숫자·영문 바로 뒤에서 시작하지 않는다(3회의 회).
 */
function leftBoundary(q: string, start: number): boolean {
  if (start === 0) return true;
  const prev = charKind(q[start - 1]);
  if (prev === "sep") return true;
  return charKind(q[start]) === "latin" && (prev === "hangul" || prev === "digit");
}

/** 별칭이 end에서 끝날 때 낱말이 거기서(또는 허용한 꼬리 뒤에서) 끝나면 낱말의 끝, 아니면 null */
function rightBoundary(q: string, end: number, lastKind: CharKind, short: boolean): number | null {
  if (end >= q.length) return end;
  const next = charKind(q[end]);
  if (next === "sep") return end;
  if (next === "hangul") {
    let runEnd = end;
    while (runEnd < q.length && charKind(q[runEnd]) === "hangul") runEnd++;
    const rest = q.slice(end, runEnd);
    return (short ? isShortSuffixRun : isLongSuffixRun)(rest) ? runEnd : null;
  }
  // 한글 뒤 영문·숫자, 영문 뒤 숫자처럼 글자 종류가 바뀌면 경계(비타민C·타이레놀500). 같은 종류가 이어지면 더 긴 낱말이다.
  return next !== lastKind ? end : null;
}

/** pos 바로 앞(띄어쓰기·문장부호를 건너뛴) 낱말. 없으면 null */
function wordBefore(q: string, pos: number): { word: string; start: number; end: number } | null {
  let end = pos;
  while (end > 0 && charKind(q[end - 1]) === "sep") end--;
  if (end === 0) return null;
  let start = end;
  while (start > 0 && charKind(q[start - 1]) !== "sep") start--;
  return { word: q.slice(start, end), start, end };
}

/** pos부터(띄어쓰기·문장부호를 건너뛴) 다음 낱말. 없으면 null */
function wordAfter(q: string, pos: number): { word: string; start: number } | null {
  let start = pos;
  while (start < q.length && charKind(q[start]) === "sep") start++;
  if (start >= q.length) return null;
  let end = start;
  while (end < q.length && charKind(q[end]) !== "sep") end++;
  return { word: q.slice(start, end), start };
}

/** 품목을 바꾸지 않는 뒷말인가 — 글자 종류가 바뀌는 곳에서 나눠(500mg → 500 + mg, 2잔 → 2 + 잔) 조각마다 본다 */
function isNeutralFollower(word: string): boolean {
  let i = 0;
  while (i < word.length) {
    const kind = charKind(word[i]);
    let j = i + 1;
    while (j < word.length && charKind(word[j]) === kind) j++;
    const piece = word.slice(i, j);
    const ok = kind === "digit" || (kind === "latin" && piece.length <= 3) || (kind === "hangul" && isFollowRun(piece));
    if (!ok) return false;
    i = j;
  }
  return true;
}

function isContextWord(word: string, previous: string | null): boolean {
  // 요즘에·지금은·제가 — 상황 낱말 + 꼬리(없어도 된다)
  if (CONTEXT_WORDS.some((w) => word.startsWith(w) && isLongSuffixRun(word.slice(w.length), true))) return true;
  // 수유중·출산후에 — 상황 이름 + 중·후 + 꼬리
  if (SCENE_NOUNS.some((n) => word.startsWith(n) && isSceneTail(word.slice(n.length)))) return true;
  // 수유 중 · 출산 후에 · 제왕절개 수술 후 — 중·후만 따로 띄어 쓴 경우는 그 앞 낱말이 상황 이름일 때만
  return isSceneTail(word) && previous !== null && SCENE_NOUN_SET.has(previous);
}

/** 중·후·이후… + 꼬리(없어도 된다) */
function isSceneTail(word: string): boolean {
  return SCENE_TAILS.some((t) => word.startsWith(t) && isLongSuffixRun(word.slice(t.length), true));
}

function strictlyContains(outer: Occurrence, inner: Occurrence): boolean {
  return outer.start <= inner.start && inner.end <= outer.end && (outer.start !== inner.start || outer.end !== inner.end);
}

function charKind(ch: string): CharKind {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0xac00 && c <= 0xd7a3) return "hangul";
  // 조합형·옛한글 자모(NFC 뒤에도 남을 수 있다)는 한글 글자로
  if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0xa960 && c <= 0xa97f) || (c >= 0xd7b0 && c <= 0xd7ff)) return "hangul";
  // 호환 자모(ㅋㅋ·ㅠㅠ)는 낱말로 보지 않는다
  if (c >= 0x3130 && c <= 0x318f) return "sep";
  if (LATIN_RE.test(ch)) return "latin";
  if (DIGIT_RE.test(ch)) return "digit";
  if (WORD_CHAR_RE.test(ch)) return "other";
  return "sep";
}

/**
 * 낱말이 조각들을 이어 붙인 것으로 끝까지 나뉘는가(한 조각 이상, allowEmpty면 빈 낱말도). 정규식 `^(?:조각|…)+$`는 쓰지 않는다 —
 * "이랑"(= 이 + 랑)처럼 두 가지로 나뉘는 조각이 이어지면 되돌아가며 시도하는 길이 지수로 늘어 화면이 멈춘다
 * ("타이레놀" 뒤 "이랑" 24번에 1초, 30번이면 1분). 앞에서부터 닿을 수 있는 자리만 표시해 나가 낱말 길이에 비례해 끝난다.
 */
function atomSplitter(atoms: readonly string[]): (word: string, allowEmpty?: boolean) => boolean {
  const set: ReadonlySet<string> = new Set(atoms);
  const maxLen = Math.max(...atoms.map((a) => a.length));
  return (word, allowEmpty = false) => {
    if (word.length === 0) return allowEmpty;
    const reach = new Uint8Array(word.length + 1);
    reach[0] = 1;
    for (let i = 0; i < word.length; i++) {
      if (reach[i] === 0) continue;
      for (let len = 1; len <= maxLen && i + len <= word.length; len++) {
        if (set.has(word.slice(i, i + len))) reach[i + len] = 1;
      }
    }
    return reach[word.length] === 1;
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
