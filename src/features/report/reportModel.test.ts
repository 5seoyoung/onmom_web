import { describe, expect, it } from "vitest";
import content from "@/content";
import type { MoodCheckRecord, PersistedState, SymptomRecord } from "@/domain/types";
import { RECORD_TEXT } from "@/features/record/recordView";
import { MOOD_QUESTIONS } from "@/rules/mood";
import { RULES_VERSION } from "@/rules/version";
import { bmi, formatOneDecimal, retainedWeightKg } from "@/rules/weight";
import type { Account } from "@/store/account";
import { initialState } from "@/store/defaults";
import { addComment, addMoodCheck, addPost, addSymptomRecord, updateMaternity, updateProfile } from "@/store/state";
import { buildReport, MOOD_COLUMNS, SYMPTOM_COLUMNS, type Report, type ReportSection } from "./reportModel";
import { REPORT_TEXT } from "./reportText";

const NOW = new Date(2026, 9, 14, 21, 30); // 2026-10-14 21:30 로컬(Asia/Seoul)
const GUEST: Account = { id: "guest-abc", name: null, provider: "guest" };
const KAKAO: Account = { id: "kakao-1234", name: "해님닉네임", provider: "kakao" };

function symptom(id: string, date: string, patch: Partial<SymptomRecord> = {}): SymptomRecord {
  return {
    id,
    date,
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: false,
    painNrs: 2,
    redFlagCode: null,
    postpartumDays: 40,
    ...patch,
  };
}

function mood(id: string, date: string, questionID: number, answer: MoodCheckRecord["answer"]): MoodCheckRecord {
  return { id, date, questionID, answer };
}

/** 온보딩을 마친 상태 — 출산일 40일 전(2026-09-04), 자연분만, 전업 */
function onboarded(): PersistedState {
  return updateProfile(initialState(), {
    deliveryDate: "2026-09-04",
    deliveryMethod: "vaginal",
    goal: "homemaker",
    consentAccepted: true,
  });
}

function section<K extends ReportSection["key"]>(report: Report, key: K): Extract<ReportSection, { key: K }> {
  const found = report.sections.find((s) => s.key === key);
  if (!found) throw new Error(`섹션 없음: ${key}`);
  return found as Extract<ReportSection, { key: K }>;
}

describe("buildReport — 머리·순서", () => {
  it("제목·문서 제목(PDF 파일 이름) = 온맘 기록 리포트 + 로컬 날짜, 머리 = 만든 날짜·계정 종류", () => {
    const r = buildReport(onboarded(), GUEST, NOW, { includeJournal: false });
    expect(r.title).toBe(REPORT_TEXT.title);
    expect(r.documentTitle).toBe("온맘 기록 리포트 2026-10-14");
    expect(r.meta).toEqual([
      { key: "createdAt", label: "만든 날짜", value: "2026-10-14" },
      { key: "account", label: "계정", value: "게스트" },
    ]);
  });

  it("카카오 계정은 종류만 — 닉네임은 어디에도 없다", () => {
    const r = buildReport(onboarded(), KAKAO, NOW, { includeJournal: true });
    expect(r.meta.find((m) => m.key === "account")?.value).toBe("카카오 사용자");
    expect(JSON.stringify(r)).not.toContain("해님닉네임");
  });

  it("섹션 순서: 프로필 → 재활 고려사항 → 증상 기록 → 오늘의 한 가지 질문 (→ 기록장)", () => {
    const off = buildReport(onboarded(), GUEST, NOW, { includeJournal: false });
    expect(off.sections.map((s) => s.key)).toEqual(["profile", "maternity", "symptoms", "moods"]);
    expect(off.sections.map((s) => s.title)).toEqual(["프로필", "재활 고려사항", "증상 기록", RECORD_TEXT.moodTitle]);
    const on = buildReport(onboarded(), GUEST, NOW, { includeJournal: true });
    expect(on.sections.map((s) => s.key)).toEqual(["profile", "maternity", "symptoms", "moods", "journal"]);
  });

  it("바닥글: content.json 면책 원문 · 안내 규칙 버전 · 만든 곳", () => {
    const r = buildReport(onboarded(), GUEST, NOW, { includeJournal: false });
    expect(r.footer.disclaimer).toBe(content.disclaimers.home_footer);
    expect(r.footer.rulesVersion).toBe(`리포트를 만든 때의 안내 규칙 버전 ${RULES_VERSION}`);
    expect(r.footer.origin).toBe(REPORT_TEXT.origin);
  });
});

describe("프로필", () => {
  it("출산일 + 산후 일차 줄, 분만 방식·목표·모유수유 — 앱 화면과 같은 이름", () => {
    const rows = section(buildReport(onboarded(), GUEST, NOW, { includeJournal: false }), "profile").rows;
    expect(rows).toEqual([
      { key: "deliveryDate", label: "출산일", value: "2026-09-04 (산후 40일차 · 5주차)" },
      { key: "deliveryMethod", label: "분만 방식", value: "자연분만" },
      { key: "goal", label: "목표", value: "전업" },
      { key: "breastfeeding", label: "모유수유 중", value: "예" },
    ]);
  });

  it("복직 예정일은 있을 때만 — 행 이름에서 입력 안내 '(선택)'을 뗀다", () => {
    const s = updateProfile(onboarded(), { goal: "returningToWork", returnToWorkDate: "2027-03-02", isBreastfeeding: false });
    const rows = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "profile").rows;
    expect(rows.find((r) => r.key === "goal")?.value).toBe("복직 예정");
    expect(rows.find((r) => r.key === "returnToWork")).toEqual({ key: "returnToWork", label: "복직 예정일", value: "2027-03-02" });
    expect(rows.find((r) => r.key === "breastfeeding")?.value).toBe("아니요");
  });

  it("키·체중은 0(미입력)이면 행이 없고, 입력한 값은 그대로", () => {
    const none = section(buildReport(onboarded(), GUEST, NOW, { includeJournal: false }), "profile").rows.map((r) => r.key);
    expect(none).not.toContain("height");
    expect(none).not.toContain("currentWeight");
    expect(none).not.toContain("preWeight");

    const some = updateProfile(onboarded(), { heightCm: 0, currentWeightKg: 58.5, prePregnancyWeightKg: 0 });
    const rows = section(buildReport(some, GUEST, NOW, { includeJournal: false }), "profile").rows;
    expect(rows.filter((r) => ["height", "currentWeight", "preWeight"].includes(r.key))).toEqual([
      { key: "currentWeight", label: "현재 체중 (kg)", value: "58.5" },
    ]);
  });

  it("BMI·체중 회복 목표 같은 계산값은 어디에도 없다 — 입력값만", () => {
    const s = updateProfile(onboarded(), { heightCm: 160, currentWeightKg: 64, prePregnancyWeightKg: 55 });
    const r = buildReport(s, GUEST, NOW, { includeJournal: true });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/BMI/i);
    expect(json).not.toContain(formatOneDecimal(bmi(s.profile)!)); // 25.0
    expect(json).not.toContain(`"${retainedWeightKg(s.profile)}"`); // 9(kg 차이)도 만들지 않는다
    expect(json).not.toContain("체중 회복");
    const rows = section(r, "profile").rows;
    expect(rows.filter((x) => ["height", "currentWeight", "preWeight"].includes(x.key)).map((x) => [x.label, x.value])).toEqual([
      ["키 (cm)", "160"],
      ["현재 체중 (kg)", "64"],
      ["임신 전 체중 (kg)", "55"],
    ]);
  });

  it("출산일이 없으면 0일차를 지어내지 않고 '미설정'", () => {
    const rows = section(buildReport(initialState(), GUEST, NOW, { includeJournal: false }), "profile").rows;
    expect(rows[0]).toEqual({ key: "deliveryDate", label: "출산일", value: "미설정" });
    expect(rows.find((r) => r.key === "deliveryMethod")?.value).toBe("미설정");
  });
});

describe("재활 고려사항(산모수첩 확인 항목)", () => {
  it("프로필 칩과 같은 항목(maternityFlags) + 원문 첫 문장 안내", () => {
    const s = updateMaternity(onboarded(), { isPrimiparous: false, gdm: true, anemia: true });
    const m = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "maternity");
    expect(m.items).toEqual(["다분만부", "임신성 당뇨", "산후 빈혈"]);
    expect(m.note).toBe("산모수첩·진료기록에서 확인된 항목.");
  });

  it("켜진 항목이 없으면 빈 배열(화면은 '확인된 항목이 없어요.')", () => {
    expect(section(buildReport(onboarded(), GUEST, NOW, { includeJournal: false }), "maternity").items).toEqual([]);
  });
});

describe("증상 기록", () => {
  it("모든 기록을 최신순으로(저장 순서가 섞여 있어도), 열 이름은 앱 원문 + 새 문구", () => {
    let s = onboarded();
    // 저장소는 최신순이지만 순서에 기대지 않는다 — 일부러 섞어 넣는다
    s = { ...s, symptomHistory: [symptom("b", "2026-10-02T03:00:00.000Z"), symptom("c", "2026-10-13T12:00:00.000Z"), symptom("a", "2026-09-20T01:00:00.000Z")] };
    const t = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "symptoms");
    expect(t.rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(t.columns).toBe(SYMPTOM_COLUMNS);
    expect(t.columns).toEqual(["기록 시각", "산후 일수", "오로 늘어남", "붉은 오로", "발열 (38.0℃ 이상)", "통증 정도 (NRS)", "결과"]);
  });

  it("최대 50건(저장 한도) — 51건이 들어와도 최신 50건", () => {
    const history = Array.from({ length: 51 }, (_, i) =>
      symptom(`r${i}`, new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString()),
    );
    const t = section(buildReport({ ...onboarded(), symptomHistory: history }, GUEST, NOW, { includeJournal: false }), "symptoms");
    expect(t.rows).toHaveLength(50);
    expect(t.rows[0].id).toBe("r50");
    expect(t.rows.at(-1)?.id).toBe("r1");
  });

  it("한 줄: 기록 시각(기록 탭과 같은 형식) · 산후 일수 · 오로 · 발열 · 통증 n/10 · 결과", () => {
    const s = addSymptomRecord(
      onboarded(),
      symptom("x", "2026-10-14T06:05:00.000Z", { lochiaIncreased: true, lochiaRed: true, painNrs: 3, redFlagCode: "pph_suspect" }),
    );
    const [row] = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "symptoms").rows;
    expect(row).toEqual({
      id: "x",
      iso: "2026-10-14T06:05:00.000Z",
      dateText: "10월 14일 오후 3:05",
      dayText: "40일차",
      lochiaIncreased: "예",
      lochiaRed: "예",
      fever: "아니요",
      pain: "3/10",
      flagged: true,
      result: RECORD_TEXT.recentFlagged,
      signals: [],
    });
  });

  it("결과: 신호 없음 = '위험신호 없음', 위험 증상 토글이 실린 기록은 그 라벨까지", () => {
    let s = addSymptomRecord(onboarded(), symptom("n", "2026-10-13T01:00:00.000Z"));
    s = addSymptomRecord(s, { ...symptom("f", "2026-10-14T01:00:00.000Z", { redFlagCode: "neuro_flag" }), dizzinessFainting: true } as SymptomRecord);
    const rows = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "symptoms").rows;
    expect(rows.map((r) => [r.id, r.result, r.signals])).toEqual([
      ["f", "병원 신호", ["어지러움·실신·균형장애"]],
      ["n", "위험신호 없음", []],
    ]);
  });

  it("산후 10일 전(오로를 묻지 않음)·산후 일수가 없는 옛 기록의 '아니요'는 값 없음(null) — 지어내지 않는다", () => {
    let s = addSymptomRecord(onboarded(), symptom("early", "2026-09-08T01:00:00.000Z", { postpartumDays: 4 }));
    s = addSymptomRecord(s, symptom("old", "2026-09-09T01:00:00.000Z", { postpartumDays: null, lochiaRed: true }));
    s = addSymptomRecord(s, symptom("late", "2026-09-20T01:00:00.000Z", { postpartumDays: 16 }));
    const t = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "symptoms");
    const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
    expect([byId.early.dayText, byId.early.lochiaIncreased, byId.early.lochiaRed]).toEqual(["4일차", null, null]);
    expect([byId.old.dayText, byId.old.lochiaIncreased, byId.old.lochiaRed]).toEqual([null, null, "예"]);
    expect([byId.late.dayText, byId.late.lochiaIncreased, byId.late.lochiaRed]).toEqual(["16일차", "아니요", "아니요"]);
    expect(t.showsNoValueNote).toBe(true);
  });

  it("값 없는 칸이 없으면 범례도 없다", () => {
    const s = addSymptomRecord(onboarded(), symptom("late", "2026-09-20T01:00:00.000Z", { postpartumDays: 16 }));
    expect(section(buildReport(s, GUEST, NOW, { includeJournal: false }), "symptoms").showsNoValueNote).toBe(false);
  });
});

describe("오늘의 한 가지 질문(기분) 답", () => {
  it("모든 답을 최신순으로 — 날짜(로컬) · 문항 · 답 이름", () => {
    let s = onboarded();
    s = addMoodCheck(s, mood("m1", "2026-10-12T12:00:00.000Z", 2, "yes"));
    s = addMoodCheck(s, mood("m3", "2026-10-14T00:30:00.000Z", 6, "no"));
    s = { ...s, moodChecks: [...s.moodChecks, mood("m2", "2026-10-13T12:00:00.000Z", 3, "unsure")] };
    const t = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "moods");
    expect(t.columns).toBe(MOOD_COLUMNS);
    expect(t.rows.map((r) => [r.id, r.dateText, r.question, r.answer])).toEqual([
      ["m3", "2026-10-14", MOOD_QUESTIONS.find((q) => q.id === 6)?.text, "아니요"],
      ["m2", "2026-10-13", MOOD_QUESTIONS.find((q) => q.id === 3)?.text, "글쎄요"],
      ["m1", "2026-10-12", MOOD_QUESTIONS.find((q) => q.id === 2)?.text, "네"],
    ]);
  });

  it("모르는 문항(다음 버전 문항 등)은 문항만 비우고 답은 남긴다 — 예외 없음", () => {
    const s = addMoodCheck(onboarded(), mood("u", "2026-10-14T00:30:00.000Z", 999, "no"));
    const [row] = section(buildReport(s, GUEST, NOW, { includeJournal: false }), "moods").rows;
    expect(row).toMatchObject({ id: "u", dateText: "2026-10-14", question: null, answer: "아니요" });
  });
});

describe("기록장 글(고를 때만)", () => {
  function withPosts(): PersistedState {
    let s = addPost(onboarded(), { title: "첫 글", body: "오늘은 좀 나았다" }, { id: "p1", authorName: "해님닉네임", now: new Date("2026-10-01T03:00:00.000Z") });
    s = addPost(s, { title: "둘째 글", body: "산책 10분\n잠 4시간" }, { id: "p2", authorName: "해님닉네임", now: new Date("2026-10-10T03:00:00.000Z") });
    s = addComment(s, "p2", "내일도 걷기", { id: "c2", authorName: "해님닉네임", now: new Date("2026-10-11T03:00:00.000Z") });
    s = addComment(s, "p2", "물 많이", { id: "c1", authorName: "해님닉네임", now: new Date("2026-10-10T05:00:00.000Z") });
    return s;
  }

  it("기본(꺼짐): 기록장 섹션도 글 내용도 없다", () => {
    const r = buildReport(withPosts(), GUEST, NOW, { includeJournal: false });
    expect(r.sections.some((s) => s.key === "journal")).toBe(false);
    const json = JSON.stringify(r);
    for (const text of ["첫 글", "둘째 글", "오늘은 좀 나았다", "내일도 걷기"]) expect(json).not.toContain(text);
  });

  it("켜면: 글 최신순 — 제목·시각·본문, 댓글은 오래된 순(시각·내용만, 작성 이름 없음)", () => {
    const j = section(buildReport(withPosts(), GUEST, NOW, { includeJournal: true }), "journal");
    expect(j.title).toBe("기록장");
    expect(j.posts.map((p) => [p.id, p.title, p.dateText, p.body, p.commentsLabel])).toEqual([
      ["p2", "둘째 글", "10월 10일 오후 12:00", "산책 10분\n잠 4시간", "댓글 2"],
      ["p1", "첫 글", "10월 1일 오후 12:00", "오늘은 좀 나았다", null],
    ]);
    expect(j.posts[0].comments).toEqual([
      { id: "c1", iso: "2026-10-10T05:00:00.000Z", dateText: "10월 10일 오후 2:00", text: "물 많이" },
      { id: "c2", iso: "2026-10-11T03:00:00.000Z", dateText: "10월 11일 오후 12:00", text: "내일도 걷기" },
    ]);
    expect(JSON.stringify(j)).not.toContain("해님닉네임");
  });

  it("켰는데 글이 없으면 빈 배열(화면은 제목 + '기록이 없어요.')", () => {
    expect(section(buildReport(onboarded(), GUEST, NOW, { includeJournal: true }), "journal").posts).toEqual([]);
  });
});

describe("빈 상태(아무 기록도 없음)", () => {
  it("섹션은 모두 남고 내용만 비어 있다 — 기본값(초산)으로 '다분만부'를 지어내지 않는다", () => {
    const r = buildReport(initialState(), null, NOW, { includeJournal: true });
    expect(r.sections.map((s) => s.key)).toEqual(["profile", "maternity", "symptoms", "moods", "journal"]);
    expect(section(r, "maternity").items).toEqual([]);
    expect(section(r, "symptoms").rows).toEqual([]);
    expect(section(r, "symptoms").showsNoValueNote).toBe(false);
    expect(section(r, "moods").rows).toEqual([]);
    expect(section(r, "journal").posts).toEqual([]);
    // 계정이 없으면 계정 행을 지어내지 않는다
    expect(r.meta.map((m) => m.key)).toEqual(["createdAt"]);
  });
});
