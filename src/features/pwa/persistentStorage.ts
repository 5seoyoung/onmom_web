// 브라우저 저장소 지속(persist) 요청 — 앱을 열 때 한 번(PwaClient).
//
// Safari(ITP)는 스크립트가 쓴 저장소(localStorage·IndexedDB)를 7일 동안 쓰지 않으면 지울 수 있다. 앱 상태(기록·일지·설정)가 그
// 저장소에 있으므로, 브라우저가 지원하면 navigator.storage.persist()로 "지우지 말아 달라"고 요청한다.
// - 이미 지속(persisted() = true)이면 다시 요청하지 않는다.
// - 우리 화면(안내·버튼)은 띄우지 않는다. 허락 여부는 브라우저가 정한다(Chrome·Safari는 묻지 않고 정하고, Firefox는 브라우저 자체의
//   권한 창을 띄울 수 있다 — 거절이면 그대로 둔다).
// - 결과와 관계없이 앱은 똑같이 움직인다. 던지지 않고, 네트워크 요청도 없다.

/** navigator.storage 중 여기서 쓰는 부분 — 테스트는 가짜를 넣는다. */
export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

/** unsupported = API 없음, already = 이미 지속, granted/denied = 이번 요청의 결과, failed = 오류(삼킴) */
export type PersistOutcome = "unsupported" | "already" | "granted" | "denied" | "failed";

/** persisted()가 false일 때만 persist()를 부른다. 절대 던지지 않는다. */
export async function requestPersistentStorage(storage: StorageManagerLike | null | undefined): Promise<PersistOutcome> {
  try {
    if (!storage || typeof storage.persisted !== "function" || typeof storage.persist !== "function") return "unsupported";
    if ((await storage.persisted()) === true) return "already";
    return (await storage.persist()) === true ? "granted" : "denied";
  } catch {
    return "failed";
  }
}

function browserStorage(): StorageManagerLike | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator.storage as StorageManagerLike | undefined);
}

let once: Promise<PersistOutcome> | null = null;

/** 앱이 살아 있는 동안 한 번만 요청한다(개발 모드의 effect 두 번 실행·다시 마운트에도). 서버 렌더링에서는 "unsupported". */
export function requestPersistentStorageOnce(getStorage: () => StorageManagerLike | null | undefined = browserStorage): Promise<PersistOutcome> {
  if (once === null) {
    let storage: StorageManagerLike | null | undefined;
    try {
      storage = getStorage();
    } catch {
      storage = undefined;
    }
    once = requestPersistentStorage(storage);
  }
  return once;
}
