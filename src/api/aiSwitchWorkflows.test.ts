// AI 상담의 두 스위치가 저장소에 커밋된 값으로 켜지는지 — 사람이 GitHub Variables를 넣지 않아도(2026-11-06 대표 결정) 켜지고, Variable을 넣으면 그 값이 먼저다.
// deploy.yml(화면 쪽 NEXT_PUBLIC_AI_CHAT_ENABLED)·supabase.yml(서버 쪽 AI_CHAT_SERVER_ENABLED)을 글자로 확인한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isAiChatServerEnabled } from "../../supabase/functions/_shared/chat";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), "utf8");
const DEPLOY = read("deploy.yml");
const SUPABASE = read("supabase.yml");

/** 이름이 붙은 단계 하나(다음 "- name:"·"- uses:" 전까지) */
function step(name: string): string {
  const start = SUPABASE.indexOf(`- name: ${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = SUPABASE.indexOf("\n      - ", start + 1);
  return SUPABASE.slice(start, next === -1 ? undefined : next);
}

const SERVER_VALUE = "${{ vars.AI_CHAT_SERVER_ENABLED || env.ONMOM_AI_CHAT_SERVER_ENABLED }}";

describe("deploy.yml — 화면 쪽 스위치", () => {
  it("저장소 값 ONMOM_AI가 on이다(따옴표 — YAML 1.1 도구가 true로 읽지 않게)", () => {
    expect(DEPLOY).toMatch(/^ {2}ONMOM_AI: "on"$/m);
  });

  it("값을 고르는 순서: Variable → ONMOM_AI가 on이면 true → 빈 값", () => {
    expect(DEPLOY).toContain("NEXT_PUBLIC_AI_CHAT_ENABLED: ${{ vars.NEXT_PUBLIC_AI_CHAT_ENABLED || (env.ONMOM_AI == 'on' && 'true' || '') }}");
    expect(DEPLOY.match(/NEXT_PUBLIC_AI_CHAT_ENABLED: \$\{\{/g)).toHaveLength(1); // 배포할 빌드 한 곳 — 브라우저 전용 시험 빌드에는 넣지 않는다
  });
});

describe("supabase.yml — 서버 쪽 스위치", () => {
  it('저장소 기본값이 "true"이고, 함수가 정확히 켬으로 읽는 값이다', () => {
    const value = /^ {2}ONMOM_AI_CHAT_SERVER_ENABLED: "(.*)"$/m.exec(SUPABASE)?.[1];
    expect(value).toBe("true");
    expect(isAiChatServerEnabled(value)).toBe(true);
  });

  it("Variable이 먼저다 — 형식 검사·스위치 넣기·배포 확인이 같은 값을 본다", () => {
    for (const name of ["설정 확인", "서버 쪽 AI 스위치 넣기", "배포 확인 (AI 상담 함수의 로그인 확인)"]) {
      expect(step(name), name).toContain(`AI_CHAT_SERVER_ENABLED: ${SERVER_VALUE}`);
    }
    // 예전처럼 Variable만 읽는 곳이 남지 않았다
    expect(SUPABASE).not.toContain("AI_CHAT_SERVER_ENABLED: ${{ vars.AI_CHAT_SERVER_ENABLED }}");
    // true·false 밖의 값은 멈춘다
    expect(step("설정 확인")).toContain('if [ -n "${aion}" ] && [ "${aion}" != "true" ] && [ "${aion}" != "false" ]; then');
  });

  it("스위치는 새 함수가 올라간 뒤에 넣는다 — 옛 함수 코드(약물 preset·게스트 허용)가 AI가 켜진 채 돌지 않게", () => {
    const order = ["- name: 테스트", "- name: DB 표 만들기·고치기", "- name: Edge Function 비밀값 넣기", "- name: Edge Function 배포", "- name: 서버 쪽 AI 스위치 넣기", "- name: 배포 확인"].map((s) =>
      SUPABASE.indexOf(s),
    );
    for (const at of order) expect(at).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const secrets = step("Edge Function 비밀값 넣기");
    expect(secrets).not.toContain("AI_CHAT_SERVER_ENABLED");
    expect(step("서버 쪽 AI 스위치 넣기")).toContain('supabase secrets set --project-ref "$PROJECT_REF" "AI_CHAT_SERVER_ENABLED=${value}"');
  });

  it("배포 확인은 틀린 토큰으로만 부른다 — Anthropic을 부르지 않고, 켠 값인데 꺼져 있으면 경고한다", () => {
    const smoke = step("배포 확인 (AI 상담 함수의 로그인 확인)");
    expect(smoke).toContain("Authorization: Bearer onmom-deploy-check");
    expect(smoke).toContain("::warning title=AI 상담 — 서버 쪽 스위치가 켜지지 않음::");
    expect(smoke).toContain('if [ "${AI_CHAT_SERVER_ENABLED//[[:space:]]/}" = "false" ]; then');
  });

  it("끄는 방법을 적어 둔다 — 서버 값만 지우면 다음 실행이 되살린다", () => {
    const header = SUPABASE.slice(0, SUPABASE.indexOf("name: Supabase"));
    expect(header).toContain("Variable AI_CHAT_SERVER_ENABLED=false");
    expect(header).toContain("Variable 없이는 다음 실행이 기본값으로 되살리므로");
    expect(step("결과 요약")).toContain("서버 값만 지우면 다음 실행이 되살립니다");
  });

  it("AI가 꺼져 있다고 전제하는 안내가 남지 않았다", () => {
    for (const stale of ["5단계 전", "5단계에서", "약물 표 결과", "AI_CHAT_SERVER_ENABLED=true를 넣고"]) expect(SUPABASE, stale).not.toContain(stale);
  });
});
