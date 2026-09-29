// 브라우저 API 감싸기 — 서비스 워커 등록·푸시 구독 읽기/풀기. 모두 실패해도 던지지 않고 null/false를 돌려준다(화면이 정직한 상태를 고른다).
// 서버 렌더링·지원하지 않는 브라우저에서는 아무것도 하지 않는다.

import { pushApiAvailable } from "./reminderModel";
import { serviceWorkerScope, serviceWorkerUrl } from "./pwaAssets";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && pushApiAvailable(window as unknown as Parameters<typeof pushApiAvailable>[0]);
}

/** 서비스 워커 등록(이미 등록돼 있으면 그 등록을 돌려준다). 실패하면 null. */
export async function registerServiceWorker(basePath: string): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(serviceWorkerUrl(basePath), { scope: serviceWorkerScope(basePath) });
  } catch {
    return null;
  }
}

/** 이 사이트 범위의 등록 — 없으면 null(네트워크 없음). */
export async function getServiceWorkerRegistration(basePath: string): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration(serviceWorkerScope(basePath))) ?? null;
  } catch {
    return null;
  }
}

/** 활성 워커가 생길 때까지 기다린다 — 구독은 활성 워커가 있어야 만들 수 있다. */
export async function waitForActiveWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;
  return navigator.serviceWorker.ready;
}

/** 이 브라우저의 푸시 구독(있으면). */
export async function currentPushSubscription(basePath: string): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration(basePath);
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** 이 브라우저의 푸시 구독을 푼다(서버 행은 건드리지 않는다 — 로그아웃 뒤에는 세션이 없어 지울 수 없고, 서버가 410으로 알아서 지운다). */
export async function unsubscribeLocalPush(basePath: string): Promise<boolean> {
  const subscription = await currentPushSubscription(basePath);
  if (!subscription) return false;
  try {
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}
