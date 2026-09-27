import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { defaultProfile } from "@/store/defaults";
import { AI_TRANSFER_NOTICE, REQUIRED_CONSENTS, SERVER_CONSENT_TEXT, type ConsentItemText } from "./consentText";
import { initialDraft, ONBOARDING_TEXT, type OnboardingDraft, type OnboardingMode } from "./onboardingModel";
import { ConsentStep } from "./OnboardingSteps";
import { ConsentDetails, DETAIL_EMPHASIS_CLASS, DETAIL_TEXT_CLASS, ServerConsentStep, type ServerConsentStepProps } from "./ServerConsentStep";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function serverStep(
  mode: OnboardingMode = "full",
  over: Partial<OnboardingDraft> = {},
  props: Partial<Pick<ServerConsentStepProps, "declineBusy" | "declineError">> = {},
): string {
  const draft = { ...initialDraft(defaultProfile()), ...over };
  return renderToStaticMarkup(
    h(ServerConsentStep, { draft, onChange: () => {}, headingRef: null, onOpenPolicy: () => {}, mode, onDecline: () => {}, ...props }),
  );
}

/** 모든 동의 문구(요약·전문) */
const ALL_SERVER_TEXT = [
  SERVER_CONSENT_TEXT.subtitle,
  ...SERVER_CONSENT_TEXT.lines,
  SERVER_CONSENT_TEXT.reconsentNote,
  ...[...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE].flatMap((c) => [c.title, c.summary, ...c.details.flatMap((d) => [d.term, d.text])]),
].join(" ");

describe("서버 저장 빌드 동의 문구 — 법정 고지 항목", () => {
  it("필수 셋: 개인정보 수집·이용 / 민감정보(건강정보) / 만 14세 이상 — 민감정보는 따로", () => {
    expect(REQUIRED_CONSENTS.map((c) => c.id)).toEqual(["personal", "sensitive", "age14"]);
    expect(REQUIRED_CONSENTS[0].title).toContain("개인정보 수집·이용");
    expect(REQUIRED_CONSENTS[1].title).toContain("민감정보");
    expect(REQUIRED_CONSENTS[2].title).toContain("만 14세 이상");
  });

  it("(a)(b) 전문 — 항목·목적·보유 기간·거부 권리와 불이익(법 §15②)", () => {
    for (const c of REQUIRED_CONSENTS.slice(0, 2)) {
      const terms = c.details.map((d) => d.term);
      expect(terms.some((t) => t.includes("항목")), c.title).toBe(true);
      expect(terms).toContain("이용 목적");
      expect(terms).toContain("보유 기간");
      expect(terms).toContain("동의 거부 권리");
      const refusal = c.details.find((d) => d.term === "동의 거부 권리")!.text;
      expect(refusal).toContain("동의하지 않을 수 있어요");
      expect(refusal).toContain("이용할 수 없어요"); // 불이익
    }
  });

  it("보유 기간 = 계정 삭제 시 즉시 삭제 · 저장 위치 = 서울", () => {
    for (const c of REQUIRED_CONSENTS.slice(0, 2)) {
      expect(c.details.find((d) => d.term === "보유 기간")!.text).toMatch(/계정을 삭제하면 .*바로 삭제/);
    }
    expect(ALL_SERVER_TEXT).toContain("대한민국 서울");
  });

  it("(a) 모은 항목마다 보유 기간이 있다 — 접속 기록은 업체가 정한 기간, AI 상담 이용 시각은 2일(계정 삭제로 바로 지워지지 않는 것)", () => {
    const personal = REQUIRED_CONSENTS[0].details;
    const row = (term: string) => personal.find((d) => d.term === term)!.text;
    expect(row("수집 항목")).toContain("접속 기록");
    expect(row("수집 항목")).toContain("AI 상담 이용 시각");
    expect(row("접속 기록 보유 기간")).toBe("접속 기록은 각 서비스 제공 업체가 정한 기간 동안 보관된 뒤 삭제돼요.");
    expect(row("AI 상담 이용 시각 보유 기간")).toContain("2일이 지나면 자동으로 삭제");
  });

  it("(a) 이용 목적이 모은 항목의 쓰임을 모두 덮는다 — 내 동네(산부인과 찾기)·복직 예정일(남은 기간)·AI 이용 시각(한도)", () => {
    const purpose = REQUIRED_CONSENTS[0].details.find((d) => d.term === "이용 목적")!.text;
    for (const word of ["가까운 산부인과 찾기(내 동네)", "복직까지 남은 기간 표시", "AI 상담 이용 한도 계산"]) expect(purpose).toContain(word);
  });

  it("민감정보 항목에 건강 정보가 모두 — 출산일·분만 방식·수유·키/체중·산모수첩 7항목·증상 기록·기분 답·기록장", () => {
    const items = REQUIRED_CONSENTS[1].details.find((d) => d.term === "처리 항목")!.text;
    for (const word of ["출산일", "분만 방식", "수유", "키", "체중", "산모수첩 확인 항목 7개", "증상 기록", "기분", "기록장"]) {
      expect(items, word).toContain(word);
    }
  });

  it("(d) AI 국외 이전은 안내 — Anthropic·미국·보내는 항목·거부 방법, 처음 쓸 때 따로 묻는다", () => {
    const text = [AI_TRANSFER_NOTICE.summary, ...AI_TRANSFER_NOTICE.details.map((d) => d.text)].join(" ");
    expect(text).toContain("Anthropic");
    expect(text).toContain("미국");
    for (const word of ["질문 내용", "산후 주차", "분만 방식", "수유 여부"]) expect(text).toContain(word);
    expect(AI_TRANSFER_NOTICE.summary).toContain("처음 쓸 때 따로 동의");
    expect(AI_TRANSFER_NOTICE.details.map((d) => d.term)).toEqual(
      expect.arrayContaining(["이전받는 자", "이전 항목", "이전 시기·방법", "이용 목적", "보유 기간", "거부 방법"]),
    );
  });

  it("서버 저장 빌드에서 사실이 아닌 iOS 문구를 쓰지 않는다", () => {
    expect(ALL_SERVER_TEXT).not.toContain("기기 밖으로 내보내지 않는");
    expect(ALL_SERVER_TEXT).not.toContain("내 기기에만");
    expect(ALL_SERVER_TEXT).not.toContain("서버 계정 없음");
    expect(SERVER_CONSENT_TEXT.subtitle).toContain("서버");
    // iOS 원문 동의 안내(설정 없는 빌드)에는 그대로 남아 있다
    expect(ONBOARDING_TEXT.consentSubtitle).toContain("기기 밖으로 내보내지 않는");
  });

  it("진단·점수 같은 의료기기 표현이 없다", () => {
    expect(ALL_SERVER_TEXT).not.toMatch(/진단합|점수|등급|위험도/);
  });
});

describe("ServerConsentStep — 화면", () => {
  const markup = serverStep();

  it("필수 셋은 각각 스위치(처음엔 모두 꺼짐), 이름에 [필수]가 붙는다", () => {
    const switches = markup.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
    expect(switches).toHaveLength(3);
    for (const s of switches) expect(s).toContain('aria-checked="false"');
    for (const c of REQUIRED_CONSENTS) {
      expect(markup).toMatch(new RegExp(`<label[^>]*>(?:(?!</label>).)*${SERVER_CONSENT_TEXT.requiredBadge}(?:(?!</label>).)*${esc(c.title)}`));
    }
  });

  it("켠 동의는 스위치가 켜져 보인다", () => {
    const on = serverStep("full", { requiredConsents: { personal: true, sensitive: false, age14: true } });
    const states = [...on.matchAll(/role="switch" aria-checked="(true|false)"/g)].map((m) => m[1]);
    expect(states).toEqual(["true", "false", "true"]);
  });

  it("모든 동의에 요약과 '자세히'(펼치는 전문) — AI 국외 이전 안내는 스위치 없이 [안내](고를 것이 없어 [선택]이 아니다)", () => {
    const text = textOf(markup);
    for (const c of [...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE]) {
      expect(text).toContain(c.summary);
      for (const d of c.details) expect(text).toContain(d.text);
    }
    expect(markup.match(/<details\b/g)).toHaveLength(4);
    expect(markup.match(/<summary\b/g)).toHaveLength(4);
    // 전문은 접힌 채 시작한다
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
    // AI 안내 머리: [안내] + 제목, 스위치는 필수 셋뿐
    expect(SERVER_CONSENT_TEXT.noticeBadge).toBe("안내");
    expect(markup).toMatch(new RegExp(`<h2[^>]*>(?:(?!</h2>).)*${SERVER_CONSENT_TEXT.noticeBadge}(?:(?!</h2>).)*${esc(AI_TRANSFER_NOTICE.title)}`));
    expect(textOf(markup)).not.toContain("선택");
  });

  it("[동의하지 않고 나가기] — 처음 온보딩·다시 동의 모두 있다(확인 창을 여는 보조 버튼, 누르는 영역 44)", () => {
    expect(SERVER_CONSENT_TEXT.decline).toBe("동의하지 않고 나가기");
    for (const mode of ["full", "reconsent"] as const) {
      const buttons = [...serverStep(mode).matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].filter(([, , label]) => label === SERVER_CONSENT_TEXT.decline);
      expect(buttons, mode).toHaveLength(1);
      const attrs = buttons[0][1];
      expect(attrs).toContain('aria-haspopup="dialog"');
      expect(attrs).toContain("min-h-11");
      expect(attrs).not.toMatch(/\sdisabled=""/);
    }
  });

  it("[동의하지 않고 나가기] — 지우는 중에는 잠기고, 실패하면 이유를 알린다", () => {
    const busy = serverStep("reconsent", {}, { declineBusy: true });
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*>계정을 삭제하고 있어요<\/button>/);
    expect(busy).not.toContain(SERVER_CONSENT_TEXT.decline);
    const failed = serverStep("reconsent", {}, { declineError: "계정을 삭제하지 못했어요." });
    expect(failed).toMatch(/<p role="alert"[^>]*>계정을 삭제하지 못했어요\.<\/p>/);
    expect(serverStep()).not.toContain('role="alert"');
  });

  it("중요한 내용(민감정보 항목·보유 기간·받는 자와 목적·이전 항목)은 크게(16px, 다른 전문 13px의 123%)·굵게·밑줄", () => {
    const flagged = (c: ConsentItemText) => c.details.filter((d) => d.emphasis === true).map((d) => d.term);
    expect(flagged(REQUIRED_CONSENTS[0])).toEqual(["보유 기간", "접속 기록 보유 기간", "AI 상담 이용 시각 보유 기간"]);
    expect(flagged(REQUIRED_CONSENTS[1])).toEqual(["처리 항목", "보유 기간"]);
    expect(flagged(REQUIRED_CONSENTS[2])).toEqual([]);
    expect(flagged(AI_TRANSFER_NOTICE)).toEqual(["이전받는 자", "이전 항목", "이용 목적", "보유 기간"]);
    // 보유 기간이 들어간 줄은 모두 강조
    for (const c of [...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE]) {
      for (const d of c.details) if (d.term.includes("보유 기간")) expect(d.emphasis, `${c.title} ${d.term}`).toBe(true);
    }
    for (const cls of ["text-base", "font-semibold", "text-text-primary", "underline"]) expect(DETAIL_EMPHASIS_CLASS.split(" ")).toContain(cls);

    for (const item of [...REQUIRED_CONSENTS, AI_TRANSFER_NOTICE]) {
      const html = renderToStaticMarkup(h(ConsentDetails, { item }));
      // 전문 목록은 13px(0.8125rem) — 강조 줄 16px(text-base)는 23% 크다
      expect(html).toMatch(/<dl class="[^"]*text-\[0\.8125rem\]/);
      for (const d of item.details) {
        const cls = d.emphasis === true ? DETAIL_EMPHASIS_CLASS : DETAIL_TEXT_CLASS;
        expect(html, `${item.title} ${d.term}`).toContain(`<dd class="${cls}">${d.text.replace(/&/g, "&amp;")}</dd>`);
      }
    }
  });

  it("머리는 iOS 제목 + 서버 저장 부제, 안내 3줄, 처리방침 링크, 면책", () => {
    const text = textOf(markup);
    expect(markup).toMatch(new RegExp(`<h1[^>]*>${ONBOARDING_TEXT.consentTitle}</h1>`));
    expect(text).toContain(SERVER_CONSENT_TEXT.subtitle);
    for (const line of SERVER_CONSENT_TEXT.lines) expect(text).toContain(line);
    expect(markup).toMatch(new RegExp(`aria-haspopup="dialog"[^>]*>${ONBOARDING_TEXT.consentPolicyLink}</button>`));
    expect(text).toContain(content.disclaimers.onboarding_consent);
  });

  it("다시 동의일 때만 안내 한 줄", () => {
    expect(textOf(markup)).not.toContain(SERVER_CONSENT_TEXT.reconsentNote);
    expect(textOf(serverStep("reconsent"))).toContain(SERVER_CONSENT_TEXT.reconsentNote);
  });

  it("장식 아이콘은 스크린리더에서 숨긴다", () => {
    for (const svg of markup.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
  });
});

describe("ConsentStep — 설정 없는 빌드는 iOS 원문 그대로", () => {
  it("토글 하나와 iOS 안내 3줄 — [동의하지 않고 나가기]는 없다(지금 배포와 같음)", () => {
    const markup = renderToStaticMarkup(
      h(ConsentStep, { draft: initialDraft(defaultProfile()), onChange: () => {}, headingRef: null, onOpenPolicy: () => {} }),
    );
    expect(markup.match(/role="switch"/g)).toHaveLength(1);
    const text = textOf(markup);
    for (const line of ONBOARDING_TEXT.consentLines) expect(text).toContain(line);
    expect(text).toContain(ONBOARDING_TEXT.consentToggle);
    expect(markup).not.toContain("<details");
    expect(text).not.toContain(SERVER_CONSENT_TEXT.decline);
  });
});

/**
 * 동의 문구의 지문 — 판(CURRENT_CONSENT_VERSION)마다 하나. (a)~(c)와 머리의 부제·안내 3줄(이용자가 동의하는 내용)을 바꾸면 지문이 바뀌어
 * 여기서 실패한다. 그때는 CURRENT_CONSENT_VERSION을 새 날짜로 올리고(모든 이용자에게 다시 받는다) 아래에 **새 줄을 더한다**.
 * 이미 있는 줄의 지문을 고쳐 판을 올리지 않고 넘어가지 않는다 — 예전 판에 동의한 사람이 바뀐 문구에 동의한 것으로 남는다.
 * 뱃지·버튼·"자세히" 같은 화면 글자(SERVER_CONSENT_TEXT의 나머지)와 (d) AI 안내(동의는 AI 기능이 처음 쓸 때 따로 — 판 AI_CONSENT_VERSION)는 넣지 않는다.
 * 서버 저장 빌드를 켜기 전(2026-09-28, 아직 이 판에 동의한 이용자가 없음)에 확정한 지문이다.
 */
const CONSENT_TEXT_FINGERPRINTS: Readonly<Record<string, string>> = {
  "web-2026-09-28": "ceef90399e94d16b2e87e428cf6e6b49c32ef72b6e05541e7ee21427bd46f369",
};

describe("동의 판 — 문구를 바꾸면 판을 올린다", () => {
  it("지금 문구의 지문 = 지금 판의 지문", () => {
    const consented = JSON.stringify([SERVER_CONSENT_TEXT.subtitle, SERVER_CONSENT_TEXT.lines, REQUIRED_CONSENTS]);
    const fingerprint = createHash("sha256").update(consented).digest("hex");
    expect({ version: CURRENT_CONSENT_VERSION, fingerprint }).toEqual({
      version: CURRENT_CONSENT_VERSION,
      fingerprint: CONSENT_TEXT_FINGERPRINTS[CURRENT_CONSENT_VERSION],
    });
  });

  it("판마다 지문이 다르다(판을 올리지 않고 지문만 바꿔 적지 않았다)", () => {
    const prints = Object.values(CONSENT_TEXT_FINGERPRINTS);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 대조하고, CI에서는 건너뛴다.
const ONBOARDING_SWIFT = fileURLToPath(new URL("../../../web/reference/swift/OnboardingFlowView.swift", import.meta.url));

describe("원문 대조", () => {
  it.skipIf(!existsSync(ONBOARDING_SWIFT))("서버 저장 빌드에서도 그대로 쓰는 iOS 문구", () => {
    const src = readFileSync(ONBOARDING_SWIFT, "utf8");
    for (const text of [ONBOARDING_TEXT.consentTitle, SERVER_CONSENT_TEXT.lines[2], ONBOARDING_TEXT.consentPolicyLink]) {
      expect(src, text).toContain(`"${text}"`);
    }
  });
});
