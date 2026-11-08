// 브라우저 자동 시험 — 빌드 때 받아 둔 운동 영상 목록(src/content/videos.generated.json, scripts/videos-fetch.mjs).
// 목록이 실린 빌드: 운동 탭이 영상 목록을 묻는 요청(…/videos) 없이 목록을 그린다(분만 방식이 기기 밖으로 나가지 않는다).
// 빈 목록 빌드(저장소 기본 — 내 컴퓨터·VIDEO_API_URL 없음·서버 실패): 브라우저 전용 빌드라 지금처럼 "영상 준비 중".
// 어느 쪽인지는 시험을 돌릴 때의 생성 파일로 안다 — `npm run e2e`·CI는 방금 그 파일로 빌드했다(옛 out/에 e2e:run을 돌리면 어긋날 수 있다).
// 게스트 온보딩이 필요해 브라우저 전용 빌드에서만 돈다(서버 모드 빌드에서는 게스트 시작이 운영 서버에 익명 계정을 만든다 — guest-flow.spec.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { finishOnboardingAsGuest, isBrowserOnlyBuild } from "./helpers";

const SNAPSHOT = JSON.parse(readFileSync(resolve(process.cwd(), "src/content/videos.generated.json"), "utf8")) as { fetchedAt: string | null };

test("운동 탭 영상 — 받아 둔 목록이 있으면 요청 없이 목록, 없으면 지금처럼(영상 준비 중)", async ({ page }) => {
  test.skip(!(await isBrowserOnlyBuild(page)), "서버 모드 빌드 — 게스트 시작이 운영 서버에 익명 계정을 만든다");
  const videoRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.endsWith("/videos")) videoRequests.push(r.url());
  });

  await finishOnboardingAsGuest(page); // 40일 전 자연분만 — 플랜이 보이는 주차
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "운동", exact: true }).click();
  await expect(page).toHaveURL(/\/exercise\/$/);
  await expect(page.getByRole("heading", { name: "오늘의 운동" })).toBeVisible();

  if (SNAPSHOT.fetchedAt !== null) {
    // 영상 카드(또는 이 단계에 영상이 없다는 한 줄) — 불러오는 중·영상 준비 중 없이
    await expect(page.getByRole("article").first().or(page.getByText("이 단계에 표시할 영상이 없어요."))).toBeVisible();
    await expect(page.getByText("영상 준비 중")).toHaveCount(0);
  } else {
    await expect(page.getByText("영상 준비 중")).toBeVisible();
  }
  await expect(page.getByText("운동 영상을 불러오고 있어요")).toHaveCount(0);
  expect(videoRequests, "영상 목록 요청").toEqual([]);
});
