import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { initialState } from "./defaults";
import { createAppStore, rootScreenFor } from "./appStore";
import {
  ACCOUNT_KEY,
  GUEST_ID_KEY,
  STATE_KEY,
  createMemoryStorage,
  createStoragePersistence,
  type StorageLike,
} from "./persistence";

const NOW = new Date("2026-09-23T21:30:00+09:00");

function setup<T extends StorageLike | null = StorageLike>(storage: T = createMemoryStorage() as T) {
  let n = 0;
  const store = createAppStore({
    persistence: createStoragePersistence(() => storage),
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { store, storage };
}

function saved(storage: StorageLike) {
  const raw = storage.getItem(STATE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/** 쓰기가 전부 실패하는 저장소(용량 초과·사생활 보호 모드) */
function failingStorage(): StorageLike {
  const inner = createMemoryStorage();
  return {
    get length() {
      return inner.length;
    },
    key: (i) => inner.key(i),
    getItem: (k) => inner.getItem(k),
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
    removeItem: (k) => inner.removeItem(k),
  };
}

describe("로드·하이드레이션", () => {
  it("구독 전에는 저장소를 읽지 않은 스냅샷(서버 스냅샷과 같은 객체)", () => {
    const { store } = setup();
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(store.getSnapshot().hydrated).toBe(false);
    expect(rootScreenFor(store.getSnapshot())).toBe("loading");
  });

  it("첫 구독에서 읽고 알린다 — 스냅샷은 바뀔 때만 새 객체", () => {
    const { store } = setup();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    expect(calls).toBe(1);
    const snap = store.getSnapshot();
    expect(snap.hydrated).toBe(true);
    expect(store.getSnapshot()).toBe(snap);
    expect(store.getServerSnapshot().hydrated).toBe(false);
    expect(rootScreenFor(snap)).toBe("login");
    unsubscribe();
  });

  it("iOS 모양 JSON(Double 날짜)도 읽고, 계정이 없으면 로그인 화면", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ hasOnboarded: true, profile: { deliveryDate: 779760000.0 } }));
    const { store } = setup(storage);
    store.load();
    expect(store.getSnapshot().state.profile.deliveryDate).toBe("2025-09-17");
    expect(store.getSnapshot().account).toBeNull();
  });

  it("손상된 JSON이면 초기 상태로 시작(throw 없음)", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, "{not json");
    storage.setItem(ACCOUNT_KEY, "][");
    const { store } = setup(storage);
    store.load();
    expect(store.getSnapshot().state).toEqual(initialState());
    expect(store.getSnapshot().account).toBeNull();
  });

  it("열 때 계정이 있으면 데이터를 묶는다 — 주인 없는 데이터는 귀속", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ hasOnboarded: true }));
    storage.setItem(ACCOUNT_KEY, JSON.stringify({ id: "kakao-1", name: null, provider: "kakao" }));
    const { store } = setup(storage);
    store.load();
    expect(store.getSnapshot().state.ownerAccountID).toBe("kakao-1");
    expect(saved(storage).ownerAccountID).toBe("kakao-1");
    expect(rootScreenFor(store.getSnapshot())).toBe("main");
  });

  it("열 때 계정과 주인이 다르면(실제 계정 A 데이터 + 로그인 B) 지운다", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ hasOnboarded: true, ownerAccountID: "kakao-A" }));
    storage.setItem(ACCOUNT_KEY, JSON.stringify({ id: "kakao-B", provider: "kakao" }));
    const { store } = setup(storage);
    store.load();
    expect(store.getSnapshot().state).toEqual({ ...initialState(), ownerAccountID: "kakao-B" });
    expect(store.getSnapshot().account?.id).toBe("kakao-B");
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY)!).id).toBe("kakao-B");
  });
});

describe("게스트·로그인·로그아웃", () => {
  it("게스트 id는 브라우저당 한 번 — 로그아웃 후 다시 게스트로 와도 같은 id·같은 데이터", () => {
    const { store, storage } = setup();
    store.actions.signInGuest();
    const id = store.getSnapshot().account!.id;
    expect(id).toBe("guest-id-1");
    expect(storage.getItem(GUEST_ID_KEY)).toBe(id);
    expect(store.getSnapshot().state.ownerAccountID).toBe(id);

    store.actions.completeOnboarding();
    store.actions.signOut();
    expect(store.getSnapshot().account).toBeNull();
    expect(storage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(store.getSnapshot().state.hasOnboarded).toBe(true); // 로그아웃은 삭제가 아니다

    store.actions.signInGuest();
    expect(store.getSnapshot().account!.id).toBe(id);
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
  });

  it("게스트로 쓰다 카카오 로그인 → 데이터 귀속(보존)", () => {
    const { store, storage } = setup();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    store.actions.signIn({ id: "kakao-1", name: "민지", provider: "kakao" });
    const snap = store.getSnapshot();
    expect(snap.state.hasOnboarded).toBe(true);
    expect(snap.state.ownerAccountID).toBe("kakao-1");
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY)!)).toEqual({ id: "kakao-1", name: "민지", provider: "kakao" });
  });

  it("실제 계정 데이터에 게스트가 들어오면 삭제 — 게스트 id도 폐기되어 다음 게스트는 새 id", () => {
    const { store, storage } = setup();
    storage.setItem("onmom.web.reminder.on", "true"); // 다른 모듈의 설정값도 함께 지워진다
    store.actions.signIn({ id: "kakao-A", name: null, provider: "kakao" });
    store.actions.completeOnboarding();
    store.actions.updateProfile({ deliveryDate: "2026-07-17" });
    store.actions.signOut();

    store.actions.signInGuest();
    const g1 = store.getSnapshot().account!.id;
    expect(store.getSnapshot().state).toEqual({ ...initialState(), ownerAccountID: g1 });
    expect(storage.getItem(GUEST_ID_KEY)).toBeNull();
    expect(storage.getItem("onmom.web.reminder.on")).toBeNull();
    expect(JSON.parse(storage.getItem(ACCOUNT_KEY)!).id).toBe(g1); // 로그인은 유지(iOS는 여기서 계정 키까지 지워 재실행 시 로그아웃됐다)
    expect(saved(storage).ownerAccountID).toBe(g1);

    // 같은 사람이 로그아웃 후 다시 게스트로 → 새 id지만 게스트 소유 데이터라 보존
    store.actions.updateProfile({ neighborhood: "서울 노원구" });
    store.actions.signOut();
    store.actions.signInGuest();
    const g2 = store.getSnapshot().account!.id;
    expect(g2).not.toBe(g1);
    expect(store.getSnapshot().state.profile.neighborhood).toBe("서울 노원구");
  });

  it("다른 실제 계정이 들어오면 이전 사람의 건강 데이터 삭제", () => {
    const { store } = setup();
    store.actions.signIn({ id: "kakao-A", name: null, provider: "kakao" });
    store.actions.addSymptomRecord({
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: true,
      painNrs: 3,
      redFlagCode: "fever_infection",
      postpartumDays: 63,
    });
    store.actions.signOut();
    store.actions.signIn({ id: "kakao-B", name: null, provider: "kakao" });
    expect(store.getSnapshot().state.symptomHistory).toEqual([]);
  });

  it("id 없는 계정으로는 로그인하지 않는다", () => {
    const { store } = setup();
    store.actions.signIn({ id: "", name: null, provider: "kakao" });
    expect(store.getSnapshot().account).toBeNull();
  });
});

describe("계정 삭제", () => {
  it("onmom.web. 키 전부 삭제 → 로그인 화면, 다음 게스트는 새 id", () => {
    const { store, storage } = setup();
    storage.setItem("other.app", "keep");
    store.actions.signInGuest();
    const g1 = store.getSnapshot().account!.id;
    store.actions.completeOnboarding();
    store.actions.deleteAccount();

    expect(store.getSnapshot().state).toEqual(initialState());
    expect(store.getSnapshot().account).toBeNull();
    expect(rootScreenFor(store.getSnapshot())).toBe("login");
    expect(storage.getItem(STATE_KEY)).toBeNull();
    expect(storage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(storage.getItem(GUEST_ID_KEY)).toBeNull();
    expect(storage.getItem("other.app")).toBe("keep");

    store.actions.signInGuest();
    expect(store.getSnapshot().account!.id).not.toBe(g1);
  });
});

describe("action과 저장", () => {
  it("변경마다 저장하고, 다시 읽으면 같은 상태", () => {
    const { store, storage } = setup();
    store.actions.signInGuest();
    store.actions.updateProfile({ deliveryDate: "2026-07-17", deliveryMethod: "cesarean", goal: "homemaker" });
    store.actions.updateMaternity({ diastasisRecti: true });
    const rec = store.actions.addSymptomRecord({
      lochiaIncreased: false,
      lochiaRed: false,
      feverEvent: false,
      painNrs: 2,
      redFlagCode: null,
      postpartumDays: 68,
    });
    expect(rec.date).toBe(NOW.toISOString());
    const mood = store.actions.addMoodCheck({ questionID: 2, answer: "yes" });
    store.actions.snoozeMoodCard();
    const postId = store.actions.addPost({ title: " 첫 산책 ", body: "좋았다" });
    expect(postId).not.toBeNull();
    expect(store.actions.addComment(postId!, "댓글")).toBe(true);
    store.actions.completeOnboarding();

    const snap = store.getSnapshot();
    expect(snap.state.symptomHistory[0]).toEqual(rec);
    expect(snap.state.moodChecks[0]).toEqual(mood);
    expect(snap.state.communityPosts[0]).toMatchObject({ title: "첫 산책", authorName: "게스트" });
    expect(snap.state.communityPosts[0].comments[0].authorName).toBe("게스트");
    expect(saved(storage)).toEqual(snap.state);

    const reopened = createAppStore({
      persistence: createStoragePersistence(() => storage),
      now: () => NOW,
      newId: () => "unused",
    });
    reopened.load();
    expect(reopened.getSnapshot().state).toEqual(snap.state);
    expect(reopened.getSnapshot().account).toEqual(snap.account);
  });

  it("거부된 글·댓글은 저장하지 않고 null/false", () => {
    const { store } = setup();
    store.actions.signInGuest();
    const before = store.getSnapshot();
    expect(store.actions.addPost({ title: "   ", body: "내용" })).toBeNull();
    expect(store.actions.addComment("없는글", "댓글")).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });

  it("로드 전에 action이 와도 저장된 데이터를 덮어쓰지 않는다", () => {
    const storage = createMemoryStorage();
    storage.setItem(STATE_KEY, JSON.stringify({ hasOnboarded: true, profile: { neighborhood: "회기동" } }));
    const { store } = setup(storage);
    store.actions.updateMaternity({ gdm: true });
    expect(saved(storage).profile.neighborhood).toBe("회기동");
    expect(saved(storage).maternity.gdm).toBe(true);
  });
});

describe("저장소를 못 쓰는 환경", () => {
  it("쓰기가 실패해도 메모리에서 동작하고 storageAvailable=false", () => {
    const { store } = setup(failingStorage());
    store.load();
    expect(store.getSnapshot().storageAvailable).toBe(false);
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    expect(store.getSnapshot().account?.provider).toBe("guest");
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    // 저장이 막혀도 이 탭에서는 같은 게스트 id를 쓴다
    const id = store.getSnapshot().account!.id;
    store.actions.signOut();
    store.actions.signInGuest();
    expect(store.getSnapshot().account!.id).toBe(id);
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
  });

  it("상태 저장이 실패하면 계정 쓰기가 성공해도 storageAvailable=false로 남는다", () => {
    // 큰 상태만 용량 초과 — 작은 계정·게스트 id 쓰기는 된다
    const inner = createMemoryStorage();
    const quotaOnState: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => {
        if (k === STATE_KEY) throw new DOMException("quota", "QuotaExceededError");
        inner.setItem(k, v);
      },
      removeItem: (k) => inner.removeItem(k),
    };
    const { store } = setup(quotaOnState);
    store.load();
    expect(store.getSnapshot().storageAvailable).toBe(true); // 아직 저장한 적 없음 — 쓰기는 된다
    store.actions.signInGuest();
    expect(store.getSnapshot().storageAvailable).toBe(false);
    const id = store.getSnapshot().account!.id;

    store.actions.signOut(); // 계정 키 삭제는 성공
    expect(store.getSnapshot().storageAvailable).toBe(false);
    store.actions.signIn({ id, name: null, provider: "guest" }); // 같은 주인 — 계정만 저장
    expect(store.getSnapshot().storageAvailable).toBe(false);

    // 계정 삭제로 저장소를 비우면 저장소 = 초기 상태라 다시 true
    store.actions.deleteAccount();
    expect(store.getSnapshot().storageAvailable).toBe(true);
  });

  it("저장소 자체가 없거나(서버·차단) 읽기가 throw해도 동작", () => {
    const { store } = setup(null);
    store.actions.signInGuest();
    expect(store.getSnapshot().storageAvailable).toBe(false);
    expect(store.getSnapshot().account?.provider).toBe("guest");

    const throwing: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const b = setup(throwing).store;
    b.load();
    b.actions.signInGuest();
    b.actions.deleteAccount();
    expect(b.getSnapshot().account).toBeNull();
  });
});

describe("다른 탭 변경", () => {
  it("저장소 변경 알림을 받으면 다시 읽는다 — 다른 탭 로그아웃·삭제가 반영된다", () => {
    const storage = createMemoryStorage();
    let notify: (() => void) | null = null;
    let stopped = false;
    const make = (prefix: string) => {
      let n = 0;
      return createAppStore({
        persistence: createStoragePersistence(() => storage),
        now: () => NOW,
        newId: () => `${prefix}-${++n}`,
        watchExternalChanges: (cb) => {
          notify = cb;
          return () => {
            stopped = true;
          };
        },
      });
    };
    const tabA = make("a");
    const tabB = make("b");
    tabB.actions.signInGuest();
    tabB.actions.completeOnboarding();

    const unsubscribe = tabA.subscribe(() => {});
    expect(tabA.getSnapshot().account?.id).toBe("guest-b-1");
    expect(tabA.getSnapshot().state.hasOnboarded).toBe(true);

    tabB.actions.deleteAccount();
    notify!();
    expect(tabA.getSnapshot().account).toBeNull();
    expect(tabA.getSnapshot().state).toEqual(initialState());

    unsubscribe();
    expect(stopped).toBe(true);
  });

  it("구독이 모두 끊긴 동안(스토어를 안 쓰는 화면) 다른 탭이 쓴 기록을 다시 구독할 때 읽고, 덮어쓰지 않는다", () => {
    const storage = createMemoryStorage();
    const make = (prefix: string) => {
      let n = 0;
      return createAppStore({
        persistence: createStoragePersistence(() => storage),
        now: () => NOW,
        newId: () => `${prefix}-${++n}`,
        watchExternalChanges: () => () => {}, // 알림은 오지 않는다 — 끊긴 동안 놓친 상황
      });
    };
    const tabA = make("a");
    const tabB = make("b");
    let unsubscribe = tabA.subscribe(() => {});
    tabA.actions.signInGuest();
    tabA.actions.completeOnboarding();
    unsubscribe(); // /privacy 같은 화면으로 이동

    tabB.actions.addSymptomRecord({
      lochiaIncreased: true,
      lochiaRed: true,
      feverEvent: false,
      painNrs: 2,
      redFlagCode: "pph_suspect",
      postpartumDays: 12,
    });

    unsubscribe = tabA.subscribe(() => {}); // 기록 화면으로 돌아옴
    expect(tabA.getSnapshot().state.symptomHistory[0]?.redFlagCode).toBe("pph_suspect");
    tabA.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(saved(storage).symptomHistory.map((r: { redFlagCode: string | null }) => r.redFlagCode)).toEqual(["pph_suspect"]);
    expect(saved(storage).moodChecks).toHaveLength(1);
    unsubscribe();
  });

  it("저장이 실패하는 탭은 구독이 끊겼다 다시 붙어도 메모리 상태를 버리지 않는다", () => {
    const { store } = setup(failingStorage());
    let unsubscribe = store.subscribe(() => {});
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    unsubscribe();
    unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().account?.provider).toBe("guest");
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    unsubscribe();
  });
});

describe("동의의 판(domain/consent.ts) — 관문의 다시 동의 화면", () => {
  it("서버 저장이 설정되지 않은 빌드(requireCurrentConsent=false)는 지금까지와 같다 — 판 없는 동의로 메인", () => {
    const { store } = setup();
    store.load();
    store.actions.signInGuest();
    store.actions.completeOnboarding();
    expect(store.getSnapshot().state.profile.consentVersion).toBeNull(); // 완료가 판을 지어내지 않는다
    expect(rootScreenFor(store.getSnapshot(), false)).toBe("main");
  });

  it("설정된 빌드는 온보딩을 마쳤어도 지금 판의 동의가 없으면 consent — 동의하면 main(온보딩 완료는 그대로)", () => {
    const { store, storage } = setup();
    store.load();
    store.actions.signInGuest();
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("onboarding"); // 온보딩 전이면 온보딩이 먼저
    store.actions.completeOnboarding();
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");

    store.actions.acceptConsent();
    const profile = store.getSnapshot().state.profile;
    expect(profile).toMatchObject({ consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW.toISOString() });
    expect(store.getSnapshot().state.hasOnboarded).toBe(true);
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("main");
    expect(saved(storage).profile.consentVersion).toBe(CURRENT_CONSENT_VERSION); // 저장된다
  });

  it("예전 판의 동의는 지금 판이 아니다 — 온보딩 화면이 남긴 지금 판 동의는 완료 뒤에도 그대로", () => {
    const { store } = setup();
    store.load();
    store.actions.signInGuest();
    store.actions.updateProfile({ consentAccepted: true, consentVersion: "web-2026-01-01", consentAcceptedAt: NOW.toISOString() });
    store.actions.completeOnboarding();
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("consent");

    store.actions.updateProfile({ consentVersion: CURRENT_CONSENT_VERSION });
    store.actions.completeOnboarding(); // 다시 불러도 판을 지우지 않는다
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("main");
  });

  it("로그아웃 상태면 동의와 무관하게 로그인 화면", () => {
    const { store } = setup();
    store.load();
    expect(rootScreenFor(store.getSnapshot(), true)).toBe("login");
  });
});
