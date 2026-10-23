// 유튜브 추천 영상은 Supabase 빌드에서만 — 공개 사이트(Supabase 설정 없음)는 iOS 처리방침 원문을 보이는데, 거기에는 미리보기 이미지를 주는
// Google(YouTube)이 없다. 영상이 실린 빌드라도 Supabase가 없으면 운동 탭 목록·CSP의 i.ytimg.com·처리방침의 Google 줄이 모두 없어야 한다.
// 저장소의 빌드 목록은 비어 있어(youtubePlan.test.ts) 여기서는 시험용 허용 목록·생성 목록(fixture)을 끼워 두 빌드를 다시 읽는다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import allowlistJson from "@/content/youtube-allowlist.json";
import { youtubeActiveFor } from "./catalog";
import { thumbnailUrl } from "./youtubeCore.mjs";

const VIDEO_ID = "testVid0001";
/** 저장소의 허용 목록(키워드·제외 규칙 그대로) + 승인한 시험 영상 하나 */
const ALLOWLIST = { ...allowlistJson, videos: [{ videoId: VIDEO_ID, stageKey: "recovery_priority", note: "시험용 fixture" }] };
const GENERATED = {
  generatedAt: "2026-10-20T00:00:00Z",
  videos: [
    {
      videoId: VIDEO_ID,
      channelId: "UCtestChannelAAAAAAAAAAA",
      title: "산후 복식호흡",
      channelTitle: "시험 채널",
      publishedAt: "2026-09-01T00:00:00Z",
      stageKey: "recovery_priority",
      thumbnail: thumbnailUrl(VIDEO_ID),
    },
  ],
};

/** 빌드 하나를 다시 읽는다 — Supabase 설정 유무만 바꾸고, 영상은 둘 다 실려 있다 */
async function build(supabase: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabase ? "https://proj.supabase.test" : "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", supabase ? "sb_publishable_test" : "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.doMock("@/content/youtube-allowlist.json", () => ({ default: ALLOWLIST }));
  vi.doMock("@/content/youtube.generated.json", () => ({ default: GENERATED }));
  const config = await import("@/config");
  const catalog = await import("./catalog");
  const { CspMeta } = await import("@/components/CspMeta");
  const { activePolicy } = await import("@/features/privacy/policy");
  // CSP 메타는 운영 빌드에서만 그린다(csp.ts cspMetaContent)
  vi.stubEnv("NODE_ENV", "production");
  const meta = renderToStaticMarkup(h(CspMeta));
  vi.stubEnv("NODE_ENV", "test");
  const policy = activePolicy();
  return { configured: config.isSupabaseConfigured(), catalog, meta, policy, policyText: policy.sections.map((s) => s.body).join("\n") };
}

/** CSP 메타의 지시어 하나의 출처 목록(마크업의 &#x27; 등을 되돌린 뒤) */
function directiveOf(meta: string, name: string): string[] {
  const policy = (/content="([^"]*)"/.exec(meta)?.[1] ?? "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  return policy.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];
}

afterEach(() => {
  vi.doUnmock("@/content/youtube-allowlist.json");
  vi.doUnmock("@/content/youtube.generated.json");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("youtubeActiveFor — 실을 영상이 있고 웹 처리방침 초안(Google 줄)을 보이는 빌드일 때만", () => {
  it.each([
    [1, true, true],
    [3, true, true],
    [1, false, false],
    [0, true, false],
    [0, false, false],
  ])("영상 %i개 · 웹 초안 %s → %s", (count, webPolicy, active) => {
    expect(youtubeActiveFor(count, webPolicy)).toBe(active);
  });
});

describe("영상이 실린 빌드 — Supabase 설정이 있을 때만 켜진다", () => {
  it("Supabase 없는 빌드(지금 공개 사이트): iOS 처리방침 원문 · 운동 탭 목록 없음 · CSP에 i.ytimg.com 없음", async () => {
    const b = await build(false);
    expect(b.configured).toBe(false);
    expect(b.catalog.YOUTUBE_VIDEOS.map((v) => v.videoId)).toEqual([VIDEO_ID]); // 실려는 있다
    expect(b.catalog.YOUTUBE_ACTIVE).toBe(false);
    expect(b.catalog.YOUTUBE_SHOWN_VIDEOS).toEqual([]);
    expect(b.policy.kind).toBe("ios");
    expect(b.policyText).not.toMatch(/Google|YouTube/);
    expect(b.meta).toContain('http-equiv="Content-Security-Policy"');
    expect(directiveOf(b.meta, "img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(b.meta).not.toContain("ytimg");
    expect(b.meta).not.toMatch(/googleapis|google\.com|youtube\.com/);
  });

  it("Supabase 빌드: 웹 처리방침 초안의 Google 줄 · 운동 탭 목록 · CSP img-src에 i.ytimg.com", async () => {
    const b = await build(true);
    expect(b.configured).toBe(true);
    expect(b.catalog.YOUTUBE_ACTIVE).toBe(true);
    expect(b.catalog.YOUTUBE_SHOWN_VIDEOS.map((v) => v.videoId)).toEqual([VIDEO_ID]);
    expect(b.policy.kind).toBe("webDraft");
    expect(b.policyText).toContain("Google LLC");
    expect(directiveOf(b.meta, "img-src")).toEqual(["'self'", "data:", "blob:", "https://i.ytimg.com"]);
  });

  it("두 빌드 모두 — 켜짐 = 웹 처리방침 초안을 보이는 빌드(activePolicy가 webDraft) 그리고 영상 있음", async () => {
    for (const supabase of [false, true]) {
      const b = await build(supabase);
      expect(b.catalog.YOUTUBE_ACTIVE).toBe(b.policy.kind === "webDraft" && b.catalog.YOUTUBE_VIDEOS.length > 0);
    }
  });
});

describe("운동 탭 — 켜진 빌드의 목록만 그린다", () => {
  it("ExerciseScreen은 YOUTUBE_SHOWN_VIDEOS를 넘긴다(빌드 종류와 상관없는 YOUTUBE_VIDEOS를 쓰지 않는다)", () => {
    const src = readFileSync(fileURLToPath(new URL("../exercise/ExerciseScreen.tsx", import.meta.url)), "utf8");
    expect(src).toContain("youtubeSection(YOUTUBE_SHOWN_VIDEOS,");
    expect(src).not.toMatch(/\bYOUTUBE_VIDEOS\b/);
  });
});
