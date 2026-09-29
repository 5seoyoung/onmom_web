import { describe, expect, it } from "vitest";
import { MOOD_VERSION, RULES_VERSION } from "@/rules/version";
import { initialState } from "@/store/defaults";
import { addPost, addSymptomRecord, updateProfile } from "@/store/state";
import { buildDataExport, DATA_EXPORT_FORMAT, exportFileName, serializeDataExport } from "./dataExport";

const NOW = new Date(2026, 8, 28, 23, 40); // 2026-09-28 23:40 로컬(Asia/Seoul) = 09-28T14:40Z
const SERVER_USER_ID = "3f0f9b2e-0000-4000-8000-000000000001";

function state() {
  let s = updateProfile(initialState(), {
    deliveryDate: "2026-07-27",
    deliveryMethod: "cesarean",
    consentAccepted: true,
    consentVersion: "web-2026-09-28",
    consentAcceptedAt: "2026-09-28T05:00:00.000Z",
  });
  s = addSymptomRecord(s, {
    id: "r1",
    date: "2026-09-28T13:00:00.000Z",
    lochiaIncreased: false,
    lochiaRed: false,
    feverEvent: true,
    painNrs: 3,
    redFlagCode: "fever_infection",
    postpartumDays: 63,
  });
  // 기록장 글의 authorName은 작성 당시 표시 이름 스냅샷(store/state.ts WriteMeta) — 상태의 일부라 그대로 들어간다
  s = addPost(s, { title: "첫 글", body: "오늘은 좀 나았다" }, { id: "p1", authorName: "해님닉네임", now: new Date("2026-09-28T13:30:00.000Z") });
  return s;
}

describe("buildDataExport", () => {
  it("상태 전체를 그대로 담고, 계정은 id·provider·serverUserId만(account.name 없음), 동의는 따로 뽑아 둔다", () => {
    const s = state();
    const out = buildDataExport({ state: s, account: { id: "kakao-1", name: "해님닉네임", provider: "kakao" } }, NOW, SERVER_USER_ID);
    expect(out.format).toBe(DATA_EXPORT_FORMAT);
    expect(out.exportedAt).toBe(NOW.toISOString());
    expect(out.rulesVersion).toBe(RULES_VERSION);
    expect(out.moodVersion).toBe(MOOD_VERSION);
    expect(out.account).toEqual({ id: "kakao-1", provider: "kakao", serverUserId: SERVER_USER_ID });
    expect(out.account).not.toHaveProperty("name");
    expect(out.consent).toEqual({ accepted: true, version: "web-2026-09-28", acceptedAt: "2026-09-28T05:00:00.000Z" });
    expect(out.state).toBe(s); // 같은 객체 — 복사·가공하지 않는다(있는 그대로 열람)
    expect(out.state.symptomHistory).toHaveLength(1);
    expect(out.state.symptomHistory[0].redFlagCode).toBe("fever_infection");
    // 글의 authorName(작성 당시 표시 이름)은 상태 그대로 — 지우거나 가리지 않는다(열람권)
    expect(out.state.communityPosts[0].authorName).toBe("해님닉네임");
  });

  it("서버 계정 ID를 모르면(설정 없는 빌드·세션 없음) serverUserId는 null — 지어내지 않는다", () => {
    const out = buildDataExport({ state: state(), account: { id: "guest-abc", name: null, provider: "guest" } }, NOW);
    expect(out.account).toEqual({ id: "guest-abc", provider: "guest", serverUserId: null });
  });

  it("로그인 계정이 없으면 account는 null, 동의 전이면 판·시각도 null", () => {
    const out = buildDataExport({ state: initialState(), account: null }, NOW, SERVER_USER_ID);
    expect(out.account).toBeNull();
    expect(out.consent).toEqual({ accepted: false, version: null, acceptedAt: null });
  });

  it("파일 이름은 로컬 날짜, 내용은 들여쓴 JSON으로 다시 읽을 수 있다", () => {
    expect(exportFileName(NOW)).toBe("온맘-내기록-2026-09-28.json");
    // UTC로는 아직 28일 14:40이지만 로컬 자정 직전 — 로컬 날짜를 쓴다
    expect(exportFileName(new Date(2026, 8, 28, 0, 10))).toBe("온맘-내기록-2026-09-28.json");
    const out = buildDataExport({ state: state(), account: { id: "guest-x", name: null, provider: "guest" } }, NOW);
    const text = serializeDataExport(out);
    expect(text).toContain("\n  ");
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(out)));
  });
});
