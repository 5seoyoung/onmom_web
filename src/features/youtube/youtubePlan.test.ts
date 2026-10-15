// 운동 탭 "유튜브 추천 영상" 게이팅 — 큐레이션 목록과 같은 규칙(주차·분만 방식·산모수첩 차단·레드플래그 멈춤).
// 영상은 시험용 가짜 값(fixture)이다. 저장소의 빌드 목록은 비어 있어 화면에 아무것도 없다.
import { describe, expect, it } from "vitest";
import type { MaternityRecord } from "@/domain/types";
import { exerciseGate } from "@/features/exercise/exerciseModel";
import { YOUTUBE_ACTIVE, YOUTUBE_ALLOWLIST, YOUTUBE_VIDEOS } from "./catalog";
import { thumbnailUrl } from "./youtubeCore.mjs";
import type { CatalogVideo } from "./youtubeCore.mjs";
import { YOUTUBE_TEXT, safeThumbnailUrl, youtubeSection } from "./youtubePlan";

type Flag = Exclude<keyof MaternityRecord, "isPrimiparous">;

function maternity(...flags: Flag[]): MaternityRecord {
  const m: MaternityRecord = { isPrimiparous: true, gdm: false, anemia: false, heavyBleeding: false, preeclampsia: false, pelvicPain: false, diastasisRecti: false };
  for (const f of flags) m[f] = true;
  return m;
}

function video(id: string, stageKey: string, delivery: CatalogVideo["delivery"] = null): CatalogVideo {
  const videoId = `${id}`.padEnd(11, "0");
  return {
    videoId,
    channelId: "UCtestChannelAAAAAAAAAAA",
    title: `시험 영상 ${id}`,
    channelTitle: "시험 채널",
    publishedAt: "2026-09-01T00:00:00Z",
    stageKey,
    delivery,
    thumbnail: thumbnailUrl(videoId),
  };
}

const FIXTURE: CatalogVideo[] = [
  video("e", "full_core"),
  video("d", "functional_strengthening"),
  video("c", "pelvic_floor"),
  video("b", "early_core_activation"),
  video("a", "recovery_priority"),
  video("v", "recovery_priority", "vaginal"),
  video("s", "recovery_priority", "cesarean"),
];

const ids = (s: ReturnType<typeof youtubeSection>) => s?.cards.map((c) => c.videoId[0]) ?? null;

describe("이 빌드(저장소) — 허용 목록이 비어 유튜브 목록이 없다", () => {
  it("YOUTUBE_VIDEOS는 비고 YOUTUBE_ACTIVE는 false — 어느 사용자에게도 섹션이 없다", () => {
    expect(YOUTUBE_ALLOWLIST.channels).toEqual([]);
    expect(YOUTUBE_ALLOWLIST.videos).toEqual([]);
    expect(YOUTUBE_VIDEOS).toEqual([]);
    expect(YOUTUBE_ACTIVE).toBe(false);
    expect(youtubeSection(YOUTUBE_VIDEOS, "plan", "vaginal", 20, maternity())).toBeNull();
  });
});

describe("운동 탭 게이트 — 플랜일 때만", () => {
  it("레드플래그면(운동 추천 멈춤) 아무것도 없다", () => {
    const gate = exerciseGate("vaginal", "2026-07-01", true);
    expect(gate).toBe("redFlag");
    expect(youtubeSection(FIXTURE, gate, "vaginal", 20, maternity())).toBeNull();
  });

  it("분만 방식·출산일이 없으면 없다", () => {
    expect(youtubeSection(FIXTURE, "needsDelivery", null, 20, maternity())).toBeNull();
    expect(youtubeSection(FIXTURE, "needsDeliveryDate", "vaginal", null, maternity())).toBeNull();
  });
});

describe("주차 게이팅 — 큐레이션 목록의 '가능' 카드와 같은 단계만(이른 단계 포함, 잠긴 단계는 싣지 않는다)", () => {
  it("0주: 회복 우선기만 · 2주: 코어 깨우기까지 · 6주(자연분만): 골반저근·기능 강화까지 · 12주: 전부", () => {
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 0, maternity()))).toEqual(["a", "v"]);
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 2, maternity()))).toEqual(["a", "v", "b"]);
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 6, maternity()))).toEqual(["a", "v", "b", "c", "d"]);
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 12, maternity()))).toEqual(["a", "v", "b", "c", "d", "e"]);
  });

  it("기능 강화는 분만 방식에 따라 — 자연분만 6주, 제왕절개 8주", () => {
    expect(ids(youtubeSection(FIXTURE, "plan", "cesarean", 7, maternity()))).toEqual(["a", "s", "b", "c"]);
    expect(ids(youtubeSection(FIXTURE, "plan", "cesarean", 8, maternity()))).toEqual(["a", "s", "b", "c", "d"]);
  });

  it("분만 방식이 정해진 영상은 그 분만 방식에만", () => {
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 0, maternity()))).not.toContain("s");
    expect(ids(youtubeSection(FIXTURE, "plan", "cesarean", 0, maternity()))).toEqual(["a", "s"]);
  });
});

describe("산모수첩 차단 단계(blockedBuckets)는 주차가 돼도 싣지 않는다", () => {
  it("복직근 이개·임신중독증 → 코어 강화 없음, 골반통 → 기능 강화 없음", () => {
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 20, maternity("diastasisRecti")))).not.toContain("e");
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 20, maternity("preeclampsia")))).not.toContain("e");
    expect(ids(youtubeSection(FIXTURE, "plan", "vaginal", 20, maternity("pelvicPain")))).toEqual(["a", "v", "b", "c", "e"]);
  });

  it("보일 영상이 모두 막히면 섹션도 없다", () => {
    expect(youtubeSection([video("e", "full_core")], "plan", "vaginal", 20, maternity("diastasisRecti"))).toBeNull();
  });
});

describe("카드 모델", () => {
  const s = youtubeSection(FIXTURE, "plan", "vaginal", 12, maternity())!;

  it("제목·문구·개수, 단계 이름은 규칙 그대로, 링크는 safeExternalUrl을 거친 youtube.com", () => {
    expect(s.heading).toBe(YOUTUBE_TEXT.heading);
    expect(s.disclaimer).toBe(YOUTUBE_TEXT.disclaimer);
    expect(s.count).toBe(6);
    const c = s.cards.find((x) => x.videoId.startsWith("c"))!;
    expect(c).toEqual({
      videoId: "c0000000000",
      title: "시험 영상 c",
      channelTitle: "시험 채널",
      stageTitle: "골반저근",
      href: "https://www.youtube.com/watch?v=c0000000000",
      thumbnail: "https://i.ytimg.com/vi/c0000000000/mqdefault.jpg",
    });
  });

  it("미리보기는 https://i.ytimg.com만 — 아니면 이미지 없이", () => {
    expect(safeThumbnailUrl("https://i.ytimg.com/vi/x/mqdefault.jpg")).toBe("https://i.ytimg.com/vi/x/mqdefault.jpg");
    for (const bad of ["http://i.ytimg.com/vi/x.jpg", "https://i.ytimg.com.evil.example/x.jpg", "https://img.youtube.com/vi/x.jpg", "https://u@i.ytimg.com/x.jpg", "not a url"]) {
      expect(safeThumbnailUrl(bad), bad).toBeNull();
    }
    const odd = youtubeSection([{ ...video("a", "recovery_priority"), thumbnail: "https://evil.example/x.jpg" }], "plan", "vaginal", 0, maternity());
    expect(odd?.cards[0].thumbnail).toBeNull();
  });

  it("모르는 단계의 영상은 뺀다", () => {
    expect(youtubeSection([video("z", "stage_unknown")], "plan", "vaginal", 20, maternity())).toBeNull();
  });
});
