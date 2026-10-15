// 브라우저 싱글턴 스토어 — localStorage + 다른 탭 변경 감지(storage 이벤트, 페이지가 다시 보일 때). 만들기만 해서는 저장소에 손대지 않는다
// (서버 렌더링 중에 만들어져도 안전하다 — 읽기는 첫 구독 때).

import { createAppStore, type AppStore } from "./appStore";
import { randomId } from "./ids";
import { browserLocalStorage, createStoragePersistence, watchBrowserStorage, watchPageResume } from "./persistence";
import { clearServiceWorkerCaches } from "./siteCaches";

let browserStore: AppStore | null = null;

export function getBrowserStore(): AppStore {
  browserStore ??= createAppStore({
    persistence: createStoragePersistence(browserLocalStorage),
    now: () => new Date(),
    newId: randomId,
    watchExternalChanges: watchBrowserStorage,
    watchResume: watchPageResume,
    // 계정 삭제 때 서비스 워커 캐시(연 화면의 주소 — /journal/post/?id=… 등)도 지운다
    clearSiteCaches: () => clearServiceWorkerCaches(),
  });
  return browserStore;
}
