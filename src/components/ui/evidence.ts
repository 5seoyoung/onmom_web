// 근거 칩 토큰 해석 — AnalyzeComponents.swift:42-46.
// "src:" 접두가 붙은 토큰은 출처(문헌) 칩, 나머지는 근거 설명 칩이다. 화면에는 접두를 뗀 글자만 보인다.
// 2026-11-15 산부인과 전문의 화면 검토: 출처를 칩으로 늘어놓으면 화면이 어지럽다 — 설명 칩은 그대로 보이고,
// 출처는 카드·묶음마다 하나의 접힌 "출처 보기"(SourceDisclosure)에 중복 없이 모은다(splitEvidenceTokens).

export const SOURCE_PREFIX = "src:";

/** 한 출처 토큰에 문헌 여럿을 적을 때의 구분 — 회복 가이드 카드(content.json guide_cards[].source "임산부수첩 2023 · NICE NG194") */
export const SOURCE_SEPARATOR = " · ";

export interface EvidenceToken {
  /** 화면에 보이는 글자("src:" 접두 제거) */
  text: string;
  /** 출처 칩 여부 — 출처 칩과 근거 설명 칩은 모양으로 구분해야 한다(원칙 4) */
  isSource: boolean;
}

export function parseEvidenceToken(token: string): EvidenceToken {
  return token.startsWith(SOURCE_PREFIX)
    ? { text: token.slice(SOURCE_PREFIX.length), isSource: true }
    : { text: token, isSource: false };
}

export interface SplitEvidence {
  /** 근거 설명 칩 토큰 — 들어온 순서·글자 그대로(화면에 칩으로 늘 보인다) */
  notes: string[];
  /** 출처 이름("src:" 접두 뗌) — " · "로 묶인 것은 하나씩 나누고, 같은 이름은 처음 나온 자리에 한 번만 */
  sources: string[];
}

/** 칩 토큰을 설명 칩과 출처 이름으로 나눈다. 여러 신호·카드의 토큰을 한데 넣으면 출처는 합집합(중복 없음)이 된다. */
export function splitEvidenceTokens(tokens: readonly string[]): SplitEvidence {
  const notes: string[] = [];
  const sources: string[] = [];
  for (const token of tokens) {
    const { text, isSource } = parseEvidenceToken(token);
    if (!isSource) {
      notes.push(token);
      continue;
    }
    for (const part of text.split(SOURCE_SEPARATOR)) {
      const name = part.trim();
      if (name !== "" && !sources.includes(name)) sources.push(name);
    }
  }
  return { notes, sources };
}
