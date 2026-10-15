// 서비스 워커(public/sw.js)가 만든 Cache Storage 항목 지우기 — 계정 삭제 때(appStore deleteAccount → 브라우저 스토어의 clearSiteCaches).
// sw.js는 한 번 연 화면의 HTML을 경로만으로(쿼리 없이, 로그인 콜백은 빼고) "onmom-<판>:pages"에, 정적 파일을 "onmom-<판>:static"에 둔다.
// 계정을 지우면 이 브라우저에 그 주소들이 남지 않게 함께 지운다(localStorage의 "onmom.web." 키는 persistence.eraseAll이 지운다).
// 같은 origin의 다른 앱(GitHub Pages의 다른 저장소 등) 캐시는 건드리지 않는다 — 이름 접두(sw.js CACHE_PREFIX)로 거른다.
// 기능 감지: Cache Storage가 없거나(서버 렌더링·안전하지 않은 주소·오래된 브라우저) 막혀 있으면 아무것도 하지 않는다. 던지지 않는다.
// 부르는 쪽은 기다리지 않는다 — 캐시를 지우지 못해도 계정 삭제는 그대로 끝난다(지운 sw.js 캐시는 다음에 열 때 다시 채워진다).

/** sw.js의 CACHE_PREFIX와 같다(siteCaches.test가 sw.js 원문과 대조한다) */
export const SW_CACHE_PREFIX = "onmom-";

/** window.caches(CacheStorage)에서 쓰는 모양만 — 테스트는 가짜를 넣는다 */
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

/** 브라우저의 Cache Storage — 없거나 막혀 있으면 null */
export function browserCacheStorage(): CacheStorageLike | null {
  try {
    return typeof caches === "undefined" ? null : caches;
  } catch {
    return null; // SecurityError 등
  }
}

/** 이 사이트의 서비스 워커 캐시를 지운다. 지운 캐시 수를 돌려준다(못 지운 것은 세지 않는다). 던지지 않는다. */
export async function clearServiceWorkerCaches(storage: CacheStorageLike | null = browserCacheStorage()): Promise<number> {
  if (storage === null) return 0;
  try {
    const names = await storage.keys();
    const deleted = await Promise.all(
      names.filter((name) => name.startsWith(SW_CACHE_PREFIX)).map((name) => storage.delete(name).catch(() => false)),
    );
    return deleted.filter(Boolean).length;
  } catch {
    return 0; // 목록을 읽지 못했다(사생활 보호 모드 등) — 지울 것도 모른다
  }
}
