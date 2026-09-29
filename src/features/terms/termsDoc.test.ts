import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTACT_TEXT } from "./contact";
import { TERMS_TEXT, termsDocument } from "./termsText";

// CPO·법률 검토 문서(docs/privacy/TERMS_DRAFT.md)가 코드의 약관 문구를 빠짐없이 담고 있는가.
// 코드가 원본이다 — 문구를 바꾸면 이 테스트가 실패하므로 검토 문서도 같이 고친다(검토받지 않은 문구가 나가지 않게).
// docs/privacy/는 공개 저장소에 있다(docs/private/가 아니다) — 늘 돈다.
const DOC = readFileSync(fileURLToPath(new URL("../../../docs/privacy/TERMS_DRAFT.md", import.meta.url)), "utf8");

describe("검토 문서가 코드의 약관 문구와 같다", () => {
  it("제목·초안 표시·작성일·안내·링크 이름", () => {
    const doc = termsDocument();
    for (const t of [doc.title, doc.draftLabel, doc.effective, doc.note, TERMS_TEXT.navTitle, TERMS_TEXT.openLink, CONTACT_TEXT.label, CONTACT_TEXT.subject]) {
      expect(DOC, t).toContain(t);
    }
  });

  it("모든 절의 모든 줄", () => {
    for (const s of termsDocument().sections) {
      expect(DOC, s.title).toContain(s.title);
      for (const line of s.body.split("\n").filter((l) => l.trim() !== "")) expect(DOC, line).toContain(line);
    }
  });
});
