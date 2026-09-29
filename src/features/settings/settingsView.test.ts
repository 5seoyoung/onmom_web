import { describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/domain/types";
import { defaultMaternity, defaultProfile, initialState } from "@/store/defaults";
import { updateMaternity, updateProfile } from "@/store/state";
import {
  DATA_RIGHTS_TEXT,
  GUEST_ACCOUNT_TEXT,
  MATERNITY_TOGGLES,
  TERMS_HREF,
  accountIdRow,
  consentRows,
  formatLocalDateTime,
  SERVER_ACCOUNT_TEXT,
  accountCardActions,
  accountModeFor,
  performLinkKakao,
  SETTINGS_TEXT,
  deleteConfirmMessage,
  deleteFailureMessage,
  performDeleteAccount,
  performSignOut,
  privacyBodyFor,
  signOutConfirmMessage,
  usesServerAccount,
  draftFromState,
  draftProblem,
  draftToPatches,
  settingsProfileRows,
  showsReturnToWork,
  signOutMessage,
  type ProfileDraft,
} from "./settingsView";

const profile = (patch: Partial<UserProfile> = {}): UserProfile => ({ ...defaultProfile(), ...patch });
const NOW = new Date(2026, 8, 27, 10, 0); // 2026-09-27 로컬

describe("signOutMessage", () => {
  it("게스트와 그 외 계정의 안내가 다르다(MoreView.swift:99-101)", () => {
    expect(signOutMessage("guest")).toBe("기록은 이 기기에 남아 있어요. 다시 게스트로 시작하면 이어서 볼 수 있어요.");
    const other =
      "기록은 이 기기에 남아 있어요. 같은 계정으로 다시 로그인하면 이어서 볼 수 있지만, 다른 계정이나 게스트로 들어오면 새로 시작해요.";
    expect(signOutMessage("kakao")).toBe(other);
    expect(signOutMessage(null)).toBe(other);
  });

  it("계정 삭제 안내는 iOS 기본 문구(Apple 안내 없음)", () => {
    expect(SETTINGS_TEXT.deleteMessage).toBe(
      "계정 정보와 이 기기에 저장된 프로필·증상 기록·글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
    );
    expect(SETTINGS_TEXT.deleteMessage).not.toContain("Apple");
  });
});

describe("계정 카드 — 빌드(Supabase 설정)·계정 종류별 동작", () => {
  it("설정이 없으면 누구든 지금까지와 같다(로그아웃 + 계정 삭제, 이 브라우저에서만)", () => {
    for (const provider of ["guest", "kakao", null, undefined] as const) {
      expect(accountModeFor(provider, false)).toBe("local");
    }
    expect(accountCardActions("local")).toEqual({ signOut: true, linkKakao: false, deleteLabel: SETTINGS_TEXT.deleteAccount, notice: null });
  });

  it("설정이 있는 빌드의 게스트(익명 계정): 로그아웃 없음 — [카카오 계정 연결] + [이 기기에서 기록 지우기(계정 삭제)] + 로그아웃이 없는 까닭", () => {
    expect(accountModeFor("guest", true)).toBe("guest");
    const a = accountCardActions("guest");
    expect(a).toEqual({ signOut: false, linkKakao: true, deleteLabel: "이 기기에서 기록 지우기(계정 삭제)", notice: GUEST_ACCOUNT_TEXT.noSignOut });
    expect(GUEST_ACCOUNT_TEXT.linkKakao).toBe("카카오 계정 연결");
    expect(GUEST_ACCOUNT_TEXT.linkKakaoHint).toBe("기록을 잃지 않고 다른 기기에서도 이어 쓰기");
    expect(a.notice).toContain("로그아웃하면 기록을 다시 찾을 수 없어요");
  });

  it("설정이 있는 빌드의 카카오: 로그아웃 + 계정 삭제(서버 먼저), 연결 버튼 없음", () => {
    expect(accountModeFor("kakao", true)).toBe("kakao");
    expect(accountCardActions("kakao")).toEqual({ signOut: true, linkKakao: false, deleteLabel: SETTINGS_TEXT.deleteAccount, notice: null });
    expect(accountModeFor("apple", true)).toBe("local"); // 모르는 공급자는 이 브라우저에서만
  });
});

describe("서버 계정(Supabase 설정 빌드의 카카오·게스트)의 로그아웃·계정 삭제 문구", () => {
  it("서버를 거치는 것은 Supabase가 설정된 빌드의 카카오·게스트(익명 계정)", () => {
    expect(usesServerAccount("kakao", true)).toBe(true);
    expect(usesServerAccount("guest", true)).toBe(true);
    expect(usesServerAccount("kakao", false)).toBe(false);
    expect(usesServerAccount("guest", false)).toBe(false);
    expect(usesServerAccount(null, true)).toBe(false);
    expect(usesServerAccount(undefined, true)).toBe(false);
  });

  it("서버 계정이 아니면 iOS 문구 그대로", () => {
    expect(signOutConfirmMessage("guest", false)).toBe(signOutMessage("guest"));
    expect(signOutConfirmMessage("kakao", false)).toBe(signOutMessage("kakao"));
    expect(deleteConfirmMessage(false)).toBe(SETTINGS_TEXT.deleteMessage);
  });

  it("서버 계정이면 '이 기기에 남아 있어요'라고 하지 않고, 삭제는 서버 기록까지라고 알린다", () => {
    expect(signOutConfirmMessage("kakao", true)).toBe(SERVER_ACCOUNT_TEXT.signOutMessage);
    expect(signOutConfirmMessage("kakao", true)).not.toContain("이 기기에 남아");
    expect(deleteConfirmMessage(true)).toContain("서버");
    expect(deleteConfirmMessage(true)).toContain("되돌릴 수 없어요");
  });

  it("삭제 실패 안내는 이유별로 다르고, 둘 다 아무것도 지우지 않았다고 말한다", () => {
    expect(deleteFailureMessage("failed")).toBe(SERVER_ACCOUNT_TEXT.deleteFailed);
    expect(deleteFailureMessage("noSession")).toBe(SERVER_ACCOUNT_TEXT.deleteNoSession);
    for (const reason of ["failed", "noSession"] as const) {
      expect(deleteFailureMessage(reason)).toContain("아무것도 삭제되지 않았어요");
    }
  });

  it("못 올린 기록 경고는 기록이 이 브라우저에 남는다고 알린다(signOutEverywhere force — 지우지 않음)", () => {
    expect(SERVER_ACCOUNT_TEXT.unsyncedMessage).toContain("이 브라우저에만 남아요");
  });
});

describe("개인정보·안전 카드 본문 — 빌드별로 사실만", () => {
  it("설정 없는 빌드는 iOS 원문 그대로(MoreView.swift:73)", () => {
    expect(privacyBodyFor(false)).toBe(SETTINGS_TEXT.privacyBody);
    expect(privacyBodyFor(false)).toContain("내 기기에만");
  });

  it("서버 저장 빌드는 '내 기기에만 저장' 문장만 바꾼다 — 동의 뒤 서버(서울)에 저장, 나머지 문장은 원문", () => {
    const body = privacyBodyFor(true);
    expect(body).not.toContain("내 기기에만");
    expect(body).toContain(SERVER_ACCOUNT_TEXT.privacyStorage);
    expect(body).toContain("서울");
    expect(body.startsWith("본 앱은 진단 기기가 아니며, 모든 권고는 의료진 상담을 권유합니다. ")).toBe(true);
    expect(body.endsWith(" 챗봇 등 일부 기능 사용 시 질문 내용이 답변 생성을 위해 서버로 전송돼요.")).toBe(true);
  });
});

describe("performSignOut · performDeleteAccount — 설정의 로그아웃·계정 삭제 연결", () => {
  it("Supabase가 없는 빌드: 지금처럼 스토어에서 바로, 서버 함수는 부르지 않는다", async () => {
    const signOutLocal = vi.fn();
    const signOutEverywhere = vi.fn();
    expect(await performSignOut({ supabaseConfigured: false, force: false, signOutLocal, signOutEverywhere })).toEqual({ kind: "done" });
    expect(signOutLocal).toHaveBeenCalledTimes(1);
    expect(signOutEverywhere).not.toHaveBeenCalled();

    const deleteLocal = vi.fn();
    const deleteAccountEverywhere = vi.fn();
    expect(await performDeleteAccount({ supabaseConfigured: false, deleteLocal, deleteAccountEverywhere })).toEqual({ kind: "done" });
    expect(deleteLocal).toHaveBeenCalledTimes(1);
    expect(deleteAccountEverywhere).not.toHaveBeenCalled();
  });

  it("있는 빌드: 로그아웃은 signOutEverywhere — 못 올렸으면 unsynced, [그래도 로그아웃]은 force", async () => {
    const signOutLocal = vi.fn();
    const unsynced = vi.fn(async () => ({ ok: false as const, reason: "unsynced" as const }));
    expect(await performSignOut({ supabaseConfigured: true, force: false, signOutLocal, signOutEverywhere: unsynced })).toEqual({
      kind: "unsynced",
    });
    expect(unsynced).toHaveBeenCalledWith(undefined);

    const forced = vi.fn(async () => ({ ok: true as const, localDataErased: false }));
    expect(await performSignOut({ supabaseConfigured: true, force: true, signOutLocal, signOutEverywhere: forced })).toEqual({ kind: "done" });
    expect(forced).toHaveBeenCalledWith({ force: true });
    expect(signOutLocal).not.toHaveBeenCalled();
  });

  it("있는 빌드: 삭제는 deleteAccountEverywhere — 실패하면 이유별 안내, 스토어는 건드리지 않는다", async () => {
    const deleteLocal = vi.fn();
    for (const reason of ["failed", "noSession"] as const) {
      const outcome = await performDeleteAccount({
        supabaseConfigured: true,
        deleteLocal,
        deleteAccountEverywhere: async () => ({ ok: false, reason }),
      });
      expect(outcome).toEqual({ kind: "failed", message: deleteFailureMessage(reason) });
    }
    expect(
      await performDeleteAccount({ supabaseConfigured: true, deleteLocal, deleteAccountEverywhere: async () => ({ ok: true }) }),
    ).toEqual({ kind: "done" });
    expect(deleteLocal).not.toHaveBeenCalled();
  });

  it("있는 빌드의 게스트: 로그아웃을 부르면(버튼은 없다) 까닭만 알린다 — 아무것도 하지 않았다", async () => {
    const signOutLocal = vi.fn();
    const guest = vi.fn(async () => ({ ok: false as const, reason: "guest" as const }));
    expect(await performSignOut({ supabaseConfigured: true, force: false, signOutLocal, signOutEverywhere: guest })).toEqual({
      kind: "failed",
      message: GUEST_ACCOUNT_TEXT.noSignOut,
    });
    expect(signOutLocal).not.toHaveBeenCalled();
  });

  it("[카카오 계정 연결] — 카카오 화면으로 이동하면 redirecting(버튼을 잠근 채), 못 열면 원문 안내", async () => {
    expect(await performLinkKakao({ signInWithKakao: async () => ({ ok: true }) })).toEqual({ kind: "redirecting" });
    expect(await performLinkKakao({ signInWithKakao: async () => ({ ok: false, reason: "failed" }) })).toEqual({
      kind: "failed",
      message: "카카오 로그인 창을 열지 못했어요. 잠시 후 다시 시도해주세요.",
    });
  });
});

describe("settingsProfileRows", () => {
  it("settings.png — 63일차 · 제왕절개 · 미설정 · 내 동네", () => {
    const rows = settingsProfileRows(
      profile({ deliveryDate: "2026-07-26", deliveryMethod: "cesarean", neighborhood: "서울 동대문구 회기동" }),
      NOW,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["산후 일수", "63일차"],
      ["분만 방식", "제왕절개"],
      ["목표", "미설정"],
      ["내 동네", "서울 동대문구 회기동"],
    ]);
  });

  it("출산일이 없으면 0일차를 지어내지 않고 미설정, 동네가 비면 행 없음", () => {
    const rows = settingsProfileRows(profile({ goal: "returningToWork", neighborhood: "  " }), NOW);
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["산후 일수", "미설정"],
      ["분만 방식", "미설정"],
      ["목표", "복직 예정"],
    ]);
  });
});

describe("프로필 편집 초안", () => {
  it("저장값에서 시작 — 없는 날짜는 빈 칸, 분만 방식·목표는 고르지 않은 채로", () => {
    const d = draftFromState(defaultProfile(), defaultMaternity());
    expect(d.deliveryDate).toBe("");
    expect(d.returnToWorkDate).toBe("");
    expect(d.deliveryMethod).toBeNull();
    expect(d.goal).toBeNull();
    expect(d.isBreastfeeding).toBe(true);
    expect(d.maternity.isPrimiparous).toBe(true);
  });

  it("출산일 검사 — 비었거나 못 읽으면 missing, 오늘보다 뒤면 future, 오늘은 허용", () => {
    const base = draftFromState(profile({ deliveryDate: "2026-07-26" }), defaultMaternity());
    const today = "2026-09-27";
    expect(draftProblem(base, today)).toBeNull();
    expect(draftProblem({ ...base, deliveryDate: "" }, today)).toBe("deliveryDateMissing");
    expect(draftProblem({ ...base, deliveryDate: "2026-02-31" }, today)).toBe("deliveryDateMissing");
    expect(draftProblem({ ...base, deliveryDate: "2026-09-27" }, today)).toBeNull();
    expect(draftProblem({ ...base, deliveryDate: "2026-09-28" }, today)).toBe("deliveryDateFuture");
  });

  it("복직 예정일은 복직 예정일 때만 입력 칸을 보인다", () => {
    expect(showsReturnToWork("returningToWork")).toBe(true);
    expect(showsReturnToWork("homemaker")).toBe(false);
    expect(showsReturnToWork(null)).toBe(false);
  });

  it("저장 값 — 복직일 빈 칸은 null, 동네는 trim, 산모수첩은 7항목 전부", () => {
    const draft: ProfileDraft = {
      ...draftFromState(profile({ deliveryDate: "2026-07-26", returnToWorkDate: "2026-12-01" }), defaultMaternity()),
      returnToWorkDate: "",
      neighborhood: " 서울 노원구 ",
      deliveryMethod: "vaginal",
      maternity: { ...defaultMaternity(), diastasisRecti: true },
    };
    const { profile: p, maternity } = draftToPatches(draft);
    expect(p.returnToWorkDate).toBeNull();
    expect(p.neighborhood).toBe("서울 노원구");
    expect(p.deliveryMethod).toBe("vaginal");
    expect(Object.keys(maternity).sort()).toEqual(MATERNITY_TOGGLES.map((t) => t.key).sort());
  });

  it("스토어에 넣으면 그대로 남는다 — 출산일 변경·복직일 지우기·DRA 켜기", () => {
    let s = updateProfile(initialState(), { deliveryDate: "2026-07-01", goal: "returningToWork", returnToWorkDate: "2026-12-01" });
    const draft: ProfileDraft = {
      ...draftFromState(s.profile, s.maternity),
      deliveryDate: "2026-07-26",
      returnToWorkDate: "",
      heightCm: 160,
      currentWeightKg: 62.5,
      maternity: { ...s.maternity, diastasisRecti: true, isPrimiparous: false },
    };
    const patches = draftToPatches(draft);
    s = updateMaternity(updateProfile(s, patches.profile), patches.maternity);
    expect(s.profile).toMatchObject({
      deliveryDate: "2026-07-26",
      goal: "returningToWork",
      returnToWorkDate: null,
      heightCm: 160,
      currentWeightKg: 62.5,
    });
    expect(s.maternity).toMatchObject({ diastasisRecti: true, isPrimiparous: false });
  });
});

describe("MATERNITY_TOGGLES", () => {
  it("MoreView 순서·라벨 7개", () => {
    expect(MATERNITY_TOGGLES.map((t) => t.label)).toEqual([
      "초산",
      "임신성 당뇨(GDM)",
      "산후 빈혈",
      "분만 시 출혈 많음",
      "임신중독증·고혈압",
      "골반통·치골결합 이개",
      "복직근 이개(DRA)",
    ]);
  });
});

describe("내 데이터 — 동의 내역 행(형식만 바꾼다, 값을 만들지 않는다)", () => {
  it("서버 저장 빌드의 동의: 판 + 로컬 시각", () => {
    const rows = consentRows(profile({ consentAccepted: true, consentVersion: "web-2026-09-28", consentAcceptedAt: "2026-09-28T05:05:00.000Z" }));
    expect(rows).toEqual([
      { key: "consentVersion", label: DATA_RIGHTS_TEXT.consentVersion, value: "web-2026-09-28" },
      { key: "consentAt", label: DATA_RIGHTS_TEXT.consentAt, value: "2026.09.28 14:05" }, // Asia/Seoul
    ]);
  });

  it("설정 없는 빌드의 동의(판 없음): 시각 한 줄만 — 판을 지어내지 않는다", () => {
    const rows = consentRows(profile({ consentAccepted: true, consentVersion: null, consentAcceptedAt: "2026-09-28T05:05:00.000Z" }));
    expect(rows.map((r) => r.key)).toEqual(["consentAt"]);
  });

  it("동의 전·시각을 읽을 수 없으면 빈 줄", () => {
    expect(consentRows(profile())).toEqual([]);
    expect(consentRows(profile({ consentAccepted: true, consentVersion: null, consentAcceptedAt: "언제" }))).toEqual([]);
    expect(formatLocalDateTime(null)).toBeNull();
    expect(formatLocalDateTime("not-a-date")).toBeNull();
    expect(formatLocalDateTime("2026-01-05T15:07:00.000Z")).toBe("2026.01.06 00:07");
  });

  it("계정 ID 행 — Supabase 세션 사용자 id(UUID)가 있을 때만, 없으면 null(지어내지 않는다)", () => {
    const id = "3f0f9b2e-0000-4000-8000-000000000001";
    expect(accountIdRow(id)).toEqual({ key: "accountId", label: DATA_RIGHTS_TEXT.accountId, value: id });
    expect(accountIdRow(null)).toBeNull();
    expect(accountIdRow("   ")).toBeNull();
    expect(DATA_RIGHTS_TEXT.accountIdHint).toContain("계정 ID");
  });

  it("문구 — 철회 = 계정 삭제, 내려받기 설명에 건강 정보 보관 주의", () => {
    expect(DATA_RIGHTS_TEXT.consentWithdraw).toContain("계정을 삭제");
    expect(DATA_RIGHTS_TEXT.exportHint).toContain("JSON");
    expect(DATA_RIGHTS_TEXT.exportHint).toContain("건강 정보");
    expect(TERMS_HREF).toBe("/terms/");
  });
});
