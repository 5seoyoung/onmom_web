// AI 상담 첫 화면의 서버 렌더 마크업 — 설정 없는 빌드(브라우저 전용): 배너(원문) + 인사말, FAQ 없음, 인사말에는 AI·앱 안내 표시가 없다.
// 말풍선(ChatBubble) 하나씩: AI 답은 plain text(전화 링크 없음) + "AI 답변" 표시, 앱 안내는 안전 연계 번호가 tel: 링크 + "앱 안내" 표시.
// 보내기·답의 규칙은 chatModel.test.ts.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { CHAT_FAQ, CHAT_FAQ_TITLE, CHAT_GREETING } from "@/rules/chat";
import { CONTACT_EMAIL, mailtoHref } from "@/features/terms/contact";
import { ChatBubble, ChatScreen, FallbackNotice } from "./ChatScreen";
import { CHAT_ORIGIN_CAPTION, CHAT_TEXT, chatBannerText, initialChatMessages, type ChatBubbleMessage } from "./chatModel";

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

  it("인사말에는 '앱 안내'·'AI 답변' 표시가 없다", () => {
    expect(html).not.toContain(`>${CHAT_ORIGIN_CAPTION.rules}</p>`);
    expect(html).not.toContain(escapeHtml(CHAT_ORIGIN_CAPTION.ai as string));
  });

  it("늘 보이는 안내 — AI가 만든 일반 정보·틀릴 수 있음·진단이나 치료가 아님·응급은 119(전화 링크). 대화 스크롤 밖, 입력창 바로 위", () => {
    for (const word of ["AI가 만든 일반적인 건강 정보", "틀릴 수 있어요", "진단이나 치료가 아니에요", "119"]) expect(CHAT_TEXT.notice).toContain(word);
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain(escapeHtml(CHAT_TEXT.notice));
    expect([...html.matchAll(/href="tel:([^"]*)"/g)].map((m) => m[1])).toEqual(["119"]);
    const notice = html.indexOf("AI가 만든 일반적인 건강 정보");
    expect(notice).toBeGreaterThan(html.indexOf('role="log"'));
    expect(notice).toBeLessThan(html.indexOf("<form"));
    // 스크롤 영역(overflow-y-auto)의 닫는 태그들 뒤에 있다 — 대화 목록 안이 아니다
    expect(html.indexOf("<ol")).toBeLessThan(notice);
    expect(html.slice(html.indexOf("</ol>"), notice)).toContain("</div></div></div>");
  });

  it("입력창·보내기 버튼은 원문 이름, 저장소를 읽기 전에는 보내기 비활성", () => {
    expect(html).toContain('placeholder="메시지를 입력하세요"');
    expect(html).toMatch(/<button type="submit" aria-label="메시지 보내기" disabled=""/);
  });

  it("정적 HTML의 [뒤로]는 프로필(홈에서 열었는지는 브라우저에서 읽는다)", () => {
    expect(html).toMatch(/href="\/profile\/?"/);
  });
});

describe("FallbackNotice — 카카오 계정이 아닐 때 연결을 권하는 한 줄", () => {
  const notice = (kakaoInvite: boolean) => renderToStaticMarkup(h(FallbackNotice, { text: chatBannerText("loginRequired"), kakaoInvite }));

  it("배너 아래 한 줄 + 설정으로 가는 링크", () => {
    const html = notice(true);
    expect(html).toContain(escapeHtml(chatBannerText("loginRequired")));
    expect(html).toContain(CHAT_TEXT.kakaoInvite);
    expect(html).toMatch(new RegExp(`<a[^>]*href="/settings/?"[^>]*>${CHAT_TEXT.kakaoInviteLink}</a>`));
  });

  it("다른 이유의 배너에는 없다", () => {
    expect(notice(false)).not.toContain(CHAT_TEXT.kakaoInvite);
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

  it("AI 답에만 [답변 신고] — 제목만 채운 mailto, 대화 내용은 주소에 들어가지 않는다", () => {
    expect(CONTACT_EMAIL).not.toBeNull();
    const secret = "오로가 멈추지 않아요";
    const html = bubble({ id: 1, role: "assistant", origin: "ai", text: secret });
    const href = /<a[^>]*href="(mailto:[^"]*)"[^>]*>답변 신고<\/a>/.exec(html)?.[1].replace(/&amp;/g, "&");
    expect(href).toBe(mailtoHref(CONTACT_EMAIL!, CHAT_TEXT.reportSubject));
    expect(href).toBe(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("온맘 AI 답변 신고")}`);
    expect(href).not.toContain("body=");
    expect(decodeURIComponent(href!)).not.toContain(secret);
    // 앱 안내·인사말·사용자 말풍선에는 없다
    for (const message of [
      { id: 2, role: "assistant", origin: "rules", text: "앱 안내" },
      initialChatMessages()[0],
      { id: 3, role: "user", text: "질문" },
    ] as ChatBubbleMessage[]) {
      expect(bubble(message)).not.toContain("mailto:");
    }
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
