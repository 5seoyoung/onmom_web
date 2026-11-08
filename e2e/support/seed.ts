// 온보딩을 마친 게스트의 브라우저 저장 상태(localStorage) — 접근성·확대 시험이 화면마다 온보딩을 다시 하지 않게.
// 저장 형식은 앱이 쓰는 것과 같다: 상태는 스토어의 순수 전이(src/store/state.ts)와 기록 규칙(src/rules/record.ts)으로 만들고,
// 키는 src/store/persistence.ts 그대로. 브라우저 전용 빌드의 동의("내 기기에만 저장")처럼 동의 판은 비워 둔다.
// 들어 있는 것: 출산 40일차(자연분만·전업·임신성 당뇨), 오늘 기록 = 어지러움(즉시 내원 — redFlagToday) 또는 신호 없음,
// 규칙 판이 없는 예전 기록 하나(리포트의 판 표시),
// 지난 3일 연속 마음 체크 「아니요」(홈 마음 연계 카드 — 하나는 판 없음, 오늘은 아직 답하지 않음), 기록장 글 하나 + 댓글 하나.
import type { PersistedState, SymptomRecord } from "@/domain/types";
import { INITIAL_SYMPTOM_FORM } from "@/features/record/recordView";
import { buildSymptomRecord } from "@/rules/record";
import { MOOD_VERSION } from "@/rules/version";
import type { Account } from "@/store/account";
import { initialState } from "@/store/defaults";
import { ACCOUNT_KEY, GUEST_ID_KEY, STATE_KEY } from "@/store/persistence";
import { addComment, addMoodCheck, addPost, addSymptomRecord, bindToAccount, completeOnboarding, updateMaternity, updateProfile } from "@/store/state";
import { seoulDateDaysAgo } from "../helpers";

export const SEED_GUEST: Account = { id: "guest-e2e-a11y", name: null, provider: "guest" };
export const SEED_POST_ID = "e2e-post-1";
export const SEED_POSTPARTUM_DAY = 40;

/** 지금 시각에서 n일 전(같은 시각) */
function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

export interface SeedOptions {
  /** 오늘 기록이 위험 신호(어지러움 → 즉시 내원)인가 — false면 오늘 기록은 신호 없음(통증 2) */
  redFlagToday: boolean;
}

export function seededState(now: Date = new Date(), options: SeedOptions = { redFlagToday: true }): PersistedState {
  const deliveryDate = seoulDateDaysAgo(SEED_POSTPARTUM_DAY);
  let s = updateProfile(initialState(), {
    deliveryDate,
    deliveryMethod: "vaginal",
    goal: "homemaker",
    heightCm: 160,
    currentWeightKg: 62,
    prePregnancyWeightKg: 55,
    neighborhood: "서울 종로구",
  });
  s = updateMaternity(s, { gdm: true });
  s = completeOnboarding(s);
  s = bindToAccount(s, SEED_GUEST.id);

  // 예전 기록 — 규칙 판 칸이 생기기 전(rulesVersion null, 위험 증상 칸 없음)
  const old: SymptomRecord = {
    id: "e2e-old",
    date: daysAgo(now, 30).toISOString(),
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 3,
    redFlagCode: null,
    postpartumDays: SEED_POSTPARTUM_DAY - 30,
    rulesVersion: null,
  };
  s = addSymptomRecord(s, old);
  // 오늘 기록 — 화면에서 [확인하기]를 누른 것과 같은 규칙(어지러움 → 즉시 내원, 또는 신호 없음)
  const form = options.redFlagToday ? { ...INITIAL_SYMPTOM_FORM, dizzinessFainting: true, painNrs: 5 } : { ...INITIAL_SYMPTOM_FORM, painNrs: 2 };
  const today = buildSymptomRecord(form, deliveryDate, now).record;
  s = addSymptomRecord(s, { ...today, id: "e2e-today" });

  // 오래된 것부터 넣는다(목록은 최신순 — addMoodCheck가 맨 앞에 넣는다)
  s = addMoodCheck(s, { id: "e2e-mood-3", date: daysAgo(now, 3).toISOString(), questionID: 1, answer: "no", moodVersion: null });
  s = addMoodCheck(s, { id: "e2e-mood-2", date: daysAgo(now, 2).toISOString(), questionID: 2, answer: "no", moodVersion: MOOD_VERSION });
  s = addMoodCheck(s, { id: "e2e-mood-1", date: daysAgo(now, 1).toISOString(), questionID: 3, answer: "no", moodVersion: MOOD_VERSION });

  s = addPost(s, { title: "둘째 주 산책", body: "오늘은 10분 걸었어요.\n내일은 15분." }, { id: SEED_POST_ID, authorName: "게스트", now: daysAgo(now, 2) });
  s = addComment(s, SEED_POST_ID, "무리하지 않기", { id: "e2e-comment-1", authorName: "게스트", now: daysAgo(now, 1) });
  return s;
}

/** 이 상태를 담은 localStorage 항목 — Playwright storageState의 origins[].localStorage 모양 */
export function seededLocalStorage(now: Date = new Date(), options?: SeedOptions): { name: string; value: string }[] {
  return [
    { name: STATE_KEY, value: JSON.stringify(seededState(now, options)) },
    { name: ACCOUNT_KEY, value: JSON.stringify(SEED_GUEST) },
    { name: GUEST_ID_KEY, value: SEED_GUEST.id },
  ];
}
