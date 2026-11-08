// 내 데이터 내려받기 — 지운 기록·고친 기록(store/tombstones). 지운 기록은 파일의 목록에 없고, 삭제 표시는 id·지운 시각만, 고친 기록은 고친 값.
import { describe, expect, it } from "vitest";
import { RULES_VERSION } from "@/rules/version";
import { initialState } from "@/store/defaults";
import { addMoodCheck, addPost, addSymptomRecord, deleteMoodCheck, deletePost, deleteSymptomRecord, updateSymptomRecord } from "@/store/state";
import { buildDataExport, serializeDataExport } from "./dataExport";

const NOW = new Date("2026-11-08T10:00:00+09:00");
const rec = (id: string, painNrs: number) => ({
  id,
  date: "2026-11-01T01:00:00.000Z",
  lochiaIncreased: false,
  lochiaRed: false,
  feverEvent: false,
  painNrs,
  redFlagCode: null,
  postpartumDays: 30,
  rulesVersion: RULES_VERSION,
});

describe("지운 기록·고친 기록의 내려받기", () => {
  it("지운 증상 기록·답·글은 파일에 없고(내용 글자도), 표시는 id·시각만, 고친 기록은 고친 값과 고친 시각", () => {
    let s = addSymptomRecord(initialState(), rec("keep", 2));
    s = addSymptomRecord(s, rec("gone", 9));
    s = addMoodCheck(s, { id: "m", date: "2026-11-01T01:00:00.000Z", questionID: 1, answer: "no", moodVersion: null });
    s = addPost(s, { title: "지울 글 제목", body: "지울 글 본문" }, { id: "p", authorName: "게스트", now: NOW });
    s = deleteSymptomRecord(s, "gone", NOW);
    s = deleteMoodCheck(s, "m", NOW);
    s = deletePost(s, "p", NOW);
    s = updateSymptomRecord(s, "keep", { ...rec("keep", 6) }, NOW);

    const data = buildDataExport({ state: s, account: { id: "guest-1", name: null, provider: "guest" } }, NOW);
    const text = serializeDataExport(data);
    expect(data.state.symptomHistory.map((r) => r.id)).toEqual(["keep"]);
    expect(data.state.symptomHistory[0]).toMatchObject({ painNrs: 6, updatedAt: NOW.toISOString() });
    expect(data.state.moodChecks).toEqual([]);
    expect(data.state.communityPosts).toEqual([]);
    expect(text).not.toContain("지울 글");
    expect(text).not.toContain('"painNrs": 9');
    for (const list of Object.values(data.state.deleted)) for (const t of list) expect(Object.keys(t).sort()).toEqual(["deletedAt", "id"]);
  });
});
