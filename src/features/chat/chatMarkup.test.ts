// AI 상담 첫 화면의 서버 렌더 마크업 — 설정 없는 빌드(지금 배포): 배너(원문) + 인사말, FAQ 없음, 인사말에는 AI·앱 안내 표시가 없다.
// 말풍선(ChatBubble) 하나씩: AI 답은 plain text(전화 링크 없음) + "AI 답변" 표시, 앱 안내는 안전 연계 번호가 tel: 링크 + "앱 안내" 표시.
// 보내기·답의 규칙은 chatModel.test.ts.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { CHAT_FAQ, CHAT_FAQ_TITLE, CHAT_GREETING } from "@/rules/chat";
import { ChatBubble, ChatScreen } from "./ChatScreen";
import { CHAT_ORIGIN_CAPTION, initialChatMessages, type ChatBubbleMessage } from "./chatModel";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("ChatScreen 첫 화면 — 설정 없는 빌드", () => {
  const html = renderToStaticMarkup(h(ChatScreen));

  it("배너는 content.json 원문(연결되지 않아) 그대로, 인사말 하나", () => {
    expect(html).toContain(escapeHtml(content.disclaimers.chat_banner));
    expect(html).toContain(escapeHtml(CHAT_GREETING));
    expect(html.match(/<li /g)).toHaveLength(1);
  });

  it("FAQ 칩은 서버가 답할 수 있을 때만 — 지금은 없다(D8)", () => {
    expect(html).not.toContain(CHAT_FAQ_TITLE);
    for (const q of CHAT_FAQ) expect(html).not.toContain(escapeHtml(q));
  });

  it("인사말에는 '앱 안내'·'AI 답변' 표시도, 전화 링크도 없다", () => {
    expect(html).not.toContain(`>${CHAT_ORIGIN_CAPTION.rules}</p>`);
    expect(html).not.toContain(escapeHtml(CHAT_ORIGIN_CAPTION.ai as string));
    expect(html).not.toContain('href="tel:');
  });

  it("입력창·보내기 버튼은 원문 이름, 저장소를 읽기 전에는 보내기 비활성", () => {
    expect(html).toContain('placeholder="메시지를 입력하세요"');
    expect(html).toMatch(/<button type="submit" aria-label="메시지 보내기" disabled=""/);
  });

  it("정적 HTML의 [뒤로]는 프로필(홈에서 열었는지는 브라우저에서 읽는다)", () => {
    expect(html).toMatch(/href="\/profile\/?"/);
  });
});

describe("ChatBubble — 어디서 온 답인지 표시 · 전화 링크는 앱 안내에만", () => {
  const bubble = (message: ChatBubbleMessage) => renderToStaticMarkup(h("ol", null, h(ChatBubble, { message })));
  const telHrefs = (html: string) => [...html.matchAll(/href="tel:([^"]*)"/g)].map((m) => m[1]);

  it("AI 답: 글자 속 번호가 있어도 tel: 링크를 만들지 않는다(지어낸 번호가 눌리지 않게) + 'AI 답변 · 진단·처방이 아닙니다'", () => {
    const html = bubble({ id: 1, role: "assistant", origin: "ai", text: "119에 전화 1577-0199" });
    expect(telHrefs(html)).toEqual([]);
    expect(html).toContain("119에 전화 1577-0199");
    expect(html).toContain(escapeHtml(CHAT_ORIGIN_CAPTION.ai as string));
    expect(html).toContain("AI 답변 · 진단·처방이 아닙니다");
    expect(html).not.toContain(`>${CHAT_ORIGIN_CAPTION.rules}</p>`);
  });

  it("앱 안내(위기 안내 원문): 1577-0199 · 109 · 119가 tel: 링크(글자 그대로) + '앱 안내'", () => {
    const text = content.chat_fallback.replies.self_harm;
    const html = bubble({ id: 2, role: "assistant", origin: "rules", text });
    expect(telHrefs(html)).toEqual(["15770199", "109", "119"]);
    for (const n of ["1577-0199", "109", "119"]) expect(html).toContain(`aria-label="${n}에 전화 걸기"`);
    // 링크를 빼면 원문 그대로(번호 표기·앞뒤 문장 변경 없음)
    expect(html.replace(/<[^>]+>/g, "")).toContain(escapeHtml(text));
    expect(html).toContain(`>${CHAT_ORIGIN_CAPTION.rules}</p>`);
    expect(html).not.toContain(escapeHtml(CHAT_ORIGIN_CAPTION.ai as string));
  });

  it("인사말: 표시 없음, 링크 없음", () => {
    const html = bubble(initialChatMessages()[0]);
    expect(telHrefs(html)).toEqual([]);
    expect(html).not.toContain(`>${CHAT_ORIGIN_CAPTION.rules}</p>`);
    expect(html).not.toContain(escapeHtml(CHAT_ORIGIN_CAPTION.ai as string));
    // 말풍선 하나(<p>)뿐 — 아래 표시 줄이 없다
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("사용자 말풍선: 번호가 있어도 링크 없음, 표시 없음", () => {
    const html = bubble({ id: 3, role: "user", text: "109에 전화해도 되나요?" });
    expect(telHrefs(html)).toEqual([]);
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("표시 글자는 AA 대비 토큰(text-subtle-aa)", () => {
    expect(bubble({ id: 4, role: "assistant", origin: "ai", text: "답" })).toContain('class="px-2 text-xs text-text-subtle-aa"');
  });
});
