// 접근성 자동 검사(axe-core, WCAG 2.1 A/AA + 저장소 규칙) — 서버 없이 닿는 모든 화면·상태. docs/dev/ACCESSIBILITY.md §1-5.
// 폰(402)·PC(1440) Chromium에서 모두 돈다. 실기기 흉내(iPhone WebKit·Android Chromium)는 devices.spec.ts의 일부만.
// 예외는 e2e/support/axe.ts EXCLUSIONS(규칙 + 선택자 + 이유) 한 곳.
// 관리자 대시보드(데이터가 있는 화면)는 서버가 있어야 그려진다 — src/features/admin/adminA11y.test.ts(jsdom + axe)가 가짜 행으로 본다.
import type { Page } from "@playwright/test";
import { SERVER_BUILD_SKIP, expect, screenReady, test } from "./support/app";
import { expectNoAxeViolations } from "./support/axe";
import { SEED_POST_ID } from "./support/seed";

async function scan(page: Page, label: string): Promise<void> {
  await screenReady(page);
  await expectNoAxeViolations(page, label);
}

test.describe("처음 온 사람(저장소 빔)", () => {
  test("로그인 · 처리방침 시트 · 이용약관 시트", async ({ page }) => {
    await page.goto("./login/");
    await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
    await scan(page, "로그인");

    await page.getByRole("button", { name: "개인정보처리방침 보기" }).click();
    const privacy = page.getByRole("dialog");
    await expect(privacy).toBeVisible();
    await expectNoAxeViolations(page, "로그인 > 개인정보처리방침 시트");
    await page.keyboard.press("Escape");
    await expect(privacy).toBeHidden();

    await page.getByRole("button", { name: "이용약관 보기" }).click();
    const terms = page.getByRole("dialog");
    await expect(terms).toBeVisible();
    await expectNoAxeViolations(page, "로그인 > 이용약관 시트");
  });

  test("개인정보처리방침 · 이용약관 화면", async ({ page }) => {
    await page.goto("./privacy/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "개인정보처리방침");
    await page.goto("./terms/");
    await expect(page.getByRole("heading", { level: 1, name: "온맘 이용약관" })).toBeVisible();
    await scan(page, "이용약관");
  });

  test("관리자(설정 없는 빌드·로그인 전) · 로그인 돌아오는 주소", async ({ page, browserOnly }) => {
    await page.goto("./admin/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, browserOnly ? "관리자 — 권한 없음(설정 없는 빌드)" : "관리자 — 확인 중/권한 없음");
    await page.goto("./auth/callback/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, "로그인 돌아오는 주소(code 없음)");
  });

  test("온보딩 4단계", async ({ page, browserOnly }) => {
    test.skip(!browserOnly, SERVER_BUILD_SKIP);
    await page.goto("./login/");
    await page.getByRole("button", { name: "게스트로 시작" }).click();
    await expect(page).toHaveURL(/\/onboarding\/$/);
    await expect(page.getByRole("button", { name: "시작하기" })).toBeVisible();
    await scan(page, "온보딩 1 시작");

    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" })).toBeVisible();
    await scan(page, "온보딩 2 출산 정보(빈 칸)");
    await page.getByRole("textbox", { name: "출산일" }).fill("2026-09-29");
    await page.getByText("제왕절개", { exact: true }).click();
    await expectNoAxeViolations(page, "온보딩 2 출산 정보(채움)");
    await page.getByRole("button", { name: "다음" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "목표를 설정해주세요" })).toBeVisible();
    await page.locator("label").filter({ has: page.getByRole("radio", { name: /^복직/ }) }).click();
    await expectNoAxeViolations(page, "온보딩 3 목표(복직 — 복직 예정일 칸)");
    await page.getByRole("button", { name: "다음" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "데이터 이용에 동의해주세요" })).toBeVisible();
    await expectNoAxeViolations(page, "온보딩 4 동의");
    // "자세히" 펼침
    for (const summary of await page.locator("details > summary").all()) await summary.click();
    await page.getByRole("switch", { name: "개인정보·민감정보 처리 방침에 동의합니다" }).click();
    await expectNoAxeViolations(page, "온보딩 4 동의(펼침·켬)");
  });
});

test.describe("온보딩을 마친 게스트 — 오늘 위험 신호", () => {
  test.use({ seed: "redFlag" });
  test.beforeEach(({ browserOnly }) => {
    test.skip(!browserOnly, SERVER_BUILD_SKIP);
  });

  test("홈(병원 확인 신호·마음 연계 카드) · 운동(멈춤)", async ({ page }) => {
    await page.goto("./home/");
    await expect(page.getByRole("heading", { name: "운동 안내를 멈췄어요" })).toBeVisible();
    await scan(page, "홈 — 위험 신호 + 마음 연계 카드");
    await page.goto("./exercise/");
    await expect(page.getByRole("heading", { name: "운동 영상 추천을 멈췄어요" })).toBeVisible();
    await scan(page, "운동 — 영상 추천 멈춤");
  });

  test("기록 — 입력 · 위험 신호 결과 · 마음 체크", async ({ page }) => {
    await page.goto("./record/");
    await expect(page.getByRole("button", { name: "확인하기" })).toBeVisible();
    // 오늘의 한 가지 질문(마음 체크) — 아직 답하지 않음(seed). 폰은 입력 단계에서만 보인다.
    const moodAnswers = page.getByRole("group").filter({ has: page.getByRole("button", { name: "글쎄요", exact: true }) });
    await expect(moodAnswers).toBeVisible();
    await scan(page, "기록 — 입력(최근 기록·오늘의 질문)");
    await moodAnswers.getByRole("button", { name: "글쎄요", exact: true }).click();
    await expect(moodAnswers).toHaveCount(0);
    await expectNoAxeViolations(page, "기록 — 마음 체크 답한 뒤");

    // 폼을 채운다 — 스위치·슬라이더
    await page.getByRole("switch", { name: "어지러움·실신·균형장애" }).click();
    await page.getByRole("switch", { name: /가슴/ }).click();
    const slider = page.getByRole("slider");
    await slider.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuetext", "6/10");
    await expectNoAxeViolations(page, "기록 — 채운 폼");

    await page.getByRole("button", { name: "확인하기" }).click();
    await expect(page.getByRole("main").getByRole("alert").first()).toBeVisible();
    await expectNoAxeViolations(page, "기록 — 위험 신호 결과(119 등급·가까운 산부인과)");
  });

  test("회복 분석 — 폼 · 결과", async ({ page }) => {
    await page.goto("./analyze/");
    await expect(page.getByRole("button", { name: "분석 시작" })).toBeVisible();
    await scan(page, "회복 분석 — 폼");
    await page.getByRole("button", { name: "분석 시작" }).click();
    await expect(page.getByRole("button", { name: "분석 시작" })).toHaveCount(0);
    await expectNoAxeViolations(page, "회복 분석 — 결과");
  });

  test("가이드 · 생활 · 지원사업(추천) · 약물 체크(코데인) · 지역 연계", async ({ page }) => {
    await page.goto("./guide/");
    await scan(page, "가이드");
    await page.goto("./lifestyle/");
    await scan(page, "생활");

    await page.goto("./support/");
    await scan(page, "지원사업 — 질문");
    for (const box of (await page.getByRole("checkbox").all()).slice(0, 3)) await box.check({ force: true });
    await page.getByRole("button", { name: "추천 받기" }).click();
    await expectNoAxeViolations(page, "지원사업 — 추천 결과");

    await page.goto("./substance/");
    await scan(page, "약물 체크 — 빈 칸");
    await page.getByRole("searchbox").fill("코데인");
    await page.getByRole("button", { name: "확인하기" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "코데인" })).toBeVisible();
    await expectNoAxeViolations(page, "약물 체크 — 코데인 결과");

    await page.goto("./region/");
    await scan(page, "지역 연계(지도 키 없음)");
  });

  test("AI 상담 — 질문 하나(브라우저 전용 = 앱 안내 답)", async ({ page }) => {
    await page.goto("./chat/");
    const input = page.getByRole("textbox", { name: "메시지를 입력하세요" });
    await expect(input).toBeVisible();
    await scan(page, "AI 상담 — 첫 화면");
    await input.fill("산후 운동은 언제부터 해도 되나요?");
    await page.getByRole("button", { name: "메시지 보내기" }).click();
    await expect(page.getByRole("main").getByText("산후 운동은 언제부터 해도 되나요?")).toBeVisible();
    await expect(page.getByRole("main").locator("p").filter({ hasText: "온맘" }).last()).toBeVisible();
    await expectNoAxeViolations(page, "AI 상담 — 답 하나");
  });

  test("기록장 — 목록 · 글쓰기 · 글 상세", async ({ page }) => {
    await page.goto("./journal/");
    await expect(page.getByText("둘째 주 산책")).toBeVisible();
    await scan(page, "기록장 — 목록");
    await page.goto("./journal/write/");
    await expect(page.getByRole("textbox", { name: /제목/ })).toBeVisible();
    await scan(page, "기록장 — 글쓰기(빈 칸)");
    await page.getByRole("textbox", { name: /제목/ }).fill("셋째 주");
    await page.getByRole("textbox", { name: /내용/ }).fill("오늘은 20분 걸었어요.");
    await expectNoAxeViolations(page, "기록장 — 글쓰기(채움)");
    await page.goto(`./journal/post/?id=${SEED_POST_ID}`);
    await expect(page.getByText("무리하지 않기")).toBeVisible();
    await scan(page, "기록장 — 글 상세(댓글 하나)");
    await page.goto(`./journal/edit/?id=${SEED_POST_ID}`);
    await expect(page.getByRole("textbox", { name: /제목/ })).toHaveValue("둘째 주 산책");
    await scan(page, "기록장 — 글 수정");
  });

  test("기록 — 전체 기록 · 삭제 확인 창 · 답 수정 창 · 기록 수정", async ({ page }) => {
    await page.goto("./record/history/");
    const records = page.getByRole("region", { name: "증상 기록" });
    await expect(records.getByRole("button", { name: /삭제/ }).first()).toBeVisible();
    await scan(page, "전체 기록(판 있음·없음 기록 2건, 답 3개)");
    await records.getByRole("button", { name: /삭제/ }).first().click();
    await expect(page.getByRole("dialog", { name: "이 기록을 삭제할까요?" })).toBeVisible();
    await expectNoAxeViolations(page, "전체 기록 — 삭제 확인 창");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("region", { name: "오늘의 한 가지 질문" }).getByRole("button", { name: /수정/ }).first().click();
    await expect(page.getByRole("dialog", { name: "답 수정" })).toBeVisible();
    await expectNoAxeViolations(page, "전체 기록 — 답 수정 창");
    await page.keyboard.press("Escape");
    await page.goto("./record/edit/?id=e2e-today");
    await expect(page.getByRole("switch", { name: "어지러움·실신·균형장애" })).toBeChecked();
    await scan(page, "기록 수정(위험 신호 기록)");
  });

  test("프로필 · 설정 · 계정 삭제 창 · 프로필 편집", async ({ page }) => {
    await page.goto("./profile/");
    await scan(page, "프로필");
    await page.goto("./settings/");
    await expect(page.getByRole("button", { name: /^계정 삭제/ })).toBeVisible();
    await scan(page, "설정");
    await page.getByRole("button", { name: /^계정 삭제/ }).click();
    await expect(page.getByRole("dialog", { name: "계정을 삭제할까요?" })).toBeVisible();
    await expectNoAxeViolations(page, "설정 — 계정 삭제 확인 창");
    await page.keyboard.press("Escape");
    await page.goto("./settings/profile/");
    await scan(page, "설정 — 프로필 편집");
  });

  test("PDF 리포트 — 기록·판 표시 · 기록장 글 포함", async ({ page }) => {
    await page.goto("./settings/report/");
    await expect(page.getByRole("button", { name: "PDF로 저장" })).toBeVisible();
    await scan(page, "PDF 리포트(기록 2건 — 판 있음·없음, 마음 체크 3건)");
    await page.getByRole("checkbox", { name: "기록장 글 포함" }).check();
    await expect(page.getByText("둘째 주 산책")).toBeVisible();
    await expectNoAxeViolations(page, "PDF 리포트 — 기록장 글 포함");
    // 인쇄 모양(print:hidden이 빠지고 본문만) — 화면 낭독기가 PDF를 읽지는 않지만 인쇄 미디어에서도 구조가 같아야 한다
    await page.emulateMedia({ media: "print" });
    await expectNoAxeViolations(page, "PDF 리포트 — 인쇄 미디어");
    await page.emulateMedia({ media: null });
  });

  test("없는 주소 — 한국어 404", async ({ page, guard, baseURL }) => {
    const unknown = new URL("./no-such-page/", baseURL).href;
    guard.allowNotFound(unknown);
    const res = await page.goto(unknown);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없어요" })).toBeVisible();
    await scan(page, "404");
  });
});

test.describe("온보딩을 마친 게스트 — 오늘 신호 없음", () => {
  test.use({ seed: "normal" });
  test.beforeEach(({ browserOnly }) => {
    test.skip(!browserOnly, SERVER_BUILD_SKIP);
  });

  test("홈 · 운동(단계 안내) · 기록 결과(신호 없음)", async ({ page }) => {
    await page.goto("./home/");
    await expect(page.getByRole("region", { name: "산후 회복" })).toBeVisible();
    await scan(page, "홈 — 신호 없음");
    await page.goto("./exercise/");
    await scan(page, "운동 — 단계 안내");
    await page.goto("./record/");
    await page.getByRole("button", { name: "확인하기" }).click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "체크한 항목 중에는" })).toBeVisible();
    await expectNoAxeViolations(page, "기록 — 신호 없음 결과");
  });
});
