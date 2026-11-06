// 웹 처리방침 초안 — 유튜브 추천 영상이 있는 빌드에서만 Google LLC(YouTube 미리보기 이미지)를 적는다(쓰지 않는 업체를 적지 않는다).
import { describe, expect, it } from "vitest";
import { YOUTUBE_ACTIVE } from "@/features/youtube/catalog";
import { ACCESS_LOG_ITEMS } from "./dataItems";
import { activeWebPolicyOptions } from "./policy";
import { DEFAULT_WEB_POLICY_OPTIONS, webPolicySections } from "./webPolicyText";

const text = (o: Parameters<typeof webPolicySections>[0]) => webPolicySections(o).map((s) => `${s.title}\n${s.body}`).join("\n");
const part = (o: Parameters<typeof webPolicySections>[0], prefix: string) => webPolicySections(o).find((s) => s.title.includes(prefix))!.body;

const OFF = { turnstile: false, reminders: false };
const ON = { turnstile: false, reminders: false, youtube: true };

describe("웹 처리방침 초안 — 유튜브 추천 영상", () => {
  it("이 빌드(허용 목록 비어 있음)와 기본값은 유튜브를 적지 않는다", () => {
    expect(YOUTUBE_ACTIVE).toBe(false);
    expect(activeWebPolicyOptions().youtube).toBe(false);
    expect(DEFAULT_WEB_POLICY_OPTIONS.youtube).toBe(false);
    for (const o of [OFF, DEFAULT_WEB_POLICY_OPTIONS]) {
      expect(text(o)).not.toContain("YouTube");
      expect(text(o)).not.toContain("유튜브");
      // Google LLC는 문의 메일(Gmail)로만 나온다 — 유튜브 블록의 머리는 없다
      expect(text(o)).not.toMatch(/^[①-⑧] Google LLC \(미국\)$/m);
    }
  });

  it("7절 처리 위탁 — Google LLC(미리보기 이미지 제공)", () => {
    expect(part(ON, "처리 위탁")).toContain("• Google LLC: 운동 탭 유튜브 추천 영상의 미리보기 이미지 제공(YouTube)");
  });

  it("6절 국외 이전 — Google LLC(미국): 접속 기록만, 법 §28의8② 항목 모두, 영상은 YouTube 새 탭", () => {
    const block = part(ON, "국외 이전")
      .split("\n\n")
      .find((b) => b.includes("유튜브 추천 영상의 미리보기"))!;
    expect(block.startsWith("⑥ Google LLC (미국)\n")).toBe(true);
    expect(block).toContain(`– 이전 항목: ${ACCESS_LOG_ITEMS}`);
    for (const word of ["이전 항목", "이전 시기·방법", "목적", "보유 기간", "거부 방법과 효과"]) expect(block, word).toContain(word);
    expect(block).toContain("YouTube(Google)의 개인정보처리방침이 적용됩니다");
  });

  it("11절 자동 수집 장치 — 미리보기를 YouTube(Google) 서버에서 불러온다", () => {
    expect(part(ON, "자동 수집 장치")).toContain("• 운동 탭의 유튜브 추천 영상은 미리보기 이미지를 YouTube(Google) 서버에서 불러오므로, 이때 Google의 정책이 함께 적용됩니다.");
  });

  it("다른 선택 블록과 함께면 맨 뒤 번호 — 셋 다 켜면 ⑧(앞 번호는 그대로)", () => {
    const heads = part({ turnstile: true, reminders: true, youtube: true }, "국외 이전")
      .split("\n")
      .filter((l) => /^[①-⑧] /.test(l));
    expect(heads.map((l) => l.slice(0, 1))).toEqual(["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"]);
    expect(heads[4]).toBe("⑤ Google LLC (미국) - 문의 메일(Gmail)");
    expect(heads[5]).toMatch(/^⑥ 브라우저 푸시 서비스/);
    expect(heads[6]).toBe("⑦ Cloudflare, Inc. (미국)");
    expect(heads[7]).toBe("⑧ Google LLC (미국)");
  });
});
