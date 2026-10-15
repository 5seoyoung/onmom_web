// 글자 입력 칸의 저장을 모은다 — 입력이 멈춘 뒤 한 번 저장한다(useDraftField가 쓴다).
// 글자마다 스토어 action을 부르면 상태 전체를 localStorage에 쓰고(appStore commit) 서버 동기화도 예약한다(store/sync/engine).
// 기다리는 동안 칸을 떠나거나·검색하거나·화면을 떠나면(flush) 기다리지 않고 바로 저장한다 — 입력을 잃지 않게.
// React를 모르는 순수 로직이라 가짜 시계로 시험한다(draftSaver.test.ts).

/** 입력이 이만큼 멈추면 저장한다 */
export const DRAFT_SAVE_DELAY_MS = 400;

export interface DraftSaver {
  /** 입력이 바뀌었다 — delayMs 뒤에 저장한다(그사이 또 바뀌면 다시 기다린다) */
  change(value: string): void;
  /** 기다리는 값이 있으면 지금 저장한다(없으면 아무것도 하지 않는다) */
  flush(): void;
  /** 아직 저장하지 않은 값이 있는가 */
  pending(): boolean;
  /** 저장할 함수를 바꾼다(화면이 렌더마다 새 함수를 넘긴다 — 저장할 때는 마지막 것을 쓴다) */
  setSave(save: (value: string) => void): void;
}

/** save가 아직 없으면(null) 저장할 함수를 받을 때까지 입력을 들고 있는다(setSave). */
export function createDraftSaver(save: ((value: string) => void) | null, delayMs: number = DRAFT_SAVE_DELAY_MS): DraftSaver {
  let saveFn = save;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 아직 저장하지 않은 값 — null이면 없다 */
  let unsaved: string | null = null;

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (unsaved === null || saveFn === null) return;
    const value = unsaved;
    unsaved = null;
    saveFn(value);
  }

  return {
    setSave(next) {
      saveFn = next;
    },
    change(value) {
      unsaved = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    pending: () => unsaved !== null,
  };
}
