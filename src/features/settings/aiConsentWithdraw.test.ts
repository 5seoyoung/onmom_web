// 설정 > 내 데이터의 AI 답변 동의 철회 행 — 동의가 남아 있을 때만 보이고, 철회 뒤에는 AI를 부르지 않는다.
// 서버 행 지우기·순서는 features/chat/aiConsentRecord.test.ts, 함수가 행 없음을 막는 것은 src/api/edgeHandlers.test.ts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aiMode, clearAiConsent, readAiConsent, saveAiConsent } from "@/features/chat/aiConsent";
import { AiConsentWithdraw, AiConsentWithdrawView, type AiWithdrawState } from "./AiConsentWithdraw";
import { DATA_RIGHTS_TEXT } from "./settingsView";

const view = (present: boolean, state: AiWithdrawState) => renderToStaticMarkup(h(AiConsentWithdrawView, { present, state, onWithdraw: () => {} }));

describe("AiConsentWithdrawView", () => {
  it("동의가 없으면 아무것도 그리지 않는다", () => {
    expect(view(false, "idle")).toBe("");
    expect(view(false, "failed")).toBe("");
  });

  it("동의가 있으면 철회 버튼과 설명", () => {
    const html = view(true, "idle");
    expect(html).toContain(DATA_RIGHTS_TEXT.aiWithdraw);
    expect(html).toContain(DATA_RIGHTS_TEXT.aiWithdrawHint);
    expect(html).toContain("<button");
    expect(html).not.toMatch(/\sdisabled=""/);
  });

  it("철회 중에는 잠기고 진행을 읽어 준다", () => {
    const html = view(true, "busy");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain(DATA_RIGHTS_TEXT.aiWithdrawing);
  });

  it("끝나면 버튼 없이 끝났다고 알린다(동의가 사라져도 문장은 남는다)", () => {
    const html = view(false, "done");
    expect(html).not.toContain("<button");
    expect(html).toContain(DATA_RIGHTS_TEXT.aiWithdrawDone);
  });

  it("실패하면 버튼이 남아 다시 시도할 수 있고, alert로 문장을 알린다", () => {
    const html = view(true, "failed");
    expect(html).toContain("<button");
    expect(html).toMatch(new RegExp(`role="alert"[^>]*><p[^>]*>${DATA_RIGHTS_TEXT.aiWithdrawFailed}</p>`));
  });

  it("정적 HTML·첫 렌더에서는 그리지 않는다(동의 여부를 브라우저에서 읽기 전)", () => {
    expect(renderToStaticMarkup(h(AiConsentWithdraw, { accountId: "kakao-1" }))).toBe("");
    expect(renderToStaticMarkup(h(AiConsentWithdraw, { accountId: null }))).toBe("");
  });
});

describe("철회 뒤에는 다시 동의하기 전까지 AI를 부르지 않는다", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  };

  it("브라우저 기록이 지워지면 화면의 방식은 on에서 ask로 — 질문을 보내면 동의 카드가 먼저 뜬다", () => {
    const storage = memory();
    saveAiConsent("kakao-1", new Date(), storage);
    const mode = () => aiMode({ aiAvailable: true, loginRequired: false, consented: readAiConsent("kakao-1", storage), declined: false });
    expect(mode()).toBe("on");
    clearAiConsent("kakao-1", storage);
    expect(mode()).toBe("ask");
  });

  it("서버에서 지우지 못하면 브라우저 기록도 지우지 않는다 — 철회된 것처럼 보이지 않게(useAiConsentStatus withdraw)", () => {
    const src = readFileSync(fileURLToPath(new URL("../chat/aiConsent.ts", import.meta.url)), "utf8");
    const withdraw = src.slice(src.indexOf("const withdraw = useCallback"), src.indexOf("return { present:"));
    const server = withdraw.indexOf('(await withdrawAiConsent(accountId)) !== "withdrawn"');
    expect(server).toBeGreaterThan(0);
    expect(withdraw.slice(server)).toContain("return false;");
    expect(withdraw.indexOf("clearAiConsent(accountId);")).toBeGreaterThan(server);
  });

  it("설정의 내 데이터 카드는 카카오 계정에서만 찾는다 — 게스트에게 서버를 묻지 않는다", () => {
    const src = readFileSync(fileURLToPath(new URL("./DataRightsCard.tsx", import.meta.url)), "utf8");
    expect(src).toContain('<AiConsentWithdraw accountId={snapshot.account?.provider === "kakao" ? snapshot.account.id : null} />');
  });
});
