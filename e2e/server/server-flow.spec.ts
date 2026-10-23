// 서버 연결 시험 — Supabase 값이 든 빌드로 게스트 한 사람의 처음부터 끝까지. 사람이 직접 켤 때만 돈다(CI·npm run e2e·e2e:run에는 없음 —
// playwright.config.ts가 E2E_SERVER=1일 때만 이 폴더를 본다).
// 게스트로 시작(익명 가입) → 온보딩·서버 저장 동의 → 기록 하나 → Supabase REST(공개 키 + localStorage "onmom.web.auth"의 이 사용자 토큰,
// RLS로 본인 행만)로 user_states 행과 그 기록 확인 → 새로고침해도 그대로(화면·서버) → 설정 > 계정 삭제 → 옛 토큰으로 다시 물으면
// 실패하거나 행이 없음.
// ⚠️ 그 Supabase 프로젝트(운영 값이면 운영)에 시험 계정 하나와 기록 한 줄을 만들었다가 지운다. 중간에 실패해도 끝에서 그 계정을 지운다
//    (delete_my_account — 로그인한 본인만 자기를 지우는 함수, supabase/migrations/0001). service_role·secret 키는 쓰지 않는다(넣으면 시작하지 않는다).
//
// 돌리는 법(저장소 루트 · 공개 값만 — 주소와 Publishable key: docs/SUPABASE_SETUP.md 0-2·B-4):
//   1) Supabase 값으로 빌드(out/을 덮어쓴다):
//        BASE_PATH=/onmom_web NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… npm run build
//   2) 같은 값으로 시험 — Playwright가 out/을 e2e/serve.mjs로 E2E_PORT에 띄운다(그 포트에 이미 떠 있으면 그것을 쓴다):
//        E2E_PORT=4300 BASE_PATH=/onmom_web NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… npm run e2e:server
//      서버를 따로 띄워도 된다(다른 창): E2E_PORT=4300 BASE_PATH=/onmom_web node e2e/serve.mjs
//   3) 끝나면 브라우저 전용 빌드로 되돌린다: npm run e2e (Supabase 값을 비워 다시 빌드 + 기본 시험)
// - E2E_SERVER·주소·키 중 하나라도 없으면 건너뛴다. 서빙 중인 빌드가 Supabase 값 없이 만든 것이면 실패로 알린다.
// - 대시보드의 CAPTCHA(B-6)가 켜져 있으면 게스트 계정이 생기지 않는다(시험이 사람 확인을 풀 수 없다) — CAPTCHA가 꺼진 프로젝트에서.
//   게스트 시작은 IP당 시간당 30번 한도(B-7)에 센다.
// - 콘솔 오류·페이지 예외·CSP 위반 0개, 이 사이트와 Supabase 밖으로 나가는 요청 0개(guest-flow.spec.ts와 같은 기준).
import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const PUBLIC_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const CONFIGURED = process.env.E2E_SERVER === "1" && SUPABASE_URL !== "" && PUBLIC_KEY !== "";

/** 비밀 키 모양인가 — src/config.ts isSecretSupabaseKey와 같은 판단(sb_secret_…, 또는 JWT의 role이 service_role) */
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  return jwtClaims(key)?.role === "service_role";
}

function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

if (CONFIGURED && isSecretKey(PUBLIC_KEY)) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY에 비밀 키(sb_secret_…·service_role)가 들어 있습니다 — 이 시험은 공개 키(sb_publishable_… 또는 anon)만 씁니다. 그 비밀 키는 Supabase 대시보드에서 바로 폐기하세요.",
  );
}

/** 이 사이트(시험 서버)와 Supabase 말고 다른 곳으로 가는 요청은 막고 기록한다 */
function allowedOrigins(baseURL: string): Set<string> {
  const out = new Set([new URL(baseURL).origin]);
  try {
    out.add(new URL(SUPABASE_URL).origin);
  } catch {
    // 설정이 없으면 시험이 건너뛰어진다
  }
  return out;
}

const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const external: string[] = [];
      const allowed = allowedOrigins(baseURL!);
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await page.exposeBinding("__onmomCspViolation", (_src, v: string) => {
        errors.push(`csp: ${v}`);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          const w = window as unknown as { __onmomCspViolation?: (v: string) => void };
          w.__onmomCspViolation?.(`${e.effectiveDirective} ${e.blockedURI}`);
        });
      });
      await page.context().route(
        (url) => url.protocol !== "data:" && url.protocol !== "blob:" && !allowed.has(url.origin),
        (route) => {
          external.push(route.request().url());
          return route.abort("blockedbyclient");
        },
      );
      await use();
      expect(errors, "콘솔 오류·페이지 예외·CSP 위반").toEqual([]);
      expect(external, "이 사이트와 Supabase 밖으로 나간 요청").toEqual([]);
    },
    { auto: true },
  ],
});

test.skip(!CONFIGURED, "E2E_SERVER=1과 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 있어야 돈다(이 파일 머리말)");

interface StoredSession {
  accessToken: string;
  userId: string;
  claims: Record<string, unknown>;
}

/** localStorage "onmom.web.auth"(supabase-js 세션, src/auth/client.ts)의 접근 토큰과 사용자 id — 없으면 null */
async function storedSession(page: Page): Promise<StoredSession | null> {
  const raw = await page.evaluate(() => localStorage.getItem("onmom.web.auth"));
  if (raw === null) return null;
  let parsed: { access_token?: unknown; currentSession?: { access_token?: unknown } } | null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
  if (typeof token !== "string") return null;
  const claims = jwtClaims(token);
  return typeof claims?.sub === "string" ? { accessToken: token, userId: claims.sub, claims } : null;
}

const restHeaders = (s: StoredSession) => ({ apikey: PUBLIC_KEY, Authorization: `Bearer ${s.accessToken}`, Accept: "application/json" });

/** 이 사용자의 user_states 행 — 공개 키 + 사용자 토큰(브라우저와 같은 권한, RLS: 본인 행만) */
async function ownRows(request: APIRequestContext, s: StoredSession): Promise<{ status: number; rows: unknown[] | null }> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/user_states`, {
    params: { select: "user_id,state,consent_version,updated_at", user_id: `eq.${s.userId}` },
    headers: restHeaders(s),
  });
  const body: unknown = res.ok() ? await res.json() : null;
  return { status: res.status(), rows: Array.isArray(body) ? body : null };
}

interface RowShape {
  user_id?: unknown;
  consent_version?: unknown;
  state?: { symptomHistory?: { id?: unknown }[] };
}

/** 서버 행에 그 기록이 있는지 — "ok" 또는 무엇이 다른지(기다리다 끝나면 이 값이 실패 메시지에 나온다) */
async function serverRecordState(request: APIRequestContext, s: StoredSession, recordId: string): Promise<string> {
  const { status, rows } = await ownRows(request, s);
  if (rows === null) return `조회 실패(HTTP ${status})`;
  if (rows.length === 0) return "행 없음";
  const row = rows[0] as RowShape;
  if (rows.length !== 1 || row.user_id !== s.userId) return "다른 행";
  if (typeof row.consent_version !== "string" || row.consent_version === "") return "동의 판(consent_version) 없음";
  const history = row.state?.symptomHistory;
  return Array.isArray(history) && history.some((r) => r?.id === recordId) ? "ok" : "행은 있지만 그 기록이 없음";
}

/** 이 브라우저의 가장 최근 증상 기록 id(localStorage "onmom.web.state.v1" — 최신순) */
async function latestSymptomId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem("onmom.web.state.v1") ?? "null") as { symptomHistory?: { id?: unknown }[] } | null;
      const id = s?.symptomHistory?.[0]?.id;
      return typeof id === "string" ? id : null;
    } catch {
      return null;
    }
  });
}

async function onmomKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("onmom.web.")));
}

/** 시험이 중간에 멈췄을 때 — 만든 시험 계정(행 + 익명 로그인 계정)을 그 사용자 토큰으로 지운다 */
async function deleteTestAccount(request: APIRequestContext, s: StoredSession): Promise<void> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, { headers: restHeaders(s), data: {} });
  if (!res.ok()) {
    console.warn(`시험 계정을 지우지 못했습니다(HTTP ${res.status()}) — 대시보드 Authentication → Users에서 ${s.userId}를 지우세요.`);
  }
}

/** 한국 날짜 기준 n일 전(YYYY-MM-DD) — guest-flow.spec.ts와 같다 */
function seoulDateDaysAgo(n: number): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 서버 저장 빌드의 필수 동의 셋(src/features/onboarding/consentText.ts REQUIRED_CONSENTS) — 라벨 앞의 [필수] 표시는 이름에 붙는다 */
const REQUIRED_CONSENT_SWITCHES = [/개인정보 수집·이용 동의/, /민감정보\(건강정보\) 처리 동의/, /만 14세 이상이에요/];

test("서버 흐름: 게스트(익명 계정) → 서버 저장 동의 → 기록 → 서버 행 → 새로고침 → 계정 삭제", async ({ page, request }) => {
  test.setTimeout(180_000);
  let session: StoredSession | null = null;
  let deletedInApp = false;
  try {
    // 0) Supabase 값으로 만든 빌드인지 — 카카오 버튼이 "준비 중"으로 잠겨 있으면 브라우저 전용 빌드다
    await page.goto("./login/");
    const guest = page.getByRole("button", { name: "게스트로 시작" });
    await expect(guest).toBeVisible();
    const kakao = page.getByRole("button", { name: /^카카오로 시작하기/ });
    await expect(kakao).toBeVisible();
    expect(await kakao.isDisabled(), "서빙 중인 out/이 Supabase 값 없이 만든 빌드입니다 — 이 파일 머리말 1)대로 다시 빌드하세요").toBe(false);
    expect(await storedSession(page), "시작 전에 이 브라우저에 세션이 없어야 합니다").toBeNull();

    // 1) 게스트로 시작 → 익명 계정(세션)이 생긴다
    await guest.click();
    await expect(page).toHaveURL(/\/onboarding\/$/);
    await expect
      .poll(() => storedSession(page), {
        message: "게스트 시작 뒤 익명 계정(onmom.web.auth)이 생기지 않았습니다 — 대시보드의 Allow anonymous sign-ins·CAPTCHA·요청 한도(설정 안내 B-1·B-6·B-7)",
        timeout: 20_000,
      })
      .not.toBeNull();
    const s = (await storedSession(page))!;
    session = s;
    expect(s.claims.is_anonymous, "게스트는 Supabase 익명 사용자여야 합니다").toBe(true);
    const iss = typeof s.claims.iss === "string" ? s.claims.iss : "";
    if (/^https?:\/\//.test(iss)) {
      expect(new URL(iss).origin, "빌드의 Supabase 주소와 시험의 NEXT_PUBLIC_SUPABASE_URL이 다릅니다").toBe(new URL(SUPABASE_URL).origin);
    }

    // 2) 온보딩 — 시작 · 출산 정보(40일 전, 자연분만) · 목표(전업)
    await page.getByRole("button", { name: "시작하기" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "출산 정보를 알려주세요" })).toBeVisible();
    const next = page.getByRole("button", { name: "다음" });
    await page.getByRole("textbox", { name: "출산일" }).fill(seoulDateDaysAgo(40));
    await page.getByText("자연분만", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "자연분만" })).toBeChecked();
    await next.click();
    await expect(page.getByRole("heading", { level: 1, name: "목표를 설정해주세요" })).toBeVisible();
    await page.locator("label").filter({ has: page.getByRole("radio", { name: /^전업/ }) }).click();
    await expect(page.getByRole("radio", { name: /^전업/ })).toBeChecked();
    await next.click();

    // 3) 서버 저장 동의 — 동의 전에는 서버에 행이 없다(0001 정책·동기화 엔진은 지금 판의 동의 뒤에만 쓴다)
    await expect(page.getByRole("heading", { level: 1, name: "데이터 이용에 동의해주세요" })).toBeVisible();
    const start = page.getByRole("button", { name: "온맘 시작하기" });
    await expect(start).toBeDisabled();
    const beforeConsent = await ownRows(request, s);
    expect(beforeConsent.status, "user_states 조회(공개 키 + 이 사용자 토큰)가 되어야 합니다").toBe(200);
    expect(beforeConsent.rows, "동의 전에는 서버에 기록이 없어야 합니다").toEqual([]);
    for (const name of REQUIRED_CONSENT_SWITCHES) {
      const consent = page.getByRole("switch", { name });
      await consent.click();
      await expect(consent).toBeChecked();
    }
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page).toHaveURL(/\/home\/$/);
    await expect(page.getByRole("region", { name: "산후 회복" }).getByText(/^40\s*일차$/)).toBeVisible();

    // 4) 기록 하나 — 어지러움 → 즉시 내원
    const nav = page.getByRole("navigation", { name: "주요 메뉴" });
    await nav.getByRole("link", { name: "기록", exact: true }).click();
    await expect(page).toHaveURL(/\/record\/$/);
    const dizzy = page.getByRole("switch", { name: "어지러움·실신·균형장애" });
    await dizzy.click();
    await expect(dizzy).toBeChecked();
    await page.getByRole("button", { name: "확인하기" }).click();
    await expect(page.getByRole("main").getByRole("alert").getByText("즉시 내원", { exact: true })).toBeVisible();
    await expect.poll(() => latestSymptomId(page), { message: "이 브라우저에 증상 기록이 저장되지 않았습니다" }).not.toBeNull();
    const recordId = (await latestSymptomId(page))!;

    // 5) 서버에 그 기록이 있는 내 행 하나(모아서 올리므로 몇 초 걸린다 — store/sync/engine.ts)
    await expect
      .poll(() => serverRecordState(request, s, recordId), { message: "서버 user_states 행에 방금 기록이 올라가지 않았습니다", timeout: 30_000 })
      .toBe("ok");

    // 6) 새로고침 — 이 브라우저와 서버 모두 그대로
    await nav.getByRole("link", { name: "홈", exact: true }).click();
    await expect(page).toHaveURL(/\/home\/$/);
    const needsCheck = () =>
      page.getByRole("region", { name: "오늘의 회복 상태" }).getByRole("paragraph").filter({ hasText: /^확인 필요$/ });
    await expect(needsCheck()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/home\/$/);
    await expect(needsCheck()).toBeVisible();
    expect(await latestSymptomId(page), "새로고침 뒤 이 브라우저의 기록").toBe(recordId);

    // 7) 설정 — 새로고침 뒤 동기화(서버 먼저 읽기 → 합치기)가 끝나 "서버에 저장됨", 서버 행에도 그대로
    await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "프로필", exact: true }).click();
    await expect(page).toHaveURL(/\/profile\/$/);
    await page.getByRole("main").getByRole("link", { name: /^설정/ }).click();
    await expect(page).toHaveURL(/\/settings\/$/);
    await expect(page.getByText("서버에 저장됨")).toBeVisible({ timeout: 30_000 });
    expect(await serverRecordState(request, s, recordId), "새로고침 뒤 서버 행").toBe("ok");

    // 8) 계정 삭제 — 게스트는 "이 기기에서 기록 지우기(계정 삭제)". 확인 창의 첫 버튼이 되돌릴 수 없는 삭제
    await page.getByRole("button", { name: /^(이 기기에서 기록 지우기\(계정 삭제\)|계정 삭제)/ }).click();
    const dialog = page.getByRole("dialog", { name: "계정을 삭제할까요?" });
    await expect(dialog).toBeVisible();
    const destructive = dialog.getByRole("button").first();
    await expect(destructive).toContainText("삭제");
    await destructive.click();
    await expect(page).toHaveURL(/\/login\/$/, { timeout: 30_000 });
    deletedInApp = true;
    await expect(page.getByRole("button", { name: "게스트로 시작" })).toBeVisible();
    expect(await onmomKeys(page), "계정 삭제 뒤 이 브라우저의 온맘 데이터").toEqual([]);

    // 9) 옛 토큰으로 다시 — REST가 실패(401·403)하거나 행이 없어야 한다. 로그인 서버도 그 사용자를 모른다.
    const after = await ownRows(request, s);
    expect(after.status !== 200 || after.rows?.length === 0, `삭제 뒤 옛 토큰의 user_states 조회: HTTP ${after.status}, 행 ${after.rows?.length ?? "-"}개`).toBe(true);
    const user = await request.get(`${SUPABASE_URL}/auth/v1/user`, { headers: restHeaders(s) });
    expect(user.status(), "삭제 뒤 옛 토큰의 /auth/v1/user — 사용자가 남아 있으면 200").not.toBe(200);
  } finally {
    if (session !== null && !deletedInApp) await deleteTestAccount(request, session);
  }
});
