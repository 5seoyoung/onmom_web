// PWA — 매니페스트·아이콘·서비스 워커·설정 알림 화면의 규칙. 정적 파일(public/)은 글자·바이트로 확인한다(DOM 없음).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import content from "@/content";
import { config, isReminderConfigured, isVapidPublicKeyShape, robotsFor } from "@/config";
import { ReminderSection, reminderHint } from "@/features/settings/ReminderSection";
import { ROUTES } from "@/routes";
import { MANIFEST_PATH, PRODUCTION_BASE_PATH, PWA_APP_TITLE, PWA_ICONS, pwaAssetUrl, serviceWorkerScope, serviceWorkerUrl, SW_PATH } from "./pwaAssets";
import * as serverRules from "../../../supabase/functions/_shared/reminders";
import {
  accountTransition,
  disableReminder,
  enableReminder,
  isIosDevice,
  isKnownPushService,
  normalizeTimeZone,
  pushApiAvailable,
  PUSH_ENDPOINT_MAX_LENGTH,
  PUSH_ENDPOINT_PATTERN,
  PUSH_SERVICE_HOSTS,
  rebindReminder,
  REMINDER_TEXT,
  reminderView,
  sameApplicationServerKey,
  shouldAutoRegisterServiceWorker,
  subscribedState,
  subscriptionRow,
  urlBase64ToUint8Array,
  type PushManagerLike,
  type PushSubscriptionLike,
  type PushSubscriptionRow,
  type ReminderEnv,
  type SaveRowResult,
} from "./reminderModel";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** PNG IHDR — 8바이트 서명 뒤 길이(4)·"IHDR"(4)·너비(4)·높이(4) */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// RFC 8291 부록 A의 서버 공개 키 — 모양 검사용(실제 키가 아니다)
const SAMPLE_PUBLIC_KEY = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
// FCM 끝점 모양(실제 구독이 아니다)
const FCM = "https://fcm.googleapis.com/fcm/send/test-endpoint";

describe("manifest.webmanifest — 정적 파일이라 basePath가 적혀 있다", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, MANIFEST_PATH), "utf8")) as Record<string, unknown>;

  it("이름·언어·표시 방식·색", () => {
    expect(manifest.name).toBe(PWA_APP_TITLE);
    expect(manifest.short_name).toBe(PWA_APP_TITLE);
    expect(manifest.lang).toBe("ko");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#F9FAFB");
    expect(manifest.theme_color).toBe("#F9FAFB");
    expect(manifest.orientation ?? "any").toBe("any"); // PC 가로 화면(사이드바)이 있으므로 방향을 잠그지 않는다
  });

  it("start_url = basePath + ROUTES.home, scope·id = basePath/ — 커스텀 도메인으로 옮기면 세 값을 고친다(docs/PWA_AND_REMINDERS.md)", () => {
    expect(manifest.start_url).toBe(`${PRODUCTION_BASE_PATH}${ROUTES.home}`);
    expect(manifest.scope).toBe(serviceWorkerScope(PRODUCTION_BASE_PATH));
    expect(manifest.id).toBe(serviceWorkerScope(PRODUCTION_BASE_PATH));
    expect(PRODUCTION_BASE_PATH).toBe("/onmom_web");
  });

  it("아이콘 파일이 있고 실제 크기가 sizes와 같다 — 192·512 any + maskable", () => {
    const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose: string }>;
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual(["192x192 any", "192x192 maskable", "512x512 any", "512x512 maskable"]);
    for (const icon of icons) {
      expect(icon.src.startsWith("/")).toBe(false); // 매니페스트 주소 기준 상대 경로 — 도메인을 바꿔도 그대로
      const file = join(PUBLIC, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const size = Number(icon.sizes.split("x")[0]);
      expect(pngSize(file)).toEqual({ width: size, height: size });
      expect(icon.type).toBe("image/png");
    }
  });
});

describe("pwaAssets — 레이아웃 메타데이터가 쓰는 주소", () => {
  it("basePath를 앞에 붙인다(빈 basePath = 커스텀 도메인)", () => {
    expect(pwaAssetUrl("", "manifest")).toBe("/manifest.webmanifest");
    expect(pwaAssetUrl("/onmom_web", "manifest")).toBe("/onmom_web/manifest.webmanifest");
    expect(pwaAssetUrl("/onmom_web", "icon192")).toBe("/onmom_web/icons/icon-192.png");
    expect(pwaAssetUrl("/onmom_web", "apple180")).toBe("/onmom_web/icons/apple-touch-icon-180.png");
    expect(serviceWorkerUrl("/onmom_web")).toBe("/onmom_web/sw.js");
    expect(serviceWorkerScope("")).toBe("/");
  });

  it("모든 아이콘 파일이 public/에 있고 크기가 맞다(apple-touch-icon 180 포함)", () => {
    for (const icon of Object.values(PWA_ICONS)) {
      const file = join(PUBLIC, icon.path);
      expect(existsSync(file), icon.path).toBe(true);
      expect(pngSize(file)).toEqual({ width: icon.size, height: icon.size });
    }
  });

  it("루트 레이아웃이 basePath로 매니페스트·아이콘을 걸고, iOS 메타와 서비스 워커 등록을 둔다", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('manifest: pwaAssetUrl(config.basePath, "manifest")');
    expect(layout).toContain('pwaAssetUrl(config.basePath, "apple180")');
    expect(layout).toContain("appleWebApp: { capable: true, title: PWA_APP_TITLE");
    expect(layout).toContain('robots: robotsFor("app")');
    expect(layout).toContain("<PwaClient />");
  });
});

describe("sw.js — 알림 문구는 content.json 원문, 눌렀을 때 여는 화면은 ROUTES.record", () => {
  const sw = readFileSync(join(PUBLIC, SW_PATH), "utf8");
  const constant = (name: string) => {
    const m = new RegExp(`const ${name} = "([^"]*)";`).exec(sw);
    if (!m) throw new Error(`sw.js에 ${name} 없음`);
    return m[1];
  };

  it("알림 제목·본문 = content.json notification.daily_reminder", () => {
    expect(constant("REMINDER_TITLE")).toBe(content.notification.daily_reminder.title);
    expect(constant("REMINDER_BODY")).toBe(content.notification.daily_reminder.body);
  });

  it("알림을 누르면 기록 화면(basePath + ROUTES.record)", () => {
    expect(constant("RECORD_PATH")).toBe(ROUTES.record);
    expect(sw).toContain("const RECORD_URL = `${ORIGIN}${BASE}${RECORD_PATH}`");
  });

  it("basePath는 자기 주소(…/sw.js)에서 떼고, 다른 origin(Supabase·카카오 등)은 절대 다루지 않는다", () => {
    expect(sw).toContain(`self.location.pathname.replace(/\\/sw\\.js$/, "")`);
    expect(SW_PATH).toBe("/sw.js");
    expect(sw).toContain("if (url.origin !== ORIGIN) return;");
    const code = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
    expect(code).not.toMatch(/supabase|kakao|anthropic|onrender/i); // 외부 주소를 알지도, 캐시하지도 않는다
    // 캐시 이름에 판이 있고, 예전 판을 지운다
    expect(sw).toMatch(/const CACHE_VERSION = "onmom-[^"]+";/);
    expect(sw).toContain("self.caches.delete(name)");
    // 서버 본문은 읽지 않는다 — 고정 문구만
    expect(sw).not.toMatch(/event\.data\.(json|text)\(/);
  });
});

// sw.js를 가짜 self(캐시·클라이언트·알림)로 실제 실행해 본다 — 글자 검사가 아니라 동작 검사.
interface FakeResponse {
  ok: boolean;
  status: number;
  type: string;
  redirected: boolean;
  body: string;
  clone(): FakeResponse;
}
function fakeResponse(body: string, extra: Partial<FakeResponse> = {}): FakeResponse {
  const r: FakeResponse = { ok: true, status: 200, type: "basic", redirected: false, body, clone: () => ({ ...r }), ...extra };
  return r;
}
interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}
interface FetchEvent {
  request: FakeRequest;
  respondWith(p: Promise<unknown>): void;
}
function loadServiceWorker(swUrl: string) {
  const sw = readFileSync(join(PUBLIC, SW_PATH), "utf8");
  const listeners = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, FakeResponse>>();
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const fetched: string[] = [];
  let online = true;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (req: FakeRequest, opts?: { ignoreSearch?: boolean }) => {
          const key = opts?.ignoreSearch ? req.url.split("?")[0] : req.url;
          return store.get(key) ?? undefined;
        },
        put: async (req: FakeRequest, res: FakeResponse) => {
          store.set(req.url, res);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: new URL(swUrl),
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    caches,
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async (u: string) => void opened.push(u) },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void notifications.push({ title, options }) },
  };
  const fetch = async (req: FakeRequest) => {
    fetched.push(req.url);
    if (!online) throw new TypeError("Failed to fetch");
    return fakeResponse(`live:${req.url}`, { redirected: req.url.endsWith("/redirected") });
  };
  runInNewContext(sw, { self, fetch, URL }, { filename: "sw.js" });

  const fire = (type: string, event: unknown) => {
    const fn = listeners.get(type);
    if (!fn) throw new Error(`sw.js에 ${type} 리스너 없음`);
    fn(event);
  };
  const request = async (url: string, init: Partial<FakeRequest> = {}) => {
    let responded: Promise<unknown> | null = null;
    const event: FetchEvent = { request: { url, method: "GET", mode: "cors", ...init }, respondWith: (p) => void (responded = p) };
    fire("fetch", event);
    return responded === null ? null : ((await responded) as FakeResponse);
  };
  const waited = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    fire(type, { ...event, waitUntil: (p: Promise<unknown>) => void (pending = p) });
    await pending;
  };
  return { request, waited, stores, notifications, opened, fetched, setOnline: (v: boolean) => void (online = v) };
}

describe("sw.js — 실제 실행(가짜 self)", () => {
  const SITE = "https://5seoyoung.github.io";
  const BASE = `${SITE}${PRODUCTION_BASE_PATH}`;

  it("push → content.json 문구 그대로 알림(서버 본문은 읽지 않음), notificationclick → 기록 화면", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    const data = { json: () => ({ title: "HACK", body: "건강 데이터" }), text: () => "HACK" };
    await w.waited("push", { data });
    expect(w.notifications).toEqual([
      {
        title: content.notification.daily_reminder.title,
        options: expect.objectContaining({ body: content.notification.daily_reminder.body, icon: `${PRODUCTION_BASE_PATH}/icons/icon-192.png`, lang: "ko" }),
      },
    ]);
    let closed = false;
    await w.waited("notificationclick", { notification: { close: () => void (closed = true), data: {} } });
    expect(closed).toBe(true);
    expect(w.opened).toEqual([`${BASE}${ROUTES.record}`]);
  });

  it("basePath는 자기 주소에서 뗀다 — 커스텀 도메인(/sw.js)이면 빈 basePath", async () => {
    const w = loadServiceWorker("https://onmom.example/sw.js");
    await w.waited("notificationclick", { notification: { close: () => undefined, data: {} } });
    expect(w.opened).toEqual([`https://onmom.example${ROUTES.record}`]);
    expect(await w.request("https://onmom.example/_next/static/chunks/a.js")).not.toBeNull();
  });

  it("다른 origin(Supabase·카카오 등)·POST·basePath 밖은 손대지 않는다", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    expect(await w.request("https://movrwmoniopgetdmagon.supabase.co/rest/v1/user_states", { mode: "cors" })).toBeNull();
    expect(await w.request("https://dapi.kakao.com/v2/local/search.json")).toBeNull();
    expect(await w.request(`${BASE}/_next/static/chunks/a.js`, { method: "POST" })).toBeNull();
    expect(await w.request(`${SITE}/other/`, { mode: "navigate" })).toBeNull();
    expect(await w.request(`${SITE}/onmom_webx/`, { mode: "navigate" })).toBeNull(); // 접두만 같은 주소
    expect(await w.request(`${BASE}/some.json`)).toBeNull(); // 정적 파일·이동이 아닌 같은 origin 요청도 캐시하지 않는다
    expect(w.fetched).toEqual([]);
  });

  it("정적 파일(_next/static·icons)은 캐시 먼저 — 두 번째부터 네트워크를 쓰지 않는다", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    const url = `${BASE}/_next/static/chunks/app.js`;
    expect((await w.request(url))?.body).toBe(`live:${url}`);
    w.setOnline(false);
    expect((await w.request(url))?.body).toBe(`live:${url}`);
    expect(w.fetched).toEqual([url]);
    expect([...w.stores.keys()]).toEqual([expect.stringMatching(/^onmom-.+:static$/)]);
  });

  it("HTML 이동은 네트워크 먼저, 오프라인이면 같은 주소(쿼리 무시)의 저장본 — 저장본이 없으면 실패를 그대로(가짜 화면 없음)", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    const settings = `${BASE}/settings/`;
    expect((await w.request(settings, { mode: "navigate" }))?.body).toBe(`live:${settings}`);
    w.setOnline(false);
    expect((await w.request(settings, { mode: "navigate" }))?.body).toBe(`live:${settings}`);
    expect((await w.request(`${settings}?consent=1`, { mode: "navigate" }))?.body).toBe(`live:${settings}`);
    await expect(w.request(`${BASE}/journal/`, { mode: "navigate" })).rejects.toThrow("Failed to fetch");
    expect(w.fetched.filter((u) => u === settings)).toHaveLength(2); // 온라인 때도 늘 네트워크를 먼저 부른다
  });

  it("리다이렉트를 거친 응답은 저장하지 않는다(/home → /home/ 301)", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    await w.request(`${BASE}/home/redirected`, { mode: "navigate" });
    expect([...w.stores.values()].every((s) => s.size === 0)).toBe(true);
  });

  it("activate — 예전 판의 onmom- 캐시만 지우고 남의 캐시는 둔다", async () => {
    const w = loadServiceWorker(`${BASE}/sw.js`);
    w.stores.set("onmom-2000-01-01-1:static", new Map());
    w.stores.set("onmom-2000-01-01-1:pages", new Map());
    w.stores.set("someone-else", new Map());
    await w.request(`${BASE}/icons/icon-192.png`);
    await w.waited("activate", {});
    const names = [...w.stores.keys()];
    expect(names).toContain("someone-else");
    expect(names.filter((n) => n.startsWith("onmom-2000"))).toEqual([]);
    expect(names.filter((n) => /^onmom-.+:static$/.test(n))).toHaveLength(1);
  });
});

describe("reminderView — 설정 화면이 보이는 상태", () => {
  const base: ReminderEnv = { configured: true, serverSession: "server", supported: true, ios: false, standalone: false, permission: "default", subscribed: false };

  it("설정 없는 빌드는 준비 중(지금과 같음)", () => {
    expect(reminderView({ ...base, configured: false })).toEqual({ kind: "comingSoon" });
    expect(reminderView({ ...base, configured: false, permission: "granted", subscribed: true })).toEqual({ kind: "comingSoon" });
  });

  it("iOS Safari 탭(PushManager 없음)은 홈 화면 설치 안내, 설치한 뒤에도 없으면 미지원, 다른 브라우저는 미지원", () => {
    expect(reminderView({ ...base, supported: false, ios: true })).toEqual({ kind: "installHint" });
    expect(reminderView({ ...base, supported: false, ios: true, standalone: true })).toEqual({ kind: "unsupported" });
    expect(reminderView({ ...base, supported: false })).toEqual({ kind: "unsupported" });
  });

  it("권한 거부 → 허용 안내, 그 밖은 토글(켜짐 = 실제 구독)", () => {
    expect(reminderView({ ...base, permission: "denied", subscribed: true })).toEqual({ kind: "denied" });
    expect(reminderView({ ...base, permission: null })).toEqual({ kind: "toggle", on: false });
    expect(reminderView({ ...base, permission: "granted", subscribed: true })).toEqual({ kind: "toggle", on: true });
  });

  it("서버 세션이 없는 게스트(익명 가입 실패 — 이 브라우저 전용)는 토글 대신 까닭 — 켜기를 눌러 실패 안내를 보는 일이 없다", () => {
    expect(reminderView({ ...base, serverSession: "none" })).toEqual({ kind: "needsAccount" });
    // 권한이 이미 허용됐거나 예전 구독이 남아 있어도 켜진 척하지 않는다
    expect(reminderView({ ...base, serverSession: "none", permission: "granted", subscribed: true })).toEqual({ kind: "needsAccount" });
    // 권한 거부보다 먼저(허용해도 켤 수 없으므로)
    expect(reminderView({ ...base, serverSession: "none", permission: "denied" })).toEqual({ kind: "needsAccount" });
    // 설정 없는 빌드·브라우저 미지원이 먼저(iOS Safari 탭은 설치 안내 — 홈 화면 앱은 저장소가 따로라 계정 사정이 달라진다)
    expect(reminderView({ ...base, configured: false, serverSession: "none" })).toEqual({ kind: "comingSoon" });
    expect(reminderView({ ...base, serverSession: "none", supported: false, ios: true })).toEqual({ kind: "installHint" });
    expect(reminderView({ ...base, serverSession: "none", supported: false })).toEqual({ kind: "unsupported" });
  });

  it("서버 세션을 확인하는 동안은 토글(화면이 잠근다 — useReminder ready)", () => {
    expect(reminderView({ ...base, serverSession: "checking" })).toEqual({ kind: "toggle", on: false });
    expect(reminderView({ ...base, serverSession: "checking", permission: "denied" })).toEqual({ kind: "denied" });
  });

  it("안내 문구는 토글이 아닌 상태에만", () => {
    expect(reminderHint({ kind: "toggle", on: true })).toBeNull();
    expect(reminderHint({ kind: "comingSoon" })).toBeNull();
    expect(reminderHint({ kind: "denied" })).toBe(REMINDER_TEXT.denied);
    expect(reminderHint({ kind: "installHint" })).toBe(REMINDER_TEXT.installHint);
    expect(reminderHint({ kind: "unsupported" })).toBe(REMINDER_TEXT.unsupported);
    expect(reminderHint({ kind: "needsAccount" })).toBe(REMINDER_TEXT.needsAccount);
  });

  it("설정 없는 빌드(테스트 환경)에서 ReminderSection은 fallback을 그대로 그린다 — 훅·네트워크 없음", () => {
    expect(isReminderConfigured()).toBe(false);
    const html = renderToStaticMarkup(h(ReminderSection, { fallback: h("p", null, "준비 중") }));
    expect(html).toBe("<p>준비 중</p>");
  });
});

describe("브라우저 판단 · 구독 값", () => {
  it("iPhone·iPad(iPadOS 데스크톱 UA 포함)", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });

  it("푸시 API는 셋(serviceWorker·PushManager·Notification)이 다 있어야", () => {
    expect(pushApiAvailable({ PushManager: {}, Notification: {}, navigator: { serviceWorker: {} } })).toBe(true);
    expect(pushApiAvailable({ Notification: {}, navigator: { serviceWorker: {} } })).toBe(false); // iOS Safari 탭
    expect(pushApiAvailable({ PushManager: {}, Notification: {}, navigator: {} })).toBe(false);
  });

  it("VAPID 공개 키 → 65바이트 비압축 점(0x04)", () => {
    const key = urlBase64ToUint8Array(SAMPLE_PUBLIC_KEY);
    expect(key.length).toBe(65);
    expect(key[0]).toBe(4);
    expect(isVapidPublicKeyShape(SAMPLE_PUBLIC_KEY)).toBe(true);
    expect(isVapidPublicKeyShape("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")).toBe(false); // 비밀 키 모양
    expect(isVapidPublicKeyShape("")).toBe(false);
    expect(sameApplicationServerKey(key.buffer, key)).toBe(true);
    expect(sameApplicationServerKey(null, key)).toBe(false);
    expect(sameApplicationServerKey(key.buffer.slice(1), key)).toBe(false);
  });

  it("구독 행 — 끝점(받는 푸시 서비스)·키가 온전할 때만, 시간대는 모양이 틀리면 Asia/Seoul", () => {
    const keys = { p256dh: SAMPLE_PUBLIC_KEY, auth: "BTBZMqHH6r4Tts7J_aSIgg" };
    expect(subscriptionRow({ endpoint: FCM, keys }, "Asia/Seoul")).toEqual({ endpoint: FCM, ...keys, tz: "Asia/Seoul" });
    expect(subscriptionRow({ endpoint: FCM, keys }, "  ")?.tz).toBe("Asia/Seoul");
    expect(subscriptionRow({ endpoint: FCM, keys }, "Bad tz!")?.tz).toBe("Asia/Seoul");
    expect(subscriptionRow({ endpoint: FCM.replace("https:", "http:"), keys }, "Asia/Seoul")).toBeNull();
    expect(subscriptionRow({ endpoint: "https://push.example/abc", keys }, "Asia/Seoul")).toBeNull(); // 목록 밖 푸시 서비스
    expect(subscriptionRow({ endpoint: FCM, keys: { p256dh: keys.p256dh } }, "Asia/Seoul")).toBeNull();
    expect(subscriptionRow(null, "Asia/Seoul")).toBeNull();
    expect(normalizeTimeZone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimeZone("Etc/GMT+9")).toBe("Etc/GMT+9");
  });

  it("서비스 워커는 운영 빌드에서만 자동 등록", () => {
    expect(shouldAutoRegisterServiceWorker("production", true)).toBe(true);
    expect(shouldAutoRegisterServiceWorker("development", true)).toBe(false);
    expect(shouldAutoRegisterServiceWorker("production", false)).toBe(false);
  });

  it("계정 변화 — 없어지면 signedOut(구독 해지), 다른 계정으로 바로 바뀌면 switched(새 계정에 다시 묶기)", () => {
    expect(accountTransition("guest-1", null)).toBe("signedOut");
    expect(accountTransition(undefined, null)).toBe("none"); // 첫 렌더(로그아웃 상태로 열림)
    expect(accountTransition(undefined, "guest-1")).toBe("none"); // 첫 렌더(로그인 상태로 열림)
    expect(accountTransition(null, "guest-1")).toBe("none"); // 로그인
    expect(accountTransition(null, null)).toBe("none");
    expect(accountTransition("guest-1", "guest-1")).toBe("none");
    // 게스트 → 이미 있던 카카오 계정 전환(session.ts는 null을 거치지 않고 바로 바꾼다 — 익명 사용자와 그 서버 행은 먼저 지워졌다)
    expect(accountTransition("guest-1", "kakao-2")).toBe("switched");
    expect(accountTransition("kakao-1", "kakao-2")).toBe("switched"); // 다른 탭의 로그인
  });

  it("토글의 켜짐 — 브라우저 구독(지금 키) + 서버 행. 행을 확인하지 못했으면(null) 브라우저 상태를 믿는다", () => {
    expect(subscribedState(true, true)).toBe(true);
    expect(subscribedState(true, null)).toBe(true);
    expect(subscribedState(true, false)).toBe(false); // 계정 전환으로 행이 사라졌다 — 서버가 보낼 곳이 없다
    expect(subscribedState(false, true)).toBe(false);
    expect(subscribedState(false, null)).toBe(false);
  });
});

describe("받는 푸시 서비스 — 브라우저·발송 함수·0004 check 제약이 같은 규칙", () => {
  it("브라우저 회사의 푸시 서비스만 통과(FCM·Mozilla·WNS·Apple) — 다른 호스트·IP·포트·사용자 정보·http·경로 없음은 거절", () => {
    for (const ok of [
      FCM,
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABm",
      "https://wns2-sg2p.notify.windows.com/w/?token=BQYAAAB%2b",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://FCM.GOOGLEAPIS.COM/fcm/send/upper",
    ]) {
      expect(isKnownPushService(ok), ok).toBe(true);
      expect(serverRules.isKnownPushService(ok), ok).toBe(true);
    }
    for (const bad of [
      "https://evil.example/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://notfcm.googleapis.comx/x",
      "https://127.0.0.1/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user@fcm.googleapis.com/x",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com/",
      `https://fcm.googleapis.com/${"a".repeat(PUSH_ENDPOINT_MAX_LENGTH)}`,
      "",
    ]) {
      expect(isKnownPushService(bad), bad).toBe(false);
      expect(serverRules.isKnownPushService(bad), bad).toBe(false);
    }
    expect(isKnownPushService(null)).toBe(false);
  });

  it("세 곳의 글자가 같다 — reminderModel.ts · _shared/reminders.ts · 0004의 check 제약(~* = 대소문자 무시)", () => {
    expect(PUSH_ENDPOINT_PATTERN.source).toBe(serverRules.PUSH_ENDPOINT_PATTERN.source);
    expect(PUSH_ENDPOINT_PATTERN.flags).toBe("i");
    expect(serverRules.PUSH_ENDPOINT_PATTERN.flags).toBe("i");
    expect([...PUSH_SERVICE_HOSTS]).toEqual([...serverRules.PUSH_SERVICE_HOSTS]);
    expect(PUSH_ENDPOINT_MAX_LENGTH).toBe(serverRules.PUSH_ENDPOINT_MAX_LENGTH);
    for (const host of PUSH_SERVICE_HOSTS) expect(PUSH_ENDPOINT_PATTERN.source).toContain(host.replace(/\./g, "\\."));
    const sql = read("supabase/migrations/0004_push_reminders.sql");
    expect(sql).toContain(`endpoint ~* '${PUSH_ENDPOINT_PATTERN.source}'`);
    expect(sql).toContain(`length(endpoint) <= ${PUSH_ENDPOINT_MAX_LENGTH}`);
  });
});

// 켜기·끄기·다시 묶기 절차 — 브라우저 PushManager·서버 저장을 가짜로 넣어 돌린다(useReminder·PwaClient가 실제 것을 넣는다)
const KEY = urlBase64ToUint8Array(SAMPLE_PUBLIC_KEY);
const OTHER_KEY = urlBase64ToUint8Array(SAMPLE_PUBLIC_KEY.slice(0, -2) + "AA");
const SUB_KEYS = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };

function fakePush(opts: { existing?: { endpoint: string; key: Uint8Array } | null; newEndpoint?: string; subscribeThrows?: boolean } = {}) {
  const log: string[] = [];
  const make = (endpoint: string, key: Uint8Array): PushSubscriptionLike => ({
    endpoint,
    options: { applicationServerKey: key.slice().buffer },
    toJSON: () => ({ endpoint, keys: SUB_KEYS }),
    unsubscribe: async () => {
      log.push(`unsubscribe:${endpoint}`);
      if (current?.endpoint === endpoint) current = null;
      return true;
    },
  });
  let current: PushSubscriptionLike | null = opts.existing ? make(opts.existing.endpoint, opts.existing.key) : null;
  const manager: PushManagerLike = {
    getSubscription: async () => current,
    subscribe: async ({ applicationServerKey }) => {
      if (opts.subscribeThrows) throw new Error("AbortError");
      log.push("subscribe");
      current = make(opts.newEndpoint ?? `${FCM}-new`, applicationServerKey);
      return current;
    },
  };
  return { manager, log, current: () => current };
}

function saveSpy(result: SaveRowResult = { ok: true }) {
  const saved: PushSubscriptionRow[] = [];
  return { saved, save: async (row: PushSubscriptionRow) => (saved.push(row), result) };
}

describe("enableReminder — 권한 → 구독 → 서버 저장, 실패하면 켜진 척하지 않는다", () => {
  it("권한이 허용되지 않으면(default·denied) 워커도 구독도 만들지 않는다", async () => {
    for (const answer of ["default", "denied"] as const) {
      let asked = 0;
      const push = fakePush();
      const r = await enableReminder({
        applicationServerKey: KEY,
        requestPermission: async () => answer,
        pushManager: async () => (asked++, push.manager),
        timeZone: () => "Asia/Seoul",
        save: saveSpy().save,
      });
      expect(r).toEqual({ kind: "permission", permission: answer });
      expect(asked).toBe(0);
      expect(push.log).toEqual([]);
    }
  });

  it("성공 — 새 구독을 만들어 끝점·키·시간대를 저장", async () => {
    const push = fakePush();
    const spy = saveSpy();
    const r = await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => push.manager, timeZone: () => "America/New_York", save: spy.save });
    expect(r).toEqual({ kind: "enabled" });
    expect(push.log).toEqual(["subscribe"]);
    expect(spy.saved).toEqual([{ endpoint: `${FCM}-new`, ...SUB_KEYS, tz: "America/New_York" }]);
  });

  it("서버 저장이 실패하면 방금 만든 구독을 풀고 failed(토글은 꺼짐)", async () => {
    const push = fakePush();
    const r = await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => push.manager, timeZone: () => null, save: saveSpy({ ok: false, reason: "failed" }).save });
    expect(r).toEqual({ kind: "failed", reason: "failed" });
    expect(push.log).toEqual(["subscribe", `unsubscribe:${FCM}-new`]);
    expect(push.current()).toBeNull();
  });

  it("VAPID 키를 바꿨으면 예전 구독을 풀고 새로 만든다 · 같은 키면 그대로 쓴다", async () => {
    const rotated = fakePush({ existing: { endpoint: `${FCM}-old`, key: OTHER_KEY } });
    const spy = saveSpy();
    await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => rotated.manager, timeZone: () => null, save: spy.save });
    expect(rotated.log).toEqual([`unsubscribe:${FCM}-old`, "subscribe"]);
    expect(spy.saved.map((r) => r.endpoint)).toEqual([`${FCM}-new`]);

    const same = fakePush({ existing: { endpoint: `${FCM}-kept`, key: KEY } });
    const spy2 = saveSpy();
    await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => same.manager, timeZone: () => null, save: spy2.save, rowExists: async () => null });
    expect(same.log).toEqual([]);
    expect(spy2.saved.map((r) => r.endpoint)).toEqual([`${FCM}-kept`]);
  });

  it("서버 행이 없는 예전 구독(다른 사용자의 행·만료되어 지워짐)은 다시 쓰지 않고 새 끝점으로", async () => {
    const push = fakePush({ existing: { endpoint: `${FCM}-orphan`, key: KEY } });
    const spy = saveSpy();
    const r = await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => push.manager, timeZone: () => null, save: spy.save, rowExists: async () => false });
    expect(r).toEqual({ kind: "enabled" });
    expect(push.log).toEqual([`unsubscribe:${FCM}-orphan`, "subscribe"]);
    expect(spy.saved.map((r) => r.endpoint)).toEqual([`${FCM}-new`]);
  });

  it("받는 목록 밖 푸시 서비스면 저장하지 않고 구독을 푼다 → unsupportedService", async () => {
    const push = fakePush({ newEndpoint: "https://push.other-browser.example/x" });
    const spy = saveSpy();
    const r = await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => push.manager, timeZone: () => null, save: spy.save });
    expect(r).toEqual({ kind: "unsupportedService" });
    expect(spy.saved).toEqual([]);
    expect(push.current()).toBeNull();
  });

  it("워커 등록 실패·구독 예외는 failed(아무것도 저장하지 않음)", async () => {
    const spy = saveSpy();
    expect(await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => null, timeZone: () => null, save: spy.save })).toEqual({ kind: "failed", reason: "register" });
    const push = fakePush({ subscribeThrows: true });
    expect(await enableReminder({ applicationServerKey: KEY, requestPermission: async () => "granted", pushManager: async () => push.manager, timeZone: () => null, save: spy.save })).toEqual({ kind: "failed", reason: "subscribe" });
    expect(spy.saved).toEqual([]);
  });
});

describe("disableReminder · rebindReminder", () => {
  it("끄기 — 서버 행을 먼저 지우고(세션이 살아 있을 때) 구독을 푼다 · 구독이 없으면 nothing", async () => {
    const push = fakePush({ existing: { endpoint: `${FCM}-on`, key: KEY } });
    const order: string[] = [];
    const r = await disableReminder({
      currentSubscription: async () => push.current(),
      deleteRow: async (endpoint) => (order.push(`delete:${endpoint}`), true),
    });
    expect(r).toEqual({ kind: "disabled", rowDeleted: true });
    expect([...order, ...push.log]).toEqual([`delete:${FCM}-on`, `unsubscribe:${FCM}-on`]);
    expect(await disableReminder({ currentSubscription: async () => null, deleteRow: async () => true })).toEqual({ kind: "nothing" });
  });

  it("끄기 — 행 삭제가 실패해도 구독은 푼다(푼 끝점은 다음 발송 때 410으로 서버가 지운다)", async () => {
    const push = fakePush({ existing: { endpoint: `${FCM}-on`, key: KEY } });
    expect(await disableReminder({ currentSubscription: async () => push.current(), deleteRow: async () => false })).toEqual({ kind: "disabled", rowDeleted: false });
    expect(push.current()).toBeNull();
  });

  it("계정 전환 — 구독을 새 계정의 행으로 저장(rebound), 저장 실패(다른 사용자의 행 — RLS)·키 불일치·설정 없음이면 푼다(dropped)", async () => {
    const ok = fakePush({ existing: { endpoint: `${FCM}-dev`, key: KEY } });
    const spy = saveSpy();
    expect(await rebindReminder({ applicationServerKey: KEY, currentSubscription: async () => ok.current(), timeZone: () => "Asia/Seoul", save: spy.save })).toBe("rebound");
    expect(spy.saved).toEqual([{ endpoint: `${FCM}-dev`, ...SUB_KEYS, tz: "Asia/Seoul" }]);
    expect(ok.current()).not.toBeNull();

    const rls = fakePush({ existing: { endpoint: `${FCM}-dev`, key: KEY } });
    expect(await rebindReminder({ applicationServerKey: KEY, currentSubscription: async () => rls.current(), timeZone: () => null, save: saveSpy({ ok: false, reason: "failed" }).save })).toBe("dropped");
    expect(rls.current()).toBeNull();

    const rotated = fakePush({ existing: { endpoint: `${FCM}-dev`, key: OTHER_KEY } });
    const spy2 = saveSpy();
    expect(await rebindReminder({ applicationServerKey: KEY, currentSubscription: async () => rotated.current(), timeZone: () => null, save: spy2.save })).toBe("dropped");
    expect(spy2.saved).toEqual([]);

    const unconfigured = fakePush({ existing: { endpoint: `${FCM}-dev`, key: KEY } });
    expect(await rebindReminder({ applicationServerKey: null, currentSubscription: async () => unconfigured.current(), timeZone: () => null, save: saveSpy().save })).toBe("dropped");
    expect(unconfigured.current()).toBeNull();

    expect(await rebindReminder({ applicationServerKey: KEY, currentSubscription: async () => null, timeZone: () => null, save: saveSpy().save })).toBe("nothing");
  });
});

describe("검색 노출(robots)", () => {
  it("기본(NEXT_PUBLIC_SITE_INDEXABLE 없음)은 서비스 소개도 앱 화면도 noindex", () => {
    expect(config.siteIndexable).toBe(false);
    expect(robotsFor("landing")).toEqual({ index: false, follow: false });
    expect(robotsFor("app")).toEqual({ index: false, follow: false });
  });

  it("서비스 소개 페이지만 robotsFor(\"landing\")을 쓴다 — 스위치가 서비스 소개에 닿고, 다른 공개 화면은 레이아웃의 noindex를 물려받는다", () => {
    expect(read("src/app/page.tsx")).toContain('robots: robotsFor("landing")');
    for (const page of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx", "src/app/admin/page.tsx", "src/app/login/page.tsx"]) {
      expect(read(page), page).not.toContain('robotsFor("landing")');
    }
  });
});
