// 화면 글자는 문구 모듈에서 — 공용 컴포넌트·페이지 파일(.tsx)에 한글 문자열을 직접 적지 않는다(표시는 그대로).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHAT_TEXT } from "@/features/chat/chatModel";
import { APP_DESCRIPTION, SHARE_TEXT } from "@/features/meta/shareMeta";
import { SUBSTANCE_TEXT } from "@/features/substance/substanceModel";
import { EvidenceChip } from "./EvidenceChip";
import { UI_TEXT } from "./uiText";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
/** 주석을 뺀 코드에 한글이 있는가 */
const hangulInCode = (src: string) =>
  /[가-힣]/.test(
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1"),
  );

describe("문구 모듈로 옮긴 글자 — 보이는 글자는 그대로", () => {
  it("공용 컴포넌트의 [뒤로]·출처 낭독 말", () => {
    expect(UI_TEXT).toEqual({ back: "뒤로", sourceHint: "출처: " });
    expect(renderToStaticMarkup(h(EvidenceChip, { token: "src:2023 임산부수첩" }))).toContain('<span class="sr-only">출처: </span>2023 임산부수첩');
  });

  it("문서 제목·설명 — AI 상담·약물·음식 체크(원문), 앱 이름·설명", () => {
    expect(CHAT_TEXT.title).toBe("AI 상담");
    expect(SUBSTANCE_TEXT.title).toBe("약물·음식 체크");
    expect(SHARE_TEXT.brand).toBe("온맘");
    expect(APP_DESCRIPTION).toBe("엄마의 산후 회복 케어 - 퇴원부터 산후 6주 검진까지");
  });

  it("페이지와 화면이 같은 값을 쓴다(제목을 두 번 적지 않는다)", () => {
    expect(read("../../app/(app)/chat/page.tsx")).toContain("title: CHAT_TEXT.title");
    expect(read("../../features/chat/ChatScreen.tsx")).toContain("title={CHAT_TEXT.title}");
    expect(read("../../app/(app)/substance/page.tsx")).toContain("title: SUBSTANCE_TEXT.title");
    expect(read("../../features/substance/SubstanceCheckScreen.tsx")).toContain("title={SUBSTANCE_TEXT.title}");
  });

  it("이 파일들의 코드(주석 제외)에는 한글이 없다", () => {
    for (const file of [
      "./SubPageHeader.tsx",
      "./EvidenceChip.tsx",
      "../../app/layout.tsx",
      "../../app/global-error.tsx",
      "../../app/(app)/chat/page.tsx",
      "../../app/(app)/substance/page.tsx",
    ]) {
      expect(hangulInCode(read(file)), file).toBe(false);
    }
  });

  it("새 문구는 표시가 있다 — 웹 신규 문구는 CPO 확인 표시, iOS 원문은 원문 표시", () => {
    const ui = read("./uiText.ts");
    expect(ui.match(/웹 신규 문구 — CPO 확인 필요/g)).toHaveLength(2);
    expect(read("../../features/meta/shareMeta.ts")).toMatch(/웹 신규 문구 — CPO 확인 필요[^\n]*\nexport const APP_DESCRIPTION/);
    expect(read("../../features/chat/chatModel.ts")).toContain('title: "AI 상담", // 원문: ChatView.swift:51');
    expect(read("../../features/substance/substanceModel.ts")).toContain('title: "약물·음식 체크", // 원문: SubstanceCheckView.swift:56');
  });
});
