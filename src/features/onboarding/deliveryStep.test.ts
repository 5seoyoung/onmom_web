// 온보딩 1단계(출산 정보)의 입력 상태 표시 — 서버 렌더 마크업(원문 안내 문구 · 강조 · max=오늘 · aria-invalid).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/store/defaults";
import { initialDraft, ONBOARDING_TEXT, type OnboardingDraft } from "./onboardingModel";
import { DeliveryStep } from "./OnboardingSteps";

const TODAY = "2026-09-27";

function render(over: Partial<OnboardingDraft> = {}, today = TODAY): string {
  const draft = { ...initialDraft(defaultProfile()), ...over };
  return renderToStaticMarkup(h(DeliveryStep, { draft, onChange: () => {}, headingRef: null, today }));
}

const dateInput = (html: string) => html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";

describe("출산일 입력 — 검증 상태(OnboardingFlowView.swift:145-160)", () => {
  it("아직 안 고름: 원문 안내를 강조색으로, 오류 표시는 없다(비어 있는 것은 오류가 아니다)", () => {
    const html = render();
    expect(html).toContain(`class="text-[0.8125rem] text-primary-text">${ONBOARDING_TEXT.deliveryDateNotPicked}</p>`);
    const input = dateInput(html);
    expect(input).toContain('required=""');
    expect(input).toContain(`max="${TODAY}"`);
    expect(input).not.toContain("aria-invalid");
  });

  it("오늘 이하를 골랐다: 안내가 '회복 주차 계산에 사용돼요'로, 오류 표시 없음", () => {
    const html = render({ deliveryDate: "2026-07-26" });
    expect(html).toContain(`class="text-[0.8125rem] text-text-secondary">${ONBOARDING_TEXT.deliveryDatePicked}</p>`);
    expect(dateInput(html)).not.toContain("aria-invalid");
  });

  it("직접 입력한 미래 날짜: 안내는 원문 그대로(강조) + aria-invalid — 새 문구 없이 보조기기에만 알린다", () => {
    const html = render({ deliveryDate: "2026-09-28" });
    expect(html).toContain(ONBOARDING_TEXT.deliveryDateNotPicked);
    expect(dateInput(html)).toContain('aria-invalid="true"');
  });

  it("오늘을 아직 모르면(서버 렌더): max 없음, 오류 표시 없음", () => {
    const input = dateInput(render({ deliveryDate: "2026-09-28" }, ""));
    expect(input).not.toContain("max=");
    expect(input).not.toContain("aria-invalid");
  });

  it("분만 방식 두 개(자연분만·제왕절개) 라디오 + 모유수유 스위치 기본 켬", () => {
    const html = render();
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("자연분만");
    expect(html).toContain("제왕절개");
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
  });
});
