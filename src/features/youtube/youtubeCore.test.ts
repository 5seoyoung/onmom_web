// 유튜브 허용 목록·생성 목록 형식, 제외 키워드, 단계 키워드 판정, 허용 목록과 다시 맞추기(youtubeCore.mjs).
// 영상·채널 ID는 모두 시험용 가짜 값이다(실제 채널이 아니다).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import content from "@/content";
import allowlistJson from "@/content/youtube-allowlist.json";
import generatedJson from "@/content/youtube.generated.json";
import {
  EMPTY_CATALOG,
  YouTubeDataError,
  exclusionMatch,
  isAllowlistEmpty,
  normalizeForMatch,
  orderedStageKeys,
  parseAllowlist,
  parseCatalog,
  resolveCatalog,
  serializeCatalog,
  stageForVideo,
  thumbnailUrl,
  watchUrl,
} from "./youtubeCore.mjs";
import type { CatalogVideo, YouTubeAllowlist } from "./youtubeCore.mjs";

const STAGES = orderedStageKeys(content.stage_buckets);
const SHIPPED = parseAllowlist(allowlistJson, STAGES);

/** 시험용 가짜 ID — 채널 24자(UC + 22), 영상 11자 */
const CH_A = "UCtestChannelAAAAAAAAAAA";
const CH_B = "UCtestChannelBBBBBBBBBBB";
const vid = (n: number) => `testVid${String(n).padStart(4, "0")}`;

function allowlist(patch: Record<string, unknown> = {}): unknown {
  return { channels: [], videos: [], stageKeywords: {}, excludeKeywords: [], excludePatterns: [], ...patch };
}

function problemsOf(raw: unknown): string[] {
  try {
    parseAllowlist(raw, STAGES);
  } catch (e) {
    if (e instanceof YouTubeDataError) return e.problems;
    throw e;
  }
  return [];
}

function catalogVideo(n: number, patch: Partial<CatalogVideo> = {}): CatalogVideo {
  const videoId = vid(n);
  return {
    videoId,
    channelId: CH_A,
    title: `산후 복식호흡 ${n}`,
    channelTitle: "시험 채널",
    publishedAt: "2026-09-01T00:00:00Z",
    stageKey: "recovery_priority",
    delivery: null,
    thumbnail: thumbnailUrl(videoId),
    ...patch,
  };
}

describe("저장소의 허용 목록 — CPO·임상 자문 승인 전이라 비어 있다", () => {
  it("형식이 맞고 채널·영상이 없다(유튜브 목록을 그리지 않고 요청도 없다)", () => {
    expect(SHIPPED.channels).toEqual([]);
    expect(SHIPPED.videos).toEqual([]);
    expect(isAllowlistEmpty(SHIPPED)).toBe(true);
  });

  it("CPO가 정한 제외 키워드가 모두 있다(N일 만에·90% 같은 패턴 포함)", () => {
    for (const k of ["다이어트", "뱃살", "골반 교정", "골반 축소", "체형교정", "질압", "질조임", "명기", "성기능", "회춘", "완치", "영양제", "줄기세포"]) {
      expect(SHIPPED.excludeKeywords, k).toContain(k);
    }
    expect(exclusionMatch("7일 만에 끝내는 산후 운동", SHIPPED)).not.toBeNull();
    expect(exclusionMatch("회복률 90% 산후 운동", SHIPPED)).not.toBeNull();
  });

  it("단계 키워드는 content.json 다섯 단계에만 있고, 키워드 조사의 말이 모두 어느 단계에 들어 있다", () => {
    expect(Object.keys(SHIPPED.stageKeywords).sort()).toEqual([...STAGES].sort());
    const research = [
      ...["복식호흡", "흉식호흡", "횡격막", "횡경막", "호흡", "출산직후", "침대 운동"],
      ...["골반저근", "골반기저근", "골반바닥근", "케겔", "회음부 운동", "요실금 예방운동"],
      ...["골반 기울이기", "골반시계", "캣카우", "스트레칭", "흉추 회전", "고관절"],
      ...["걷기", "유산소", "산욕기"],
      ...["복직근이개", "복부 회복", "코어 회복", "데드버그", "브릿지", "네발기기"],
      ...["스쿼트", "근력", "클램", "니밴드", "산후후기운동"],
    ];
    const all = Object.values(SHIPPED.stageKeywords).flatMap((r) => r.include);
    for (const k of research) expect(all, k).toContain(k);
  });

  it("키워드 조사 → 단계(검토 전 초안): 호흡·걷기 0주, 가동성 2주, 골반저 6주, 근력·브릿지·유산소 기능 강화, 코어/복직근 12주", () => {
    const stage = (title: string) => stageForVideo(title, "", SHIPPED, STAGES);
    expect(stage("출산직후 침대 운동 - 복식호흡")).toBe("recovery_priority");
    expect(stage("산욕기 가벼운 걷기")).toBe("recovery_priority");
    expect(stage("누워서 하는 골반 기울이기")).toBe("early_core_activation");
    expect(stage("캣카우 스트레칭")).toBe("early_core_activation");
    expect(stage("산후 케겔 운동 따라하기")).toBe("pelvic_floor");
    expect(stage("요실금 예방 운동")).toBe("pelvic_floor"); // 띄어쓰기가 달라도
    expect(stage("힙 브릿지와 클램")).toBe("functional_strengthening");
    expect(stage("산후 유산소 20분")).toBe("functional_strengthening");
    expect(stage("복직근이개 데드버그")).toBe("full_core");
    expect(stage("산후 요가")).toBe("full_core");
  });
});

describe("허용 목록 형식 검사 — 틀리면 빌드가 멈춘다(문제를 모두 모아 알린다)", () => {
  it("채널: UC 24자 ID·이름·등급·승인 기록, autoShow는 생략하면 false, '$' 키는 설명이라 무시", () => {
    const a = parseAllowlist(
      allowlist({ $comment: "설명", channels: [{ $comment: "x", channelId: CH_A, title: "시험 채널", tier: "A", note: "시험" }] }),
      STAGES,
    );
    expect(a.channels).toEqual([{ channelId: CH_A, title: "시험 채널", tier: "A", autoShow: false, note: "시험" }]);
  });

  it("채널 오류: 가짜 자리표시자 ID·중복·모르는 등급·빈 승인 기록·autoShow 오타", () => {
    const p = problemsOf(
      allowlist({
        channels: [
          { channelId: "UC_EXAMPLE", title: "t", tier: "A", note: "n" },
          { channelId: CH_A, title: "t", tier: "A", note: "n" },
          { channelId: CH_A, title: "t", tier: "A", note: "n" },
          { channelId: CH_B, title: "t", tier: "S", note: "" },
          { channelId: "UCtestChannelCCCCCCCCCCC", title: "t", tier: "A", note: "n", autoshow: true },
          { channelId: "UCtestChannelDDDDDDDDDDD", title: "t", tier: "A", note: "n", autoShow: "yes" },
        ],
      }),
    );
    expect(p).toEqual([
      "channels[0].channelId: UC로 시작하는 24자 채널 ID가 아닙니다",
      "channels[2].channelId: 같은 채널이 두 번 있습니다",
      "channels[3].tier: A·B·C 중 하나가 아닙니다",
      "channels[3].note: 승인 기록(누가·언제·왜)이 비어 있습니다",
      "channels[4].autoshow: 모르는 항목",
      "channels[5].autoShow: true/false가 아닙니다",
    ]);
  });

  it("영상: 단계는 content.json stage_buckets의 key, 분만 방식은 vaginal·cesarean 또는 생략", () => {
    const ok = parseAllowlist(
      allowlist({
        videos: [
          { videoId: vid(1), stageKey: "pelvic_floor", note: "n" },
          { videoId: vid(2), stageKey: "functional_strengthening", delivery: "cesarean", note: "n" },
        ],
      }),
      STAGES,
    );
    expect(ok.videos.map((v) => [v.videoId, v.stageKey, v.delivery])).toEqual([
      [vid(1), "pelvic_floor", null],
      [vid(2), "functional_strengthening", "cesarean"],
    ]);
    const p = problemsOf(
      allowlist({
        videos: [
          { videoId: "short", stageKey: "pelvic_floor", note: "n" },
          { videoId: vid(3), stageKey: "stage_pelvic_floor", note: "n" },
          { videoId: vid(4), stageKey: "pelvic_floor", delivery: "natural", note: "n" },
          { videoId: vid(5), stageKey: "pelvic_floor", note: "n" },
          { videoId: vid(5), stageKey: "pelvic_floor", note: "n" },
        ],
      }),
    );
    expect(p).toHaveLength(4);
    expect(p[0]).toBe("videos[0].videoId: 11자 영상 ID가 아닙니다");
    expect(p[1]).toMatch(/^videos\[1\]\.stageKey: content\.json stage_buckets의 key/);
    expect(p[2]).toBe('videos[2].delivery: "vaginal"·"cesarean" 또는 생략');
    expect(p[3]).toBe("videos[4].videoId: 같은 영상이 두 번 있습니다");
  });

  it("단계 키워드: 모르는 단계·빈 키워드, 제외 패턴: 정규식이 아니면 멈춘다", () => {
    const p = problemsOf(
      allowlist({
        stageKeywords: { $comment: "무시", pelvic: { include: ["케겔"] }, pelvic_floor: { include: ["  "], exclude: [] } },
        excludeKeywords: ["다이어트", 3],
        excludePatterns: ["(unclosed"],
      }),
    );
    expect(p).toEqual([
      "stageKeywords.pelvic: content.json stage_buckets에 없는 단계입니다",
      "stageKeywords.pelvic_floor.include[0]: 빈 글자이거나 글자가 아닙니다",
      "excludeKeywords[1]: 빈 글자이거나 글자가 아닙니다",
      "excludePatterns[0]: 정규식이 아닙니다",
    ]);
  });

  it("최상위가 객체가 아니거나 목록이 빠지면 멈춘다", () => {
    expect(() => parseAllowlist([], STAGES)).toThrow(YouTubeDataError);
    expect(problemsOf({ channels: [], stageKeywords: {}, excludeKeywords: [] })).toEqual(["videos: 목록이 아닙니다"]);
  });
});

describe("제외 키워드·패턴 — 제목에 있으면 어떤 영상이든 뺀다", () => {
  it.each([
    ["산후 다이어트 홈트", "다이어트"],
    ["출산 후 골반교정 스트레칭", "골반 교정"], // 띄어쓰기 무시
    ["골반 축소 운동", "골반 축소"],
    ["질압 높이는 케겔", "질압"],
    ["회춘 요가", "회춘"],
    ["DIET 다이어트", "다이어트"],
  ])("%s → %s", (title, hit) => {
    expect(exclusionMatch(title, SHIPPED)).toBe(hit);
  });

  it.each(["3일 만에 뱃살 없애기", "2주만에 끝내는 산후 운동", "한 달 만에? 6개월 만에 회복", "회복률 90%", "99.9 % 효과", "９０％ 효과"])(
    "효과를 약속하는 패턴: %s",
    (title) => {
      expect(exclusionMatch(title, SHIPPED)).not.toBeNull();
    },
  );

  it("평범한 제목은 걸리지 않는다", () => {
    for (const t of ["산후 복식호흡 10분", "제왕절개 후 케겔 운동", "산후 6주 스쿼트", "출산 후 걷기 운동"]) expect(exclusionMatch(t, SHIPPED), t).toBeNull();
  });

  it("비교는 NFKC·소문자·공백 없이", () => {
    expect(normalizeForMatch(" Ｋｅｇｅｌ  케겔 \n")).toBe("kegel케겔");
  });
});

describe("단계 판정(자동 표시 채널) — 제목이 맞아야 후보, 여러 단계면 늦은 단계, 단계 제외어가 있으면 그 단계가 아니다", () => {
  const stage = (title: string, description = "") => stageForVideo(title, description, SHIPPED, STAGES);

  it("여러 단계 키워드 → 가장 늦은 단계(보수적)", () => {
    expect(stage("복식호흡과 케겔")).toBe("pelvic_floor");
    expect(stage("호흡하며 스쿼트")).toBe("functional_strengthening");
  });

  it("설명은 단계를 늦출 수만 있다 — 설명만 맞는 영상은 후보가 아니다", () => {
    expect(stage("산후 브이로그", "호흡에 집중하세요 #케겔")).toBeNull();
    expect(stage("산후 복식호흡", "마지막에 스쿼트도 해요")).toBe("functional_strengthening");
  });

  it("복부 운동(윗몸일으키기·크런치·레그레이즈·플랭크)은 기능 강화까지의 단계에 들지 않는다", () => {
    expect(stage("복식호흡 후 크런치")).toBeNull();
    expect(stage("케겔과 플랭크")).toBeNull();
    expect(stage("코어 회복 플랭크")).toBe("full_core");
    expect(stage("복식호흡", "중간에 레그레이즈")).toBeNull();
  });

  it("맞는 단계가 없으면 null", () => {
    expect(stage("아기 목욕시키기")).toBeNull();
  });
});

describe("생성 목록", () => {
  it("저장소에 커밋된 파일은 빈 목록이다(키 없는 빌드는 늘 같다) — serializeCatalog(EMPTY_CATALOG)와 글자까지 같다", () => {
    const committed = readFileSync(fileURLToPath(new URL("../../content/youtube.generated.json", import.meta.url)), "utf8");
    expect(committed).toBe(serializeCatalog(EMPTY_CATALOG));
    expect(parseCatalog(generatedJson, STAGES)).toEqual(EMPTY_CATALOG);
  });

  it("쓰고 읽으면 같다 — 분만 방식은 있을 때만 적는다", () => {
    const catalog = { generatedAt: "2026-10-15T18:30:00.000Z", videos: [catalogVideo(1), catalogVideo(2, { delivery: "vaginal" })] };
    const json = serializeCatalog(catalog);
    expect(json.match(/"delivery"/g)).toHaveLength(1);
    expect(parseCatalog(JSON.parse(json), STAGES)).toEqual(catalog);
  });

  it("미리보기 주소는 i.ytimg.com/vi/{영상 ID}/mqdefault.jpg 그대로만 — 다른 호스트·다른 영상이면 멈춘다", () => {
    const bad = (patch: Partial<CatalogVideo>) => () => parseCatalog({ generatedAt: null, videos: [catalogVideo(1, patch)] }, STAGES);
    expect(bad({ thumbnail: "https://evil.example/vi/x.jpg" })).toThrow(/thumbnail/);
    expect(bad({ thumbnail: thumbnailUrl(vid(2)) })).toThrow(/thumbnail/);
    expect(bad({ stageKey: "nope" })).toThrow(/stageKey/);
    expect(bad({ title: "" })).toThrow(/title/);
    expect(() => parseCatalog({ generatedAt: null, videos: [catalogVideo(1), catalogVideo(1)] }, STAGES)).toThrow(/두 번/);
    expect(() => parseCatalog({ generatedAt: null, videos: [{ ...catalogVideo(1), apiKey: "x" }] }, STAGES)).toThrow(/모르는 항목/);
  });

  it("주소 모양", () => {
    expect(thumbnailUrl("abcdefghijk")).toBe("https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg");
    expect(watchUrl("abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
});

describe("허용 목록과 다시 맞추기(resolveCatalog) — 빌드에 싣는 것은 이 결과뿐", () => {
  const list = (patch: Record<string, unknown>): YouTubeAllowlist => parseAllowlist(allowlist({ excludeKeywords: SHIPPED.excludeKeywords, ...patch }), STAGES);
  const catalog = {
    generatedAt: "2026-10-15T18:30:00.000Z",
    videos: [
      catalogVideo(1, { stageKey: "recovery_priority" }),
      catalogVideo(2, { channelId: CH_B }),
      catalogVideo(3, { channelId: CH_B, title: "산후 다이어트 호흡" }),
      catalogVideo(4, { channelId: CH_A }),
    ],
  };

  it("허용 목록이 비면 생성 파일에 무엇이 남아 있어도 아무것도 싣지 않는다", () => {
    expect(resolveCatalog(catalog, SHIPPED)).toEqual([]);
  });

  it("승인 영상은 허용 목록의 단계·분만 방식으로(생성 목록 값을 믿지 않는다)", () => {
    const out = resolveCatalog(catalog, list({ videos: [{ videoId: vid(1), stageKey: "pelvic_floor", delivery: "cesarean", note: "n" }] }));
    expect(out).toEqual([{ ...catalog.videos[0], stageKey: "pelvic_floor", delivery: "cesarean" }]);
  });

  it("autoShow 채널의 영상만 키워드 판정 그대로, autoShow가 꺼진 채널의 영상은 빠진다(검토 대기)", () => {
    const channels = [
      { channelId: CH_A, title: "A", tier: "A", note: "n" },
      { channelId: CH_B, title: "B", tier: "B", autoShow: true, note: "n" },
    ];
    expect(resolveCatalog(catalog, list({ channels })).map((v) => v.videoId)).toEqual([vid(2)]);
  });

  it("승인 영상이어도 제목이 제외 키워드에 맞으면 뺀다(승인 뒤 제목이 바뀐 경우)", () => {
    expect(resolveCatalog(catalog, list({ videos: [{ videoId: vid(3), stageKey: "recovery_priority", note: "n" }] }))).toEqual([]);
  });
});
