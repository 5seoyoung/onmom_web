// 이 빌드에서 보일 개인정보처리방침 — 화면(/privacy/)과 로그인·온보딩의 시트가 같이 쓴다.
//
// - Supabase 설정이 없는 빌드(브라우저 전용): iOS 방침 원문(policyText.ts) + "iOS 기준이에요" 안내. 기록은 브라우저에만 남으므로
//   iOS 방침의 "기기에만 저장"이 웹에서도 대체로 맞다(차이는 안내 줄이 알린다).
// - Supabase 설정이 있는 빌드: 웹 방침(webPolicyText.ts) — 서버 저장·카카오 로그인·AI 상담을 적은 것. 2026-11-06부터 시행 중이고
//   "시범 운영 중" 표시를 먼저 보인다(그 전 2026-10-24부터는 "초안 - 법률 검토 전" 표시의 초안).
//   iOS 방침은 서버 저장을 부정하므로("별도의 회원 데이터베이스를 운영하지 않습니다") 이 빌드에서는 보이지 않는다.

import { config, isReminderConfigured, isSupabaseConfigured } from "@/config";
import { YOUTUBE_ACTIVE } from "@/features/youtube/catalog";
import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_WEB_NOTE,
  type PolicySection,
} from "./policyText";
import { EDITION_2026_10_24, EDITION_2026_11_06, type FrozenPolicyEdition } from "./editions";
import {
  DEFAULT_WEB_POLICY_OPTIONS,
  WEB_POLICY_CHANGES,
  WEB_POLICY_DRAFT_LABEL,
  WEB_POLICY_EFFECTIVE,
  WEB_POLICY_EFFECTIVE_DATE,
  WEB_POLICY_NOTE,
  webPolicySections,
  type WebPolicyOptions,
} from "./webPolicyText";

export interface PolicyDocument {
  /** "ios" = iOS 원문, "webDraft" = 웹 방침(서버 저장 빌드 — 이름은 초안 때 그대로, 2026-11-06부터 시행 중) */
  kind: "ios" | "webDraft";
  title: string;
  /** 제목 아래 한 줄(시행일) */
  effective: string;
  /** 상태 표시(웹 방침만 — 지금은 "시범 운영 중") — 본문 위 안내 상자의 굵은 첫 줄 */
  draftLabel: string | null;
  /** 본문 위 안내 */
  note: string;
  sections: readonly PolicySection[];
  /**
   * 시행을 앞둔 새 판(웹 방침만) — 18절대로 시행 7일 전부터 이 화면에 미리 알린다. 바뀌는 내용 요약과 새 판 전문.
   * 새 판이 시행되면(서울 날짜가 시행일 이상) null이고 그 판이 본문이 된다.
   */
  upcoming: { effective: string; changes: readonly string[]; sections: readonly PolicySection[] } | null;
  /** 지난 판(웹 방침만, 최근 판부터) — 적용 기간과 전문(editions.ts 고정본). iOS 원문은 빈 목록. */
  previous: readonly FrozenPolicyEdition[];
}

export interface PolicyBuild {
  /** 서버 저장(Supabase)이 켜진 빌드인가 */
  serverStorage: boolean;
  webOptions?: WebPolicyOptions;
  /** 지금 시각 — 새 판의 시행일과 견준다(기본: 지금. 정적 화면은 빌드 시각 — 매일 다시 배포한다) */
  now?: Date;
}

/** 한국 날짜 "YYYY-MM-DD" — 시행일은 한국 날짜로 정한다(빌드 서버는 UTC) */
export function seoulDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function policyFor({ serverStorage, webOptions = DEFAULT_WEB_POLICY_OPTIONS, now = new Date() }: PolicyBuild): PolicyDocument {
  if (!serverStorage) {
    return {
      kind: "ios",
      title: PRIVACY_POLICY_TITLE,
      effective: PRIVACY_POLICY_EFFECTIVE,
      draftLabel: null,
      note: PRIVACY_POLICY_WEB_NOTE,
      sections: PRIVACY_POLICY_SECTIONS,
      upcoming: null,
      previous: [],
    };
  }
  const live = webPolicySections(webOptions);
  // 고정본은 그때 운영 빌드(선택 기능 — Turnstile·매일 알림·유튜브 — 모두 꺼짐)의 글자다. 선택 기능을 켠 빌드에서 옛 고정본을 보이면 켠 업체가
  // 방침에서 빠진다 — 그런 빌드는 새 판을 본문으로 보인다(선택 기능을 켜는 것 자체가 방침 변경이라 따로 공지한다 — 18절).
  const optionsOff = !webOptions.turnstile && !webOptions.reminders && webOptions.youtube !== true;
  if (optionsOff && seoulDate(now) < WEB_POLICY_EFFECTIVE_DATE) {
    // 새 판 시행 전 — 직전 판(고정본)이 본문, 새 판은 개정 안내로 미리 보인다
    const current = EDITION_2026_11_06;
    return {
      kind: "webDraft",
      title: PRIVACY_POLICY_TITLE,
      effective: current.effective,
      draftLabel: current.draftLabel,
      note: current.note,
      sections: current.sections,
      upcoming: { effective: WEB_POLICY_EFFECTIVE, changes: WEB_POLICY_CHANGES, sections: live },
      previous: [EDITION_2026_10_24],
    };
  }
  return {
    kind: "webDraft",
    title: PRIVACY_POLICY_TITLE, // 제목은 같다(원문: PrivacyPolicyView.swift:21)
    effective: WEB_POLICY_EFFECTIVE,
    draftLabel: WEB_POLICY_DRAFT_LABEL,
    note: WEB_POLICY_NOTE,
    sections: live,
    upcoming: null,
    previous: [EDITION_2026_11_06, EDITION_2026_10_24],
  };
}

/**
 * 이 빌드의 방침 옵션 — Turnstile 사이트 키(NEXT_PUBLIC_TURNSTILE_SITE_KEY)가 있으면 Cloudflare를 적고(src/auth/turnstile.ts),
 * 매일 리마인더를 켤 수 있으면(Supabase + NEXT_PUBLIC_VAPID_PUBLIC_KEY — config.isReminderConfigured) 알림 정보·푸시 서비스를 적고,
 * 유튜브 추천 영상이 실린 빌드면(features/youtube/catalog.ts YOUTUBE_ACTIVE) 미리보기 이미지를 주는 Google을 적는다.
 */
export function activeWebPolicyOptions(): WebPolicyOptions {
  return { turnstile: config.turnstileSiteKey !== null, reminders: isReminderConfigured(), youtube: YOUTUBE_ACTIVE };
}

/**
 * 이 빌드의 방침 — 빌드 때 정해지는 값(NEXT_PUBLIC_*)과 지금 날짜로 고른다. /privacy/ 본문은 서버 컴포넌트라 빌드 날짜(매일 다시 배포),
 * 시트(PrivacyPolicyDialog)는 연 시각이다 — 새 판 시행일 아침 배포 전 몇 시간은 둘이 다를 수 있다(둘 다 새 판 전문을 보인다).
 */
export function activePolicy(now: Date = new Date()): PolicyDocument {
  return policyFor({ serverStorage: isSupabaseConfigured(), webOptions: activeWebPolicyOptions(), now });
}
