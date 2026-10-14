import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTACT_TEXT } from "./contact";
import { TERMS_TEXT, termsDocument } from "./termsText";

// CPO·법률 검토 문서(docs/privacy/TERMS_DRAFT.md)가 코드의 약관 문구를 빠짐없이 담고 있는가.
// 코드가 원본이다 — 문구를 바꾸면 이 테스트가 실패하므로 검토 문서도 같이 고친다(검토받지 않은 문구가 나가지 않게).
// CI에서는 건너뛴다: 검토 문서(md)는 소유자 컴퓨터에만 최신본을 두고 커밋·푸시하지 않는다(2026-09-30 결정). 저장소의 사본은
// 옛 판이라 CI에서는 문구를 고칠 때마다 실패한다 — 이 대조는 최신 문서가 있는 소유자 컴퓨터에서 돌린다.
const ON_CI = !!process.env.CI;
const DOC = ON_CI ? "" : readFileSync(fileURLToPath(new URL("../../../docs/privacy/TERMS_DRAFT.md", import.meta.url)), "utf8");

describe.skipIf(ON_CI)("검토 문서가 코드의 약관 문구와 같다", () => {
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
