import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MaternityRecord, PersistedState, UserProfile } from "@/domain/types";
import { SERVER_CONSENT_TEXT } from "@/features/onboarding/consentText";
import { LLM_FUNCTION_MAX_MESSAGES } from "@/api/llm";
import { PUSH_SERVICE_HOSTS } from "@/features/pwa/reminderModel";
import { CHAT_MAX_MESSAGES } from "../../../supabase/functions/_shared/chat";
import {
  ACCOUNT_ITEMS,
  AI_CONTEXT_MAX_MESSAGES,
  AI_USAGE_ITEMS,
  AI_USAGE_RETENTION_DAYS,
  ANON_CLEANUP_DAYS,
  HEALTH_ITEMS,
  PUSH_ITEMS,
  SETTING_ITEMS,
} from "./dataItems";
import { policyFor } from "./policy";
import { PolicySections, PolicyWebNote } from "./PrivacyPolicy";
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_WEB_NOTE } from "./policyText";
import { WEB_POLICY_DRAFT_LABEL, webPolicySections } from "./webPolicyText";

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

  it("설정이 있는 빌드 — 웹 초안, '초안 — 법률 검토 전'을 먼저 보인다", () => {
    expect(web.kind).toBe("webDraft");
    expect(web.draftLabel).toBe("초안 — 법률 검토 전");
    expect(web.title).toBe(ios.title);
    expect(web.effective).toContain("법률 검토 후");
    const note = renderToStaticMarkup(h(PolicyWebNote, { policy: web }));
    expect(textOf(note).startsWith(WEB_POLICY_DRAFT_LABEL)).toBe(true);
    // iOS 방침에는 초안 표시가 없다
    expect(textOf(renderToStaticMarkup(h(PolicyWebNote, { policy: ios })))).not.toContain(WEB_POLICY_DRAFT_LABEL);
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

  it("수탁자·국외 이전 — Supabase(서울 리전·미국 법인), GitHub Pages, 카카오, Anthropic(미국), Render", () => {
    const transfer = section("국외 이전");
    expect(transfer).toMatch(/Supabase, Inc\. \(미국 법인 · 저장 위치 대한민국 서울 리전\)/);
    expect(transfer).toMatch(/Anthropic, PBC \(미국\)/);
    expect(transfer).toMatch(/GitHub, Inc\. \(미국\)/);
    // 국외 이전 블록마다 법 §28의8② 항목
    for (const word of ["이전 항목", "이전 시기·방법", "목적", "보유 기간", "거부 방법과 효과"]) {
      expect(transfer.split(word).length - 1, word).toBeGreaterThanOrEqual(4);
    }
    // AI에는 질문 내용과 최소 맥락만
    expect(transfer).toContain("질문 내용, 산후 주차, 분만 방식, 수유 여부");
    const processors = section("처리 위탁");
    for (const name of ["Supabase, Inc.", "GitHub, Inc.", "GitHub Pages", "주식회사 카카오", "Anthropic, PBC", "Render"]) {
      expect(processors).toContain(name);
    }
  });

  it("Cloudflare Turnstile은 쓸 때만 적는다", () => {
    expect(WEB_TEXT).not.toContain("Cloudflare");
    const withTurnstile = webPolicySections({ turnstile: true, reminders: false })
      .map((s) => s.body)
      .join("\n");
    expect(withTurnstile).toContain("Cloudflare, Inc.");
    expect(withTurnstile).toContain("Turnstile");
    expect(withTurnstile).toContain("⑤ Cloudflare, Inc. (미국)");
  });

  it("오래된 게스트 계정 자동 삭제(서버 저장 전이면 30일) — 5절, 늘(Supabase 빌드)", () => {
    expect(section("보유 기간")).toContain(
      `서버에 기록을 한 번도 저장하지 않은 게스트 계정(동의 전에 멈춘 경우 등)은 만든 지 ${ANON_CLEANUP_DAYS}일이 지나면 자동으로 삭제합니다.`,
    );
  });

  it(`AI 국외 이전 — 질문 내용에 같은 대화의 최근 메시지(최대 ${AI_CONTEXT_MAX_MESSAGES}개)가 함께 담긴다고 적는다(웹·서버 한도와 같은 수)`, () => {
    expect(AI_CONTEXT_MAX_MESSAGES).toBe(LLM_FUNCTION_MAX_MESSAGES);
    expect(AI_CONTEXT_MAX_MESSAGES).toBe(CHAT_MAX_MESSAGES);
    const anthropic = section("국외 이전").split("\n\n").find((b) => b.includes("Anthropic, PBC (미국)"))!;
    expect(anthropic).toContain(`최근 메시지(이전 질문과 AI 답변을 합해 최대 ${AI_CONTEXT_MAX_MESSAGES}개)`);
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
    expect(push.startsWith("⑤ 브라우저 푸시 서비스")).toBe(true);
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

  it("번호는 빠진 블록 없이 이어진다 — 둘 다 쓰면 푸시 ⑤, Cloudflare ⑥", () => {
    const transfer = both.find((s) => s.title.includes("국외 이전"))!.body;
    const heads = transfer
      .split("\n")
      .filter((l) => /^[①-⑧] /.test(l))
      .map((l) => l.slice(0, 1));
    expect(heads).toEqual(["①", "②", "③", "④", "⑤", "⑥"]);
    expect(transfer).toContain("⑥ Cloudflare, Inc. (미국)");
    // AI 상담 국외 이전은 늘 ①(4절이 "6절 ①"로 가리킨다)
    expect(transfer).toContain("① Anthropic, PBC (미국)");
    expect(both.find((s) => s.title.includes("동의와 처리 근거"))!.body).toContain("(6절 ①)");
  });

  it("권리(열람·정정·삭제·처리 정지·동의 철회), 14세 미만, 쿠키·브라우저 저장소, 문의처, 구제 기관", () => {
    expect(section("권리")).toMatch(/열람·정정·삭제하거나 처리 정지/);
    expect(section("권리")).toContain("동의를 철회");
    expect(section("만 14세")).toContain("만 14세 미만");
    expect(section("쿠키")).toContain("localStorage");
    expect(section("보호책임자")).toBe("개인정보 관련 문의: inmani1555@gmail.com");
    for (const n of ["1833-6972", "118", "1301", "182"]) expect(section("구제")).toContain(n);
  });

  it("웹에서 사실이 아닌 iOS 문구가 없다 — 기기에만 저장·회원 DB 없음·Apple·iCloud·'연결 전'", () => {
    for (const bad of ["기기에만 저장", "회원 데이터베이스를 운영하지 않습니다", "Apple", "iCloud", "연결되어 있지 않아", "어떤 경우에도 전송되지 않습니다"]) {
      expect(WEB_TEXT, bad).not.toContain(bad);
    }
  });

  it("의료 관련 고지는 iOS 원문 그대로", () => {
    const ios6 = PRIVACY_POLICY_SECTIONS.find((s) => s.title.includes("의료 관련 고지"))!.body;
    expect(section("의료 관련 고지")).toBe(ios6);
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

describe("문구의 숫자 = 서버 동작", () => {
  it.skipIf(!existsSync(LLM_USAGE_SQL))("AI 상담 이용 시각 보유 기간(일) = llm_usage를 지우는 기준", () => {
    const sql = readFileSync(LLM_USAGE_SQL, "utf8");
    expect(sql).toMatch(new RegExp(`delete from public\\.llm_usage where created_at < now\\(\\) - interval '${AI_USAGE_RETENTION_DAYS} days'`));
  });
});

// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 대조하고, CI에서는 건너뛴다.
const POLICY_SWIFT = fileURLToPath(new URL("../../../web/reference/swift/PrivacyPolicyView.swift", import.meta.url));

describe("원문 대조", () => {
  it.skipIf(!existsSync(POLICY_SWIFT))("웹 초안이 iOS에서 그대로 가져온 줄(문의처·의료 고지)", () => {
    const src = readFileSync(POLICY_SWIFT, "utf8");
    expect(src).toContain(section("보호책임자"));
    expect(src).toContain(section("의료 관련 고지"));
  });
});
