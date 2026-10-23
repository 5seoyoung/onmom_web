// 서버 쪽 AI 스위치(함수 비밀값 AI_CHAT_SERVER_ENABLED)가 꺼진 서버 — 웹 빌드의 스위치(NEXT_PUBLIC_AI_CHAT_ENABLED)가 켜져 있어도
// 화면 결과는 "AI 미설정"과 같아야 한다: 상담은 앱 규칙 안내(배너는 원문 "AI 서버에 연결되지 않아"), 약물은 표의 "정보 부족".
// 질문마다 함수를 다시 부르지 않는다(src/api/llm.ts serverAiOff). 함수 쪽 처리는 edgeHandlers.test.ts, 503 판별은 llm.test.ts가 본다.

import { afterEach, describe, expect, it, vi } from "vitest";
import content from "@/content";
import { chatBannerText, requestChatReply, type LlmCompleteFn } from "@/features/chat/chatModel";
import { checkSubstance, substanceDeps } from "@/features/substance/substanceModel";
import type { ChatMessage } from "@/rules/chat";
import { lookupSubstance, verdictLabel } from "@/rules/substance";
import { CHAT_AI_DISABLED_CODE } from "../../supabase/functions/_shared/chat";
import { llmComplete } from "./llm";
import { jsonResponse, stubFetch, supabaseTestConfig } from "./testUtils";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 서버 저장·AI 스위치가 켜진 웹 빌드 + 로그인 토큰 — 함수 주소는 시험마다 따로(꺼짐 기억이 섞이지 않게) */
function completeVia(name: string): LlmCompleteFn {
  const config = { ...supabaseTestConfig, functionsURL: `https://${name}.supabase.test/functions/v1` };
  return (req, opts) => llmComplete(req, { ...opts, config, getAccessToken: async () => "user.jwt" });
}

const aiDisabled = () => jsonResponse(503, { ok: false, code: CHAT_AI_DISABLED_CODE });
const ask = (...questions: string[]): ChatMessage[] => questions.map((text) => ({ role: "user" as const, text }));

describe("상담 — 503 ai_disabled면 AI 미설정과 같은 앱 안내", () => {
  it("답·이유·배너가 AI를 쓰지 않을 때와 같다 — 혼잡(busy) 배너가 아니라 원문 '연결되지 않아'", async () => {
    const fetch = stubFetch(async () => aiDisabled());
    for (const question of ["오로가 언제까지 나오나요?", "운동은 언제부터 해도 되나요?"]) {
      const history = ask(question);
      const disabled = await requestChatReply(history, { llmConfigured: true, complete: completeVia("chat-off"), context: null });
      const offline = await requestChatReply(history, { llmConfigured: false, complete: completeVia("unused"), context: null });
      expect(disabled).toEqual(offline);
      expect(disabled).toMatchObject({ fromFallback: true, crisis: false, origin: "rules", fallbackReason: "notConnected" });
    }
    // 첫 질문만 함수에 닿고, 두 번째부터는 요청하지 않는다 — 질문마다 503·배너를 되풀이하지 않는다
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chatBannerText("notConnected")).toBe(content.disclaimers.chat_banner);
  });
});

describe("약물·음식 체크 — 503 ai_disabled면 표만 본 결과(정보 부족)", () => {
  it("표에 없는 항목은 '정보 부족' 그대로, 표에 있는 항목은 함수를 부르지 않는다", async () => {
    const fetch = stubFetch(async () => aiDisabled());
    const deps = substanceDeps({ llmConfigured: true, complete: completeVia("substance-off"), context: { breastfeeding: true } });
    for (const query of ["처음보는약이름", "또다른미등재약"]) {
      const result = await checkSubstance(query, deps);
      expect(result).toEqual(lookupSubstance(query));
      expect(result).toMatchObject({ verdict: "unknown", source: "table" });
      expect(verdictLabel(result.verdict)).toBe("정보 부족");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const known = content.substances[0].aliases[0];
    expect((await checkSubstance(known, deps)).source).toBe("table");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
