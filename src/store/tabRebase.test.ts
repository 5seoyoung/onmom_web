// 여러 탭 보호 — 두 탭(스토어 둘)이 한 저장소를 나눠 쓰고, 다른 탭의 변경 알림(storage 이벤트)은 오지 않는 상황(늦음·뒤로 가기 캐시).
import { describe, expect, it } from "vitest";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import type { PersistedState } from "@/domain/types";
import { createAppStore, type AppStore } from "./appStore";
import { initialState } from "./defaults";
import { STATE_KEY, createMemoryStorage, createStoragePersistence, watchPageResume, type StorageLike } from "./persistence";
import { rebaseOnStored } from "./tabRebase";

const NOW = new Date("2026-09-29T10:00:00+09:00");

const SYMPTOM = {
  lochiaIncreased: true,
  lochiaRed: true,
  feverEvent: false,
  painNrs: 2,
  redFlagCode: "pph_suspect",
  postpartumDays: 12,
} as const;

function tab(storage: StorageLike, prefix: string, opts: { resume?: (cb: () => void) => void } = {}): AppStore {
  let n = 0;
  return createAppStore({
    persistence: createStoragePersistence(() => storage),
    now: () => NOW,
    newId: () => `${prefix}-${++n}`,
    watchExternalChanges: () => () => {}, // 변경 알림이 오지 않는다
    watchResume: opts.resume
      ? (cb) => {
          opts.resume!(cb);
          return () => {};
        }
      : undefined,
  });
}

function saved(storage: StorageLike): PersistedState | null {
  const raw = storage.getItem(STATE_KEY);
  return raw === null ? null : (JSON.parse(raw) as PersistedState);
}

/** 두 탭이 같은 게스트로 온보딩을 마치고 둘 다 화면을 연 상태 */
function twoTabs() {
  const storage = createMemoryStorage();
  const a = tab(storage, "a");
  const b = tab(storage, "b");
  a.subscribe(() => {});
  a.actions.signInGuest();
  a.actions.completeOnboarding();
  b.subscribe(() => {}); // B가 A의 상태를 읽음
  return { storage, a, b };
}

describe("여러 탭 — 늦은 변경 알림에도 다른 탭의 새 기록을 덮지 않는다", () => {
  it("B가 레드플래그 기록을 남긴 뒤 낡은 A가 기분 답을 저장해도 둘 다 남는다", () => {
    const { storage, a, b } = twoTabs();
    b.actions.addSymptomRecord(SYMPTOM);
    expect(a.getSnapshot().state.symptomHistory).toHaveLength(0); // A는 아직 모른다

    a.actions.addMoodCheck({ questionID: 1, answer: "no" });
    const s = saved(storage)!;
    expect(s.symptomHistory.map((r) => r.redFlagCode)).toEqual(["pph_suspect"]);
    expect(s.moodChecks).toHaveLength(1);
    // A의 화면도 합친 상태를 본다
    expect(a.getSnapshot().state.symptomHistory).toHaveLength(1);
    expect(a.getSnapshot().state.moodChecks).toHaveLength(1);
  });

  it("글·댓글도 합친다 — 같은 글에 두 탭이 단 댓글이 모두 남는다", () => {
    const { storage, a, b } = twoTabs();
    const postId = a.actions.addPost({ title: "첫 글", body: "" })!;
    b.load(); // B가 글을 봄
    b.actions.addComment(postId, "B 댓글");
    a.actions.addComment(postId, "A 댓글");
    expect(saved(storage)!.communityPosts[0].comments.map((c) => c.text).sort()).toEqual(["A 댓글", "B 댓글"]);
  });

  it("프로필은 칸마다 — 이 탭이 바꾼 칸만 이 탭 값, 나머지는 다른 탭이 저장한 값", () => {
    const { storage, a, b } = twoTabs();
    b.actions.updateProfile({ heightCm: 160 });
    a.actions.updateProfile({ currentWeightKg: 58 }); // A는 키 0(낡음)을 들고 있다
    const s = saved(storage)!;
    expect(s.profile.heightCm).toBe(160);
    expect(s.profile.currentWeightKg).toBe(58);
  });

  it("같은 칸을 두 탭이 고치면 나중에 저장한 탭의 값", () => {
    const { storage, a, b } = twoTabs();
    b.actions.updateProfile({ neighborhood: "역삼동" });
    a.actions.updateProfile({ neighborhood: "서초동" });
    expect(saved(storage)!.profile.neighborhood).toBe("서초동");
  });

  it("다른 탭이 계정을 삭제했으면 낡은 탭의 쓰기를 버린다 — 지운 기록을 되살리지 않는다", () => {
    const { storage, a, b } = twoTabs();
    a.actions.addMoodCheck({ questionID: 1, answer: "yes" });
    b.load();
    b.actions.deleteAccount();

    a.actions.addSymptomRecord(SYMPTOM);
    expect(saved(storage)).toBeNull();
    expect(a.getSnapshot().account).toBeNull();
    expect(a.getSnapshot().state).toEqual(initialState());
  });

  it("다른 탭이 다른 계정으로 로그인했으면 낡은 탭의 쓰기를 그 계정의 기록에 섞지 않는다", () => {
    const { storage, a, b } = twoTabs();
    b.actions.signIn({ id: "kakao-42", name: null, provider: "kakao" }); // 게스트 기록은 이 계정으로 귀속(게스트 → 실제 계정)
    const before = saved(storage)!;

    a.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(saved(storage)).toEqual(before);
    expect(a.getSnapshot().account?.id).toBe("kakao-42"); // A는 다시 읽어 지금 계정을 본다
  });

  it("다른 탭이 로그아웃만 했으면 쓰기를 버리고 로그인 화면으로(계정 없음)", () => {
    const { storage, a, b } = twoTabs();
    b.actions.signOut();
    a.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(saved(storage)!.moodChecks).toHaveLength(0);
    expect(a.getSnapshot().account).toBeNull();
  });

  it("다른 탭이 쓰지 않았으면 그대로 저장한다(다시 읽지 않음)", () => {
    const { storage, a } = twoTabs();
    const before = a.getSnapshot();
    a.actions.addMoodCheck({ questionID: 1, answer: "no" });
    expect(saved(storage)!.moodChecks).toHaveLength(1);
    expect(a.getSnapshot().account).toBe(before.account); // load()를 거치지 않았다(계정 객체 그대로)
  });

  it("동기화(replaceState)의 쓰기도 같은 보호를 받는다", () => {
    const { storage, a, b } = twoTabs();
    b.actions.addSymptomRecord(SYMPTOM);
    const fromServer = { ...a.getSnapshot().state, moodChecks: [{ id: "srv-1", date: NOW.toISOString(), questionID: 2, answer: "no" as const }] };
    a.replaceState(fromServer);
    const s = saved(storage)!;
    expect(s.symptomHistory).toHaveLength(1);
    expect(s.moodChecks.map((m) => m.id)).toEqual(["srv-1"]);
  });

  it("페이지가 다시 보이면(뒤로 가기 캐시·탭 전환) 바뀐 경우에만 다시 읽는다", () => {
    const storage = createMemoryStorage();
    let resume: (() => void) | null = null;
    const a = tab(storage, "a", { resume: (cb) => (resume = cb) });
    const b = tab(storage, "b");
    a.subscribe(() => {});
    a.actions.signInGuest();
    a.actions.completeOnboarding();
    b.subscribe(() => {});

    const unchanged = a.getSnapshot();
    resume!();
    expect(a.getSnapshot()).toBe(unchanged); // 바뀐 것이 없으면 새 스냅샷을 내지 않는다

    b.actions.addSymptomRecord(SYMPTOM);
    resume!();
    expect(a.getSnapshot().state.symptomHistory).toHaveLength(1);
  });
});

describe("rebaseOnStored — 동의 묶음은 칸별 3방향", () => {
  const withConsent = (s: PersistedState): PersistedState => ({
    ...s,
    profile: { ...s.profile, consentAccepted: true, consentVersion: CURRENT_CONSENT_VERSION, consentAcceptedAt: NOW.toISOString() },
  });
  const base: PersistedState = { ...initialState(), hasOnboarded: true, ownerAccountID: "guest-1" };

  it("이 탭이 동의를 지웠으면(동기화 엔진의 가져온 기록 보호) 다른 탭의 동의가 되살리지 않는다", () => {
    const seen = withConsent(base);
    const stored = { ...withConsent(base), profile: { ...withConsent(base).profile, heightCm: 160 } };
    const mine = base; // 동의를 지운 쓰기
    const out = rebaseOnStored(mine, stored, seen, "guest-1");
    expect(out.profile.consentAccepted).toBe(false);
    expect(out.profile.consentVersion).toBeNull();
    expect(out.profile.heightCm).toBe(160);
  });

  it("다른 탭이 동의했고 이 탭은 동의를 건드리지 않았으면 다른 탭의 동의", () => {
    const stored = withConsent(base);
    const mine = { ...base, profile: { ...base.profile, neighborhood: "역삼동" } };
    const out = rebaseOnStored(mine, stored, base, "guest-1");
    expect(out.profile.consentVersion).toBe(CURRENT_CONSENT_VERSION);
    expect(out.profile.neighborhood).toBe("역삼동");
  });
});

describe("watchPageResume", () => {
  function targets() {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "hidden" as string });
    return { win, doc };
  }

  it("뒤로 가기 캐시 복원(pageshow persisted)과 다시 보임(visibilitychange visible)에만 알리고, 해제하면 멈춘다", () => {
    const t = targets();
    let calls = 0;
    const stop = watchPageResume(() => calls++, t);

    t.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    t.doc.dispatchEvent(new Event("visibilitychange")); // hidden
    expect(calls).toBe(0);

    t.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    t.doc.visibilityState = "visible";
    t.doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(2);

    stop();
    t.win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    t.doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(2);
  });

  it("브라우저 밖(window·document 없음)에서는 아무것도 하지 않는다", () => {
    expect(() => watchPageResume(() => {})()).not.toThrow();
  });
});
