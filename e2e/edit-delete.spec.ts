// 브라우저 자동 시험 — 기록·기분 답의 전체 기록·수정·삭제와 기록장 글 수정·삭제·댓글 삭제(브라우저 전용 빌드, 게스트). LAUNCH_CHECKLIST 7-4.
// 기록 2건·답 1개 → 전체 기록 → 증상 기록 수정(결과 안내) → 다른 기록 삭제(확인 창·초점) → 답 수정 → 새로 고쳐도 그대로
// → 기록장 글쓰기 → 댓글 → 댓글 삭제 → 글 수정 → 글 삭제. 지운 기록은 삭제 표시(id·시각만)만 남고 내용은 저장소 어디에도 없다.
// guest-flow.spec.ts와 같이: 콘솔 오류·페이지 예외 0개, 이 사이트 밖으로 나가는 요청 0개.
import { expect, test as base, type Page } from "@playwright/test";

const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await page.context().route(
        (url) => !url.href.startsWith("data:") && !url.href.startsWith("blob:") && new URL(url.href).origin !== new URL(baseURL!).origin,
        (route) => {
          external.push(route.request().url());
          return route.abort("blockedbyclient");
        },
      );
      await use();
      expect(errors, "콘솔 오류·페이지 예외").toEqual([]);
      expect(external, "사이트 밖으로 나간 요청").toEqual([]);
    },
    { auto: true },
  ],
});

function seoulDateDaysAgo(n: number): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function isBrowserOnlyBuild(page: Page): Promise<boolean> {
  await page.goto("./login/");
  const kakao = page.getByRole("button", { name: /^카카오로 시작하기/ });
  await expect(kakao).toBeVisible();
  return (await kakao.isDisabled()) && /준비 중/.test((await kakao.textContent()) ?? "");
}

/** 로그인 → 게스트 → 온보딩(40일 전·자연분만·전업·동의) → 홈 */
async function onboardGuest(page: Page) {
  await page.getByRole("button", { name: "게스트로 시작" }).click();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("textbox", { name: "출산일" }).fill(seoulDateDaysAgo(40));
  await page.getByText("자연분만", { exact: true }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.locator("label").filter({ has: page.getByRole("radio", { name: /^전업/ }) }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("switch", { name: "개인정보·민감정보 처리 방침에 동의합니다" }).click();
  await page.getByRole("button", { name: "온맘 시작하기" }).click();
  await expect(page).toHaveURL(/\/home\/$/);
}

interface Saved {
  symptomHistory: { id: string; painNrs: number; feverEvent: boolean; updatedAt?: string }[];
  moodChecks: { id: string; answer: string; updatedAt?: string }[];
  communityPosts: { id: string; title: string; comments: { id: string }[] }[];
  deleted: Record<string, { id: string; deletedAt: string }[]>;
}

async function saved(page: Page): Promise<{ state: Saved; sidecar: string | null; all: string }> {
  return page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem("onmom.web.state.v1") ?? "null"),
    sidecar: localStorage.getItem("onmom.web.deleted.v1"),
    all: JSON.stringify(localStorage),
  }));
}

test("기록 전체 보기 — 증상 기록 수정·삭제, 오늘의 질문 답 수정", async ({ page }) => {
  test.skip(!(await isBrowserOnlyBuild(page)), "브라우저 전용 빌드에서만(게스트 시작이 서버 계정을 만들지 않게 — DEV_NOTES §11)");
  await onboardGuest(page);

  const nav = page.getByRole("navigation", { name: "주요 메뉴" });
  await nav.getByRole("link", { name: "기록", exact: true }).click();
  await expect(page).toHaveURL(/\/record\/$/);
  // 기록·답이 없으면 전체 기록 버튼이 없다
  await expect(page.getByRole("link", { name: "전체 기록 보기" })).toHaveCount(0);

  // 기록 1 — 발열(병원 확인 신호), 기록 2 — 통증 2(해당 없음)
  await page.getByRole("switch", { name: /열·오한/ }).click();
  await page.getByRole("button", { name: "확인하기" }).click();
  await page.getByRole("button", { name: "다시 입력" }).click();
  await page.getByRole("switch", { name: /열·오한/ }).click(); // 끈다
  await page.getByRole("slider", { name: /통증 정도/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "확인하기" }).click();
  await page.getByRole("button", { name: "다시 입력" }).click();
  // 오늘의 질문 — 아니요
  await page.getByRole("button", { name: "아니요" }).click();

  await page.getByRole("link", { name: "전체 기록 보기" }).click();
  await expect(page).toHaveURL(/\/record\/history\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "전체 기록" })).toBeVisible();
  const symptoms = page.getByRole("region", { name: "증상 기록" });
  const moods = page.getByRole("region", { name: "오늘의 한 가지 질문" });
  await expect(symptoms.getByRole("listitem").filter({ has: page.getByRole("button", { name: /기록 삭제$/ }) })).toHaveCount(2);
  await expect(moods.getByText("아니요", { exact: true })).toBeVisible();

  const before = (await saved(page)).state;
  const [newest, older] = before.symptomHistory;
  expect(newest.feverEvent).toBe(false);
  expect(older.feverEvent).toBe(true);

  // 가장 최근 기록 수정 — 발열을 켜고 저장 → 기록 탭과 같은 결과 안내
  await symptoms.getByRole("link", { name: /기록 수정$/ }).first().click();
  await expect(page).toHaveURL(/\/record\/edit\/\?id=/);
  await expect(page.getByRole("heading", { level: 1, name: "기록 수정" })).toBeVisible();
  const save = page.getByRole("button", { name: "저장", exact: true });
  await expect(save).toBeDisabled(); // 바뀐 것이 없으면 잠김
  await expect(page.getByRole("textbox", { name: /내 동네/ })).toHaveCount(0);
  await page.getByRole("switch", { name: /열·오한/ }).click();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "기록을 수정했어요." })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: "바로 병원에 가야 하는 신호" })).toBeVisible();
  const afterEdit = (await saved(page)).state;
  expect(afterEdit.symptomHistory[0]).toMatchObject({ id: newest.id, feverEvent: true });
  expect(afterEdit.symptomHistory[0].updatedAt).toBeTruthy();

  await page.getByRole("button", { name: "전체 기록으로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/record\/history\/$/);
  await expect(symptoms.getByText("수정됨")).toHaveCount(1);

  // 더 오래된 기록 삭제 — 확인 창([취소]에 초점) → [삭제] → 줄이 사라지고 초점은 묶음 제목
  await symptoms.getByRole("button", { name: /기록 삭제$/ }).last().click();
  const dialog = page.getByRole("dialog", { name: "이 기록을 삭제할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(symptoms.getByRole("button", { name: /기록 삭제$/ })).toHaveCount(1);
  await expect(symptoms.getByRole("heading", { name: "증상 기록" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "기록을 삭제했어요." })).toBeAttached();

  const afterDelete = await saved(page);
  expect(afterDelete.state.symptomHistory.map((r) => r.id)).toEqual([newest.id]);
  expect(afterDelete.state.deleted.symptomHistory.map((t) => t.id)).toEqual([older.id]);
  // 지운 기록의 내용은 없다 — 표시는 id·시각만(따로 둔 사본도 같다)
  expect(Object.keys(afterDelete.state.deleted.symptomHistory[0]).sort()).toEqual(["deletedAt", "id"]);
  expect(JSON.parse(afterDelete.sidecar!).symptomHistory.map((t: { id: string }) => t.id)).toEqual([older.id]);

  // 답 수정 — 아니요 → 네
  await moods.getByRole("button", { name: /답 수정$/ }).click();
  const moodDialog = page.getByRole("dialog", { name: "답 수정" });
  await expect(moodDialog.getByRole("radio", { name: "아니요" })).toBeChecked();
  await expect(moodDialog.getByRole("radio", { name: "아니요" })).toBeFocused();
  await moodDialog.getByText("네", { exact: true }).click();
  await moodDialog.getByRole("button", { name: "저장" }).click();
  await expect(moodDialog).toBeHidden();
  await expect(moods.getByText("네", { exact: true })).toBeVisible();
  await expect(moods.getByText("수정됨")).toBeVisible();
  await expect(moods.getByRole("button", { name: /답 수정$/ })).toBeFocused(); // 연 버튼으로 돌아온다

  // 새로 고쳐도 그대로
  await page.reload();
  await expect(symptoms.getByRole("button", { name: /기록 삭제$/ })).toHaveCount(1);
  await expect(moods.getByText("네", { exact: true })).toBeVisible();

  // 가장 최근 기록(고친 기록 — 발열)이 홈의 근거
  await nav.getByRole("link", { name: "홈", exact: true }).click();
  await expect(page.getByRole("region", { name: "오늘의 회복 기록" }).getByRole("paragraph").filter({ hasText: /^병원 확인 신호$/ })).toBeVisible();
});

test("기록장 — 댓글 삭제, 글 수정, 글 삭제", async ({ page }) => {
  test.skip(!(await isBrowserOnlyBuild(page)), "브라우저 전용 빌드에서만(DEV_NOTES §11)");
  await onboardGuest(page);

  const nav = page.getByRole("navigation", { name: "주요 메뉴" });
  await nav.getByRole("link", { name: "기록장", exact: true }).click();
  await page.getByRole("link", { name: "글쓰기" }).click();
  await page.getByRole("textbox", { name: "제목" }).fill("첫 글");
  await page.getByRole("textbox", { name: "내용" }).fill("본문이에요");
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page).toHaveURL(/\/journal\/$/);
  await page.getByRole("link", { name: "첫 글" }).click();
  await expect(page).toHaveURL(/\/journal\/post\/\?id=/);

  // 댓글 둘 → 첫 댓글 삭제(확인 창) → 초점은 댓글 제목
  const comment = page.getByRole("textbox", { name: "댓글을 입력하세요" });
  await comment.fill("지울 댓글");
  await comment.press("Enter");
  await comment.fill("남길 댓글");
  await comment.press("Enter");
  await expect(page.getByRole("heading", { name: "댓글 2" })).toBeVisible();
  // 댓글마다의 [삭제] — 낭독 이름은 같고, 어느 댓글인지는 설명(aria-describedby = 댓글 글자)
  const toDelete = page.getByRole("listitem").filter({ hasText: "지울 댓글" }).getByRole("button", { name: "댓글 삭제" });
  await expect(toDelete).toHaveAccessibleDescription("지울 댓글");
  await toDelete.click();
  const commentDialog = page.getByRole("dialog", { name: "이 댓글을 삭제할까요?" });
  await expect(commentDialog.getByRole("button", { name: "취소" })).toBeFocused();
  await commentDialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByText("지울 댓글")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "댓글 1" })).toBeFocused();

  // 글 수정 → 상세로 돌아와 고친 제목·수정됨
  await page.getByRole("link", { name: "수정", exact: true }).click();
  await expect(page).toHaveURL(/\/journal\/edit\/\?id=/);
  const save = page.getByRole("button", { name: "저장" });
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "제목" }).fill("고친 글");
  await save.click();
  await expect(page).toHaveURL(/\/journal\/post\/\?id=/);
  await expect(page.getByRole("heading", { level: 2, name: "고친 글" })).toBeVisible();
  await expect(page.getByText("수정됨")).toBeVisible();
  await expect(page.getByText("남길 댓글")).toBeVisible();

  // 글 삭제 → 목록(빈 상태)
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  const postDialog = page.getByRole("dialog", { name: "이 글을 삭제할까요?" });
  await expect(postDialog).toBeVisible();
  await postDialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/journal\/$/);
  await expect(page.getByText("아직 기록이 없어요. 오늘의 회복 이야기를 남겨보세요.")).toBeVisible();

  const { state, all } = await saved(page);
  expect(state.communityPosts).toEqual([]);
  expect(state.deleted.communityPosts).toHaveLength(1);
  expect(state.deleted.comments).toHaveLength(1);
  // 지운 글·댓글의 글자는 브라우저 저장소 어디에도 없다
  for (const text of ["고친 글", "본문이에요", "지울 댓글", "남길 댓글"]) expect(all).not.toContain(text);

  // 지운 글의 주소로 다시 오면(앞으로 가기) "삭제된 글이에요."(iOS 원문)
  await page.goForward();
  await expect(page).toHaveURL(/\/journal\/post\/\?id=/);
  await expect(page.getByText("삭제된 글이에요.")).toBeVisible();
});
