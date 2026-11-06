import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MaternityRecord, PersistedState, UserProfile } from "@/domain/types";
import { CURRENT_CONSENT_VERSION } from "@/domain/consent";
import { AI_CONSENT_ITEMS, AI_TRANSFER_NOTICE, REQUIRED_CONSENTS, SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { LLM_FUNCTION_MAX_MESSAGES } from "@/api/llm";
import { PUSH_SERVICE_HOSTS } from "@/features/pwa/reminderModel";
import { CHAT_MAX_MESSAGES } from "../../../supabase/functions/_shared/chat";
import { VIDEO_ROUTE_TAGS } from "@/api/video";
import { GUEST_ACCOUNT_TEXT, SETTINGS_TEXT } from "@/features/settings/settingsView";
import { CONTACT_EMAIL } from "@/features/terms/contact";
import {
  ACCESS_LOG_ITEMS,
  ACCOUNT_ITEMS,
  ADMIN_LOG_RETENTION_YEARS,
  AI_CONTEXT_MAX_MESSAGES,
  AI_TRANSFER_ITEMS,
  AI_USAGE_ITEMS,
  AI_USAGE_RETENTION_DAYS,
  ANON_CLEANUP_DAYS,
  BACKUP_RETENTION_DAYS,
  HEALTH_ITEMS,
  PUSH_ITEMS,
  SETTING_ITEMS,
  STATS_MIN_GROUP_SIZE,
} from "./dataItems";
import { policyFor } from "./policy";
import { PolicySections, PolicyWebNote } from "./PrivacyPolicy";
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_WEB_NOTE } from "./policyText";
import { OPERATOR_NAME, PRIVACY_OFFICER, SERVICE_URL, WEB_POLICY_DRAFT_LABEL, webPolicySections } from "./webPolicyText";

const web = policyFor({ serverStorage: true });
const ios = policyFor({ serverStorage: false });
const WEB_TEXT = web.sections.map((s) => `${s.title}\n${s.body}`).join("\n");
const section = (prefix: string) => web.sections.find((s) => s.title.includes(prefix))!.body;

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

describe("어느 방침을 보이나", () => {
  it("Supabase 설정이 없는 빌드 — 지금처럼 iOS 원문 + 'iOS 기준' 안내(초안 표시 없음)", () => {
    expect(ios.kind).toBe("ios");
    expect(ios.sections).toBe(PRIVACY_POLICY_SECTIONS);
    expect(ios.note).toBe(PRIVACY_POLICY_WEB_NOTE);
    expect(ios.draftLabel).toBeNull();
    expect(ios.effective).toBe("시행일: 2026년 9월 7일");
  });

  it("설정이 있는 빌드 — 2026-11-06 시행 중인 웹 방침, '시범 운영 중'을 먼저 보인다(초안·법률 검토 표시 없음)", () => {
    expect(web.kind).toBe("webDraft");
    expect(web.draftLabel).toBe("시범 운영 중");
    expect(web.title).toBe(ios.title);
    expect(web.effective).toBe("시행일: 2026년 11월 6일");
    const note = renderToStaticMarkup(h(PolicyWebNote, { policy: web }));
    expect(textOf(note).startsWith(WEB_POLICY_DRAFT_LABEL)).toBe(true);
    // 시행 중인 방침이다 — 초안·"법률 검토"를 말하지 않는다(대표 결정 2026-11-04: 바깥 법률 검토 없이 시행)
    for (const t of [web.draftLabel!, web.effective, web.note, WEB_TEXT]) {
      expect(t).not.toContain("법률 검토");
      expect(t).not.toMatch(/초안(?! 게시)/);
    }
    // iOS 방침에는 시범 표시가 없다
    expect(textOf(renderToStaticMarkup(h(PolicyWebNote, { policy: ios })))).not.toContain(WEB_POLICY_DRAFT_LABEL);
  });

  it("방침의 변경 — 고지 기간과 변경 이력(시범 시작 초안 게시 → 이 판 시행)", () => {
    const change = section("방침의 변경");
    expect(change).toContain("시행 7일 전에 이 화면에 알립니다");
    expect(change).toContain("• 2026년 10월 24일: 시범 운영 시작(초안 게시)");
    expect(change).toContain("• 2026년 11월 6일: 시행(이 판)");
    expect(change).toContain("이전 판은");
    // 이전 판 안내가 가리키는 연락처 절 번호가 실제 "보호책임자와 문의처" 절이다
    const contactNo = web.sections.find((s) => s.title.includes("문의처"))!.title.match(/^(\d+)\./)![1];
    expect(change).toContain(`${contactNo}절 연락처`);
  });

  it("본문은 고른 방침 그대로 그린다(절 제목 = 제목 요소)", () => {
    const markup = renderToStaticMarkup(h(PolicySections, { policy: web, headingLevel: "h2" }));
    const h2 = [...markup.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1]);
    expect(h2).toEqual(web.sections.map((s) => s.title));
    expect(textOf(markup)).toContain("Anthropic, PBC");
  });
});

describe("웹 초안 — 법정 기재 사항(개인정보보호법 §30·시행령 §31)", () => {
  it("절 목록", () => {
    const titles = web.sections.map((s) => s.title.replace(/^\d+\.\s*/, ""));
    for (const t of [
      "처리하는 개인정보 항목",
      "처리 목적",
      "보유 기간과 파기",
      "국외 이전",
      "처리 위탁",
      "제3자 제공",
      "민감정보",
      "만 14세 미만",
      "쿠키",
      "안전성 확보 조치",
      "이용자의 권리",
      "AI 상담",
      "의료 관련 고지",
      "보호책임자",
      "권익침해 구제",
      "방침의 변경",
    ]) {
      expect(titles.some((x) => x.includes(t)), t).toBe(true);
    }
    // 번호가 1부터 이어진다
    web.sections.forEach((s, i) => expect(s.title.startsWith(`${i + 1}. `), s.title).toBe(true));
    expect(new Set(web.sections.map((s) => s.title)).size).toBe(web.sections.length);
  });

  it("수집 항목 — 계정(게스트 식별자·카카오 회원번호·닉네임·이메일·사진 주소)과 건강 정보", () => {
    const items = section("항목");
    for (const word of ["게스트", "카카오 회원번호", "닉네임", "이메일", "프로필 사진 주소", "IP 주소"]) expect(items).toContain(word);
    expect(items).toContain(HEALTH_ITEMS);
    expect(items).toContain(SETTING_ITEMS);
    expect(items).toContain(ACCOUNT_ITEMS);
  });

  it("보유·파기 — 계정 삭제 시 즉시 삭제", () => {
    expect(section("보유 기간")).toMatch(/계정 삭제를 실행하면 .*즉시 삭제/);
  });

  it("AI 상담 이용 시각(사용 한도 기록) — 항목(2절)·목적(3절)·보유 기간 2일(5절)", () => {
    expect(section("항목")).toContain(`(AI 상담을 쓴 경우) ${AI_USAGE_ITEMS}`);
    expect(section("처리 목적")).toContain("AI 상담 이용 한도 계산");
    expect(section("보유 기간")).toContain(`AI 상담 이용 시각은 이용 한도 계산에만 쓰고 ${AI_USAGE_RETENTION_DAYS}일이 지나면 자동으로 삭제합니다.`);
  });

  it("계정 삭제로 끊기지 않는 카카오 연결 — 사용자가 끊는 방법을 알린다(5절)", () => {
    expect(section("보유 기간")).toContain("카카오계정 설정 > 연결된 서비스 관리에서 온맘 연결을 끊을 수 있습니다");
  });

  it("동의하지 않기 — 동의 화면의 버튼 이름 그대로 권리 절(13절)에 적는다", () => {
    expect(section("권리")).toContain(`[${SERVER_CONSENT_TEXT.decline}]로 계정과 모든 데이터를 즉시 삭제`);
  });

  it("수탁자·국외 이전 — Supabase(계약 주체 Supabase Pte. Ltd.·싱가포르, 저장은 서울), GitHub Pages, 카카오, Anthropic(미국), Render", () => {
    const transfer = section("국외 이전");
    expect(transfer).toContain("② Supabase Pte. Ltd. (싱가포르)");
    expect(transfer).toContain("대한민국(서울, Amazon Web Services 데이터센터)에 저장합니다");
    expect(transfer).not.toContain("Supabase, Inc.");
    expect(transfer).toMatch(/Anthropic, PBC \(미국\)/);
    expect(transfer).toMatch(/GitHub, Inc\. \(미국\)/);
    // 이전받는 자의 연락처(법 §28의8②3) — 공개 고지에서 확인한 주소
    for (const contact of ["privacy@anthropic.com", "privacy@supabase.com", "privacy@github.com"]) expect(transfer).toContain(`– 연락처: ${contact}`);
    // 이전의 근거(시행령 §31①2) — AI는 별도 동의(①1), 나머지는 계약 이행에 필요한 처리위탁·보관을 방침에 공개(①3)
    expect(transfer).toContain("제28조의8제1항제1호");
    expect(transfer).toContain("같은 항 제3호");
    // 국외 이전 블록마다 법 §28의8② 항목
    for (const word of ["이전 항목", "이전 시기·방법", "목적", "보유 기간", "거부 방법과 효과"]) {
      expect(transfer.split(word).length - 1, word).toBeGreaterThanOrEqual(4);
    }
    // AI에는 같은 대화의 최근 메시지와 최소 맥락만
    expect(transfer).toContain(`– 이전 항목: ${AI_TRANSFER_ITEMS}`);
    const processors = section("처리 위탁");
    for (const name of ["Supabase Pte. Ltd.", "GitHub, Inc.", "GitHub Pages", "주식회사 카카오", "Anthropic, PBC", "Render"]) {
      expect(processors).toContain(name);
    }
    expect(processors).not.toContain("Supabase, Inc.");
    // 재수탁자 확인 경로(법 §26②)
    expect(processors).toContain("https://supabase.com/legal/subprocessors");
  });

  it("Cloudflare Turnstile은 쓸 때만 적는다", () => {
    expect(WEB_TEXT).not.toContain("Cloudflare");
    const withTurnstile = webPolicySections({ turnstile: true, reminders: false })
      .map((s) => s.body)
      .join("\n");
    expect(withTurnstile).toContain("Cloudflare, Inc.");
    expect(withTurnstile).toContain("Turnstile");
    expect(withTurnstile).toContain("⑥ Cloudflare, Inc. (미국)\n– 연락처: dpo@cloudflare.com");
    // 동의 전에 처리하는 정보(2절 가)에도 — 게스트 시작 때 Cloudflare가 받는다
    expect(withTurnstile).toContain("• 자동 가입 방지를 쓰는 동안에는 게스트로 시작할 때 Cloudflare가 접속 기록과 브라우저 확인 정보를 받습니다(6절).");
  });

  it("오래된 게스트 계정 자동 삭제(서버 저장 전이면 30일) — 5절, 늘(Supabase 빌드)", () => {
    expect(section("보유 기간")).toContain(
      `서버에 기록을 한 번도 저장하지 않은 게스트 계정(동의 전에 멈춘 경우 등)은 만든 지 ${ANON_CLEANUP_DAYS}일이 지나면 자동으로 삭제합니다.`,
    );
  });

  it(`AI 국외 이전 — 같은 대화의 최근 메시지(최대 ${AI_CONTEXT_MAX_MESSAGES}개, 이전 AI 답변 포함)를 보낸다고 적는다(웹·서버 한도와 같은 수)`, () => {
    expect(AI_CONTEXT_MAX_MESSAGES).toBe(LLM_FUNCTION_MAX_MESSAGES);
    expect(AI_CONTEXT_MAX_MESSAGES).toBe(CHAT_MAX_MESSAGES);
    const anthropic = section("국외 이전").split("\n\n").find((b) => b.includes("Anthropic, PBC (미국)"))!;
    expect(anthropic).toContain(`같은 대화의 최근 메시지 최대 ${AI_CONTEXT_MAX_MESSAGES}개, 이전 AI 답변 포함`);
  });
});

describe("웹 초안 — 매일 리마인더(웹 푸시)를 켤 수 있는 빌드", () => {
  const withReminders = webPolicySections({ turnstile: false, reminders: true });
  const part = (prefix: string) => withReminders.find((s) => s.title.includes(prefix))!.body;
  const both = webPolicySections({ turnstile: true, reminders: true });

  it("켤 수 없는 빌드(기본)에는 알림 정보·푸시 서비스를 적지 않는다(쓰지 않는 업체를 적지 않는다)", () => {
    expect(WEB_TEXT).not.toContain(PUSH_ITEMS);
    expect(WEB_TEXT).not.toContain("푸시 서비스");
  });

  it("2절 항목(켠 경우에만) · 3절 목적 · 5절 보유(끄기·계정 삭제 즉시)", () => {
    expect(part("항목")).toContain(`• 알림 정보(매일 리마인더를 켠 경우에만): ${PUSH_ITEMS}`);
    expect(part("처리 목적")).toContain("매일 저녁 8시 회복 체크 알림");
    expect(part("보유 기간")).toContain("알림 정보는 알림을 끄거나 계정을 삭제하면 즉시 삭제합니다.");
  });

  it("6절 — 알림을 전달하는 브라우저 푸시 서비스(국외, 브라우저 제조사가 정함), 받는 푸시 서비스 목록과 같은 네 곳", () => {
    const push = part("국외 이전").split("\n\n").find((b) => b.includes("브라우저 푸시 서비스"))!;
    expect(push.startsWith("⑥ 브라우저 푸시 서비스")).toBe(true);
    // 받는 푸시 서비스(reminderModel PUSH_SERVICE_HOSTS — 0004 check 제약과 같은 목록)마다 회사가 적혀 있다
    const company: Record<(typeof PUSH_SERVICE_HOSTS)[number], string> = {
      "fcm.googleapis.com": "Google LLC",
      "push.services.mozilla.com": "Mozilla Corporation",
      "notify.windows.com": "Microsoft Corporation",
      "push.apple.com": "Apple Inc.",
    };
    for (const host of PUSH_SERVICE_HOSTS) expect(push, host).toContain(company[host]);
    expect(push).toContain("브라우저의 제조사가 정합니다");
    expect(push).toContain("건강 정보는 담지 않습니다");
    for (const word of ["이전 항목", "이전 시기·방법", "목적", "보유 기간", "거부 방법과 효과"]) expect(push, word).toContain(word);
  });

  it("번호는 빠진 블록 없이 이어진다 — 고정 블록 뒤에 푸시 ⑥, Cloudflare ⑦", () => {
    const transfer = both.find((s) => s.title.includes("국외 이전"))!.body;
    const heads = transfer
      .split("\n")
      .filter((l) => /^[①-⑧] /.test(l))
      .map((l) => l.slice(0, 1));
    expect(heads).toEqual(["①", "②", "③", "④", "⑤", "⑥", "⑦"]);
    expect(transfer).toContain("⑦ Cloudflare, Inc. (미국)");
    // AI 상담 국외 이전은 늘 ①(4절이 "6절 ①"로 가리킨다)
    expect(transfer).toContain("① Anthropic, PBC (미국)");
    expect(both.find((s) => s.title.includes("동의를 받는 방법"))!.body).toContain("(6절 ①)");
  });

  it("권리(열람·정정·삭제·처리 정지·동의 철회), 14세 미만, 쿠키·브라우저 저장소, 문의처, 구제 기관", () => {
    expect(section("권리")).toMatch(/열람·정정·삭제하거나 처리 정지/);
    expect(section("권리")).toContain("동의를 철회");
    expect(section("만 14세")).toContain("만 14세 미만");
    expect(section("쿠키")).toContain("localStorage");
    for (const n of ["1833-6972", "118", "1301", "182"]) expect(section("구제")).toContain(n);
  });

  it("웹에서 사실이 아닌 iOS 문구가 없다 — 기기에만 저장·회원 DB 없음·Apple·iCloud·'연결 전'", () => {
    for (const bad of ["기기에만 저장", "회원 데이터베이스를 운영하지 않습니다", "Apple", "iCloud", "연결되어 있지 않아", "어떤 경우에도 전송되지 않습니다"]) {
      expect(WEB_TEXT, bad).not.toContain(bad);
    }
  });

});

describe("웹 방침 — 2026-11-06 시행판에서 사실에 맞춘 것", () => {
  it("운영 주체와 서비스 주소(1절) — 개인 이름 없이 '온맘 운영자'", () => {
    expect(OPERATOR_NAME).toBe("온맘 운영자");
    expect(SERVICE_URL).toBe("https://onmomcare.app");
    expect(section("총칙")).toContain(`${OPERATOR_NAME}(이하 '온맘')는`);
    expect(section("총칙")).toContain(`온맘 웹 서비스(${SERVICE_URL})`);
  });

  it("동의하기 전에 처리하는 정보(2절 가) — 게스트는 계정 ID와 접속 기록뿐, 근거 법 §15①4, 동의 전에는 건강 정보를 서버에 두지 않음, 30일 정리", () => {
    const items = section("항목");
    const before = items.slice(items.indexOf("가. "), items.indexOf("나. "));
    expect(before).toContain("가. 동의하기 전에 처리하는 정보(개인정보 보호법 제15조제1항제4호");
    expect(before).toContain(
      `• [게스트로 시작]을 누르면 동의 화면보다 먼저 게스트 계정이 만들어집니다. 이때 처리하는 정보는 임의로 만든 계정 ID와 서버 업체(Supabase)가 남기는 ${ACCESS_LOG_ITEMS}뿐입니다.`,
    );
    expect(before).toContain("[카카오로 시작하기]로 처음 로그인하면 동의 화면보다 먼저");
    expect(before).toContain("동의하기 전에는 건강 정보를 서버에 저장하지 않습니다.");
    expect(before).toContain(`[${SERVER_CONSENT_TEXT.decline}]를 누르면 계정을 바로 삭제합니다.`);
    expect(before).toContain(`만든 지 ${ANON_CLEANUP_DAYS}일이 지나면 자동으로 삭제합니다.`);
    // 건강 정보는 "나. 동의를 받아 처리하는 정보"에만 있다
    expect(before).not.toContain(HEALTH_ITEMS);
    expect(items.slice(items.indexOf("나. 동의를 받아 처리하는 정보"))).toContain(`• 건강 정보(민감정보): ${HEALTH_ITEMS}`);
  });

  it(`서비스 개선 통계 — 개인을 알아볼 수 없는 집계만, ${STATS_MIN_GROUP_SIZE}명 미만인 칸은 숨김, 운영자는 개인별 기록을 보지 않음(3절 목적·9절 민감정보)`, () => {
    expect(STATS_MIN_GROUP_SIZE).toBe(5);
    expect(section("처리 목적")).toContain(
      "• 서비스 개선을 위한 통계 - 개인을 알아볼 수 없는 집계만 만들고(5명 미만인 칸은 숨김), 운영자는 개인별 건강 기록을 보지 않습니다",
    );
    expect(section("민감정보")).toContain("개인을 알아볼 수 없는 통계에 씁니다");
  });

  it(`보유 기간(5절) — 백업 최대 ${BACKUP_RETENTION_DAYS}일, 관리자 기록 ${ADMIN_LOG_RETENTION_YEARS}년, 운영자 직접 접근 기록 2년, 파기 절차`, () => {
    const keep = section("보유 기간");
    expect(keep).toContain(`• 데이터베이스 백업에 남은 사본은 최대 ${BACKUP_RETENTION_DAYS}일 동안 보관된 뒤 삭제됩니다.`);
    expect(keep).not.toContain("30일 안에 삭제");
    expect(keep).toMatch(
      new RegExp(`관리자 기록\\(관리 화면에서 계정 정보를 조회·내려받기·삭제할 때마다 [^)]*\\)은 ${ADMIN_LOG_RETENTION_YEARS}년 동안 보관한 뒤 자동으로 삭제합니다\\.`),
    );
    expect(keep).toContain("데이터베이스에 직접 접근한 기록");
    expect(keep).toContain("보유 기간이 끝나거나 처리 목적을 이루면 지체 없이 파기");
  });

  it("안전성 확보 조치(12절) — 사실이 아닌 '관리자 2단계 인증'이 없고, 관리 화면 기록 2년이 있다", () => {
    const safety = section("안전성 확보 조치");
    expect(WEB_TEXT).not.toContain("2단계 인증");
    expect(safety).toContain("관리자 계정은 꼭 필요한 최소한의 사람에게만 줍니다.");
    expect(safety).toContain(`그 기록을 ${ADMIN_LOG_RETENTION_YEARS}년 동안 보관합니다.`);
  });

  it("AI 상담이 켜진 판 — '꺼져 있다'는 말이 어느 절에도 없고, 약물·음식 체크의 AI 답변을 적지 않는다", () => {
    expect(WEB_TEXT).not.toMatch(/꺼져 있/);
    expect(WEB_TEXT).not.toContain("켜면");
    expect(WEB_TEXT).not.toContain("약물·음식 체크(안전표에 없는 항목)");
    expect(WEB_TEXT.split("약물·음식 체크").length - 1).toBe(1); // 14절 "AI를 쓰지 않습니다" 한 곳
  });

  it("AI 상담(14절) — 목적·대상(카카오 계정만)·쓰는 곳(상담만)·항목·저장·학습·거부·안전·한계·신고", () => {
    const ai = section("AI 상담(생성형 AI)");
    expect(ai).toContain("시범 운영 동안에는 카카오 계정에서만 쓸 수 있습니다.");
    expect(ai).toContain("게스트의 질문은 AI 업체로 보내지 않고 온맘에 담긴 안내로 답하며, 카카오 계정을 연결하면 쓸 수 있습니다.");
    expect(ai).toContain("AI는 AI 상담에만 씁니다. 약물·음식 체크는 AI를 쓰지 않고 안전표만 보며, 표에 없는 항목은 정보 부족으로 안내합니다.");
    expect(ai).toContain(`• 처리 항목: ${AI_TRANSFER_ITEMS}, AI가 만든 답변.`);
    expect(ai).toContain("온맘 서버는 대화 내용과 AI 답변을 저장하지 않습니다.");
    expect(ai).toContain("온맘은 이용자의 대화를 AI 학습에 쓰지 않습니다.");
    expect(ai).toContain("설정 > 내 데이터의 [AI 답변 동의 철회]");
    expect(ai).toContain("자해·자살을 뜻하는 표현이 있으면 AI로 보내지 않고 위기 상담 연락처를 안내합니다.");
    expect(ai).toContain("틀릴 수 있으며, 진단이나 치료를 대신하지 않습니다. 응급 상황에서는 바로 119에 연락하세요.");
    // 답변 신고 — 제목만 채운 메일, 대화 내용은 담기지 않는다(ChatScreen과 같은 사실)
    expect(ai).toContain("AI 답변 아래 [답변 신고]를 누르면 16절 연락처로 보내는 메일이 열립니다. 메일에는 제목만 채워지고 대화 내용은 담기지 않습니다.");
  });

  it("6절 ① — 받는 자·연락처·별도 동의·항목·국가·서울 리전·목적·보유 기간·거부와 철회(법 §28의8②)", () => {
    const anthropic = section("국외 이전").split("\n\n").find((b) => b.includes("Anthropic, PBC (미국)"))!;
    expect(anthropic.startsWith("① Anthropic, PBC (미국)\n– 연락처: privacy@anthropic.com\n")).toBe(true);
    expect(anthropic).toContain("AI 상담을 처음 쓸 때 국외 이전에 대해 따로 동의를 받은 뒤에만 보냅니다.");
    expect(anthropic).toContain("시범 운영 동안 AI 상담은 카카오 계정에서만 쓸 수 있습니다.");
    expect(anthropic).toContain("– 이전 국가: 미국");
    expect(anthropic).toContain("온맘 서버 함수(대한민국 서울 리전)를 거쳐 암호화된 통신(HTTPS)으로 전송");
    expect(anthropic).toContain("받은 날부터 30일 안에 삭제합니다.");
    expect(anthropic).toContain("이용정책 위반이 의심되어 분류된 대화는 최대 2년, 그 분류 결과는 최대 7년 보관할 수 있습니다(Anthropic 공개 정책 기준).");
    expect(anthropic).toContain("온맘 서버는 대화 내용을 저장하지 않습니다.");
    expect(anthropic).toContain("[AI 답변 동의 철회]로 언제든 멈출 수 있습니다.");
  });

  it("2·3·4·5·7·9·13절 — AI 상담은 카카오 계정에서 따로 동의한 경우에만, 철회 경로와 기록 삭제", () => {
    expect(section("항목")).toContain(`• AI 상담을 쓰는 경우(카카오 계정에서 따로 동의한 경우에만): ${AI_TRANSFER_ITEMS}.`);
    expect(section("처리 목적")).toContain("• (카카오 계정에서 따로 동의한 경우) AI 상담의 답변 생성");
    const consent = section("동의를 받는 방법");
    expect(consent).toContain("AI 상담의 민감정보 처리와 국외 이전(6절 ①)은 AI 상담을 처음 쓸 때 각각 따로 동의를 받습니다.");
    expect(consent).toContain("게스트에게는 이 동의를 묻지 않고 온맘에 담긴 안내로 답합니다.");
    expect(consent).toContain("설정 > 내 데이터의 [AI 답변 동의 철회]로 따로 철회할 수 있습니다.");
    expect(consent).toContain("다시 동의하기 전에는 AI 업체로 보내지 않습니다");
    expect(section("보유 기간")).toContain("AI 상담 동의 기록(동의한 판과 일시, 두 동의 여부)은 철회하거나 계정을 삭제하면 즉시 삭제합니다.");
    expect(section("처리 위탁")).toContain("• Anthropic, PBC: AI 상담의 답변 생성(카카오 계정 이용자가 따로 동의한 경우에만)");
    expect(section("민감정보")).toContain("AI 상담의 답변 생성에는 따로 동의한 경우에만 씁니다(14절).");
    expect(section("이용자의 권리")).toContain("철회 전에 이미 보낸 내용은 6절 ①의 보유 기간에 따라 삭제됩니다.");
  });

  it("의료 관련 고지(15절) — 의료기기가 아님(식약처 권고 주의 문구), 진단·치료·판단을 하지 않음, 일반 정보와 본인 기록, 결정은 의료진, 응급은 119", () => {
    const medical = section("의료 관련 고지");
    expect(medical).toContain("온맘은 의료기기가 아니므로 질병 유무를 판단할 수 없으며, 질병 유무 판단을 위해서는 의사의 검진이 필요합니다.");
    expect(medical).toContain("질병을 진단하거나 치료하지 않고, 몸 상태를 판단하지 않습니다.");
    expect(medical).toContain("일반적인 건강 정보와 이용자가 직접 입력한 기록을 보여 줄 뿐입니다.");
    expect(medical).toContain("진단과 치료에 관한 결정은 의료진이 합니다.");
    expect(medical).toContain("119");
    // iOS 원문 한 줄(설정 없는 빌드의 방침 6절)은 바꾸지 않았다 — 그 빌드에는 그대로 남는다
    expect(PRIVACY_POLICY_SECTIONS.find((s) => s.title.includes("의료 관련 고지"))!.body).toBe(
      "온맘은 의료기기가 아니며, 제공되는 정보는 참고용입니다. 진단·치료에 관한 판단은 반드시 의료진과 상담하세요.",
    );
  });

  it("개인정보 보호책임자(16절) — 직책·업무·연락처, 이메일은 문의 링크와 같은 한 곳(contact.ts)에서", () => {
    expect(PRIVACY_OFFICER).toBe("온맘 운영 책임자(대표)");
    expect(CONTACT_EMAIL).toBe("inmani1555@gmail.com");
    expect(section("보호책임자")).toBe(
      [`• 개인정보 보호책임자: ${PRIVACY_OFFICER}`, "• 개인정보 보호 업무와 고충 처리도 개인정보 보호책임자가 맡습니다.", `• 연락처: ${CONTACT_EMAIL}`].join("\n"),
    );
  });

  it("다른 절을 가리키는 번호가 실제 절과 맞는다", () => {
    const no = (prefix: string) => web.sections.find((s) => s.title.includes(prefix))!.title.match(/^(\d+)\./)![1];
    expect(section("권리")).toContain(`${no("문의처")}절 연락처`);
    expect(section("방침의 변경")).toContain(`${no("문의처")}절 연락처`);
    expect(section("처리 목적")).toContain(`(${no("AI 상담")}절)`);
    expect(section("동의를 받는 방법")).toContain(`(${no("이용자의 권리")}절)`);
    expect(section("동의를 받는 방법")).toContain(`${no("항목")}절 가`);
    expect(section("민감정보")).toContain(`(${no("보유 기간")}절)`);
    expect(section("국외 이전")).toContain(`${no("처리 위탁")}절에 적은 주소`);
  });

  it("이용자의 권리(13절) — 내려받기, 10일 안 처리, 계정 ID, 대리인 위임장, 이의제기", () => {
    const rights = section("권리");
    expect(rights).toContain("설정 > 내 데이터 내려받기");
    expect(rights).toContain("요구를 받은 날부터 10일 안에 처리하고 결과를 알려 드립니다.");
    expect(rights).toContain("설정 > 내 데이터에 보이는 계정 ID");
    expect(rights).toContain("위임장");
    expect(rights).toContain("이의를 제기할 수 있습니다");
  });

  it("운동 영상 — 서버 함수가 두 분만 경로를 늘 함께 묻는 것과 같게 적는다(방침 6절 Render·동의 안내 둘째 줄)", () => {
    expect(VIDEO_ROUTE_TAGS).toHaveLength(2);
    const render = section("국외 이전").split("\n\n").find((b) => b.includes("Render (미국)"))!;
    expect(render).toContain("두 분만 방식의 값을 늘 함께 보내며, 이용자를 알아볼 수 있는 정보는 보내지 않습니다");
    expect(render).not.toContain("분만 방식에 따른");
    expect(SERVER_CONSENT_TEXT.lines[1]).toBe("운동 영상은 두 분만 방식의 목록을 함께 받음 · 영상 서버로 내 정보를 보내지 않음");
  });

  it("계정 삭제 안내 — 방침에서 처음 나오는 곳(4절)에 게스트 버튼 이름도 적는다, 실제 버튼 이름과 같다", () => {
    expect(SETTINGS_TEXT.deleteAccount).toBe("계정 삭제");
    const first = web.sections.find((s) => s.body.includes("설정 > 계정 삭제"))!;
    expect(first.title).toContain("동의를 받는 방법");
    expect(first.body).toContain(`설정 > ${SETTINGS_TEXT.deleteAccount}(게스트 화면의 이름은 [${GUEST_ACCOUNT_TEXT.deleteAccount}]입니다. 아래에서도 같습니다)`);
    expect(WEB_TEXT).not.toContain("이 기기에서 기록 지우기");
  });

  it("메일 문의 — 항목·근거(법 §15①4)·보유 기간 1년(2·5절), Google LLC(미국)를 7절 위탁·6절 ⑤ 국외 이전에", () => {
    const items = section("항목");
    const inquiry = items.slice(items.indexOf("다. "), items.indexOf("수집 방법:"));
    expect(inquiry).toContain("다. 메일로 문의할 때 처리하는 정보(개인정보 보호법 제15조제1항제4호 - 이용자의 요청 처리)");
    expect(inquiry).toContain("• 처리 항목: 이메일 주소, 문의 내용");
    expect(inquiry).toContain("처리를 마친 날부터 1년이 지나면 삭제합니다(5절).");
    expect(inquiry).toContain("Google LLC(미국)의 Gmail로 받습니다(6절 ⑤).");
    expect(inquiry).toContain("문의 메일에는 건강 정보를 적지 말아 주세요.");
    expect(items).toContain("수집 방법: 이용자가 화면에 직접 입력하거나 메일로 보내거나,");
    expect(section("보유 기간")).toContain("• 메일 문의(이메일 주소, 문의 내용)는 처리를 마친 날부터 1년이 지나면 삭제합니다.");
    expect(section("처리 위탁")).toContain("• Google LLC: 문의 메일 수신·보관(Gmail)");

    const gmail = section("국외 이전").split("\n\n").find((b) => b.includes("문의 메일(Gmail)"))!;
    expect(gmail.startsWith("⑤ Google LLC (미국) - 문의 메일(Gmail)\n")).toBe(true);
    // 받는 자 연락처 — 확인한 주소가 없어 공개 방침 링크로 적는다(주소를 지어내지 않는다)
    expect(gmail).toContain("https://policies.google.com/privacy");
    expect(gmail).not.toMatch(/[A-Za-z0-9._%+-]+@/);
    // 법 §28의8② 항목
    for (const word of ["이전 항목", "이전 시기·방법", "목적", "보유 기간", "거부 방법과 효과"]) expect(gmail, word).toContain(word);
    // 선택 블록과 상관없이 ⑤ — 2절이 "6절 ⑤"로 가리킨다
    for (const o of [{ turnstile: true, reminders: true, youtube: true }, { turnstile: true, reminders: false }, { turnstile: false, reminders: true }]) {
      expect(webPolicySections(o).find((s) => s.title.includes("국외 이전"))!.body).toContain("⑤ Google LLC (미국) - 문의 메일(Gmail)");
    }
  });

  it("메일 문의는 동의 문구에 넣지 않는다 — 동의가 아니라 이용자의 요청 처리, 동의 판은 그대로", () => {
    const consent = JSON.stringify([SERVER_CONSENT_TEXT, REQUIRED_CONSENTS, AI_TRANSFER_NOTICE, AI_CONSENT_ITEMS]);
    for (const word of ["Gmail", "Google", "문의 내용", "이메일 주소,"]) expect(consent, word).not.toContain(word);
    expect(CURRENT_CONSENT_VERSION).toBe("web-2026-11-06");
  });

  it("만 14세 미만(10절) — 알게 되면 지체 없이 삭제", () => {
    expect(section("만 14세")).toContain("만 14세 미만인 것을 알게 되면 그 계정과 기록을 지체 없이 삭제합니다.");
  });
});

describe("수집 항목이 실제 저장 상태를 빠짐없이 덮는다", () => {
  // 필드를 더하면 여기서 타입 오류가 난다 — 처리방침·동의 문구(dataItems.ts)에도 더한다
  const PROFILE_WORDS: Record<keyof UserProfile, string> = {
    deliveryDate: "출산일",
    deliveryMethod: "분만 방식",
    goal: "회복 목표",
    returnToWorkDate: "복직 예정일",
    isBreastfeeding: "수유 여부",
    consentAccepted: "동의한 내용과 일시",
    consentVersion: "동의한 내용과 일시",
    consentAcceptedAt: "동의한 내용과 일시",
    heightCm: "키",
    currentWeightKg: "현재 체중",
    prePregnancyWeightKg: "임신 전 체중",
    neighborhood: "내 동네",
  };
  const MATERNITY_WORDS: Record<keyof MaternityRecord, string> = {
    isPrimiparous: "첫 출산",
    gdm: "임신성 당뇨",
    anemia: "빈혈",
    heavyBleeding: "출혈",
    preeclampsia: "임신중독증",
    pelvicPain: "골반통",
    diastasisRecti: "복직근 이개",
  };
  /** null = 개인정보가 아닌 앱 상태(화면 표시용) */
  const STATE_WORDS: Record<keyof PersistedState, string | null> = {
    hasOnboarded: null,
    profile: null, // PROFILE_WORDS
    maternity: "산모수첩 확인 항목 7개",
    symptomHistory: "증상 기록",
    communityPosts: "기록장 글과 메모",
    ownerAccountID: "이용자 식별자",
    moodChecks: "오늘의 질문(기분) 답변",
    moodCardSnoozedUntil: null,
  };

  const ALL_ITEMS = [ACCOUNT_ITEMS, HEALTH_ITEMS, SETTING_ITEMS].join(" ");

  it.each(Object.entries(PROFILE_WORDS))("프로필 %s → %s", (_, word) => expect(ALL_ITEMS).toContain(word));
  it.each(Object.entries(MATERNITY_WORDS))("산모수첩 %s → %s", (_, word) => expect(HEALTH_ITEMS).toContain(word));
  it.each(Object.entries(STATE_WORDS).filter(([, w]) => w !== null))("상태 %s → %s", (_, word) => expect(ALL_ITEMS).toContain(word!));
});

// AI 상담 이용 기록의 보관 기간 — 서버(0003_llm_usage.sql)의 지우는 기준과 문구의 숫자가 같아야 한다
const LLM_USAGE_SQL = fileURLToPath(new URL("../../../supabase/migrations/0003_llm_usage.sql", import.meta.url));
// 관리자 기록(admin_audit)의 보존 기간 — 서버(0009_admin_access_log.sql)의 매일 정리 기준과 같아야 한다
const ADMIN_LOG_SQL = fileURLToPath(new URL("../../../supabase/migrations/0009_admin_access_log.sql", import.meta.url));

describe("문구의 숫자 = 서버 동작", () => {
  it.skipIf(!existsSync(LLM_USAGE_SQL))("AI 상담 이용 시각 보유 기간(일) = llm_usage를 지우는 기준", () => {
    const sql = readFileSync(LLM_USAGE_SQL, "utf8");
    expect(sql).toMatch(new RegExp(`delete from public\\.llm_usage where created_at < now\\(\\) - interval '${AI_USAGE_RETENTION_DAYS} days'`));
  });

  it.skipIf(!existsSync(ADMIN_LOG_SQL))("관리자 기록 보유 기간(년) = admin_audit를 지우는 기준", () => {
    const sql = readFileSync(ADMIN_LOG_SQL, "utf8");
    expect(sql).toMatch(new RegExp(`delete from public\\.admin_audit where at < now\\(\\) - interval '${ADMIN_LOG_RETENTION_YEARS} years'`));
  });
});

// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 대조하고, CI에서는 건너뛴다.
const POLICY_SWIFT = fileURLToPath(new URL("../../../web/reference/swift/PrivacyPolicyView.swift", import.meta.url));

describe("원문 대조", () => {
  it.skipIf(!existsSync(POLICY_SWIFT))("웹 방침 16절의 연락처 = iOS 방침 원문 문의처의 주소(2026-11-06부터 문의처·의료 고지의 나머지 글자는 웹 신규 문구)", () => {
    const src = readFileSync(POLICY_SWIFT, "utf8");
    expect(src).toContain(`개인정보 관련 문의: ${CONTACT_EMAIL}`);
    expect(section("보호책임자")).toContain(`• 연락처: ${CONTACT_EMAIL}`);
  });
});
