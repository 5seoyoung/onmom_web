// 근거 칩 토큰 해석 — AnalyzeComponents.swift:42-46.
// "src:" 접두가 붙은 토큰은 출처(문헌) 칩, 나머지는 근거 설명 칩이다. 화면에는 접두를 뗀 글자만 보인다.

export const SOURCE_PREFIX = "src:";

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
