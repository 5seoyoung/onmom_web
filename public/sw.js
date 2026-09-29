/* global self */
// 온맘 서비스 워커 — 정적 파일 캐시 + 매일 리마인더(웹 푸시). 설명: docs/PWA_AND_REMINDERS.md
//
// 주소: `${basePath}/sw.js` (GitHub Pages는 /onmom_web/sw.js, 커스텀 도메인은 /sw.js). basePath는 이 파일의 주소에서 뗀다 —
//       하드코딩하지 않아 도메인을 바꿔도 이 파일은 그대로다. 등록은 src/features/pwa/PwaClient.tsx(운영 빌드에서만).
//
// 캐시 규칙
// - `${basePath}/_next/static/*`·`${basePath}/icons/*`: 캐시 먼저(내용이 바뀌면 파일 이름도 바뀌는 정적 파일).
// - HTML 이동(navigate): 네트워크 먼저. 성공한 응답만 저장해 두었다가, 오프라인이면 같은 주소의 저장본을 준다(한 번 연 화면만).
//   저장본도 없으면 브라우저의 오프라인 화면이 그대로 뜬다(가짜 화면을 만들지 않는다).
// - 그 밖(같은 origin의 나머지·다른 origin 전부 — Supabase·카카오·Anthropic·영상 서버): 손대지 않는다(캐시 없음). 건강 데이터가
//   담긴 응답이 이 캐시에 남지 않게 하려는 것이다.
// - 캐시 이름에 판이 있다(CACHE_VERSION). 새 판이 활성화되면 예전 판의 캐시를 지운다.
//
// 푸시 알림
// - 알림 문구는 content.json `notification.daily_reminder`의 원문을 그대로 옮긴 상수다(src/features/pwa/pwa.test.ts가 같은지 확인).
//   서버가 보낸 본문은 화면에 쓰지 않는다 — 서버가 무엇을 보내든 이 문구만 보인다(건강 데이터가 알림에 실릴 길이 없다).
// - 알림을 누르면 기록 화면(`${basePath}/record/` = ROUTES.record)을 연다. 열린 창이 있으면 그 창을 앞으로.
"use strict";

const CACHE_VERSION = "onmom-2026-09-29-1";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const PAGES_CACHE = `${CACHE_VERSION}:pages`;
const CACHE_PREFIX = "onmom-";

/** "/onmom_web/sw.js" → "/onmom_web", "/sw.js" → "" */
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const ORIGIN = self.location.origin;

// 원문: content.json notification.daily_reminder (NotificationManager.swift:22-23)
const REMINDER_TITLE = "오늘의 회복 체크";
const REMINDER_BODY = "이상 증상이 있었나요? 1분이면 빠르게 확인할 수 있어요.";
const REMINDER_TAG = "onmom-daily-reminder";
/** ROUTES.record — 알림을 누르면 여는 화면 */
const RECORD_PATH = "/record/";
const RECORD_URL = `${ORIGIN}${BASE}${RECORD_PATH}`;
const ICON_URL = `${BASE}/icons/icon-192.png`;

function isStaticAsset(pathname) {
  return pathname.startsWith(`${BASE}/_next/static/`) || pathname.startsWith(`${BASE}/icons/`);
}

/** 저장해도 되는 응답 — 같은 origin(basic)의 200만. 리다이렉트를 거친 응답(예: /home → /home/)·불투명 응답·오류는 저장하지 않는다. */
function cacheable(response) {
  return Boolean(response) && response.ok && response.status === 200 && response.type === "basic" && response.redirected !== true;
}

async function cacheFirst(request) {
  const cache = await self.caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await self.caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (cacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // 쿼리(?id=…)가 달라도 같은 정적 HTML이다(정적 export). 저장본이 없으면 브라우저의 오프라인 화면으로.
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  // 새 판은 기다리지 않고 바로 활성화한다 — HTML은 네트워크 먼저라 예전 판의 캐시에 묶이지 않는다.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await self.caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !name.startsWith(`${CACHE_VERSION}:`))
          .map((name) => self.caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // 다른 origin(Supabase·카카오·Anthropic·영상 서버 등)은 절대 다루지 않는다.
  if (url.origin !== ORIGIN) return;
  if (!(url.pathname === `${BASE}/` || url.pathname.startsWith(`${BASE}/`))) return;
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("push", (event) => {
  // 서버 본문(payload)은 읽지 않는다 — 고정 문구만 보인다.
  event.waitUntil(
    self.registration.showNotification(REMINDER_TITLE, {
      body: REMINDER_BODY,
      icon: ICON_URL,
      tag: REMINDER_TAG,
      lang: "ko",
      data: { url: RECORD_URL },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(`${ORIGIN}${BASE}/`));
      if (open) {
        try {
          await open.focus();
        } catch {
          // 초점을 못 줘도 이동은 시도한다
        }
        if (typeof open.navigate === "function") {
          try {
            await open.navigate(RECORD_URL);
            return;
          } catch {
            // 이 워커가 제어하지 않는 창은 navigate가 거부된다 — 앞으로 가져온 것으로 충분하다
          }
        }
        return;
      }
      await self.clients.openWindow(RECORD_URL);
    })(),
  );
});

// 푸시 서비스가 구독을 갈아 끼우면(pushsubscriptionchange) 새 구독을 서버에 알려야 하지만, 워커에는 로그인 세션이 없다.
// 다음에 앱을 열면 설정 화면의 토글이 실제 구독 상태를 그대로 보이므로(꺼짐), 사용자가 다시 켤 수 있다.
