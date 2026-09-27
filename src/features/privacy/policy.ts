// 이 빌드에서 보일 개인정보처리방침 — 화면(/privacy/)과 로그인·온보딩의 시트가 같이 쓴다.
//
// - Supabase 설정이 없는 빌드(지금 배포): iOS 방침 원문(policyText.ts) + "iOS 기준이에요" 안내. 기록은 브라우저에만 남으므로
//   iOS 방침의 "기기에만 저장"이 웹에서도 대체로 맞다(차이는 안내 줄이 알린다).
// - Supabase 설정이 있는 빌드: 웹 방침 초안(webPolicyText.ts) — 서버 저장·카카오 로그인·AI 국외 이전을 적은 것. "초안 — 법률 검토 전" 표시.
//   iOS 방침은 서버 저장을 부정하므로("별도의 회원 데이터베이스를 운영하지 않습니다") 이 빌드에서는 보이지 않는다.

import { config, isSupabaseConfigured } from "@/config";
import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_WEB_NOTE,
  type PolicySection,
} from "./policyText";
import {
  DEFAULT_WEB_POLICY_OPTIONS,
  WEB_POLICY_DRAFT_LABEL,
  WEB_POLICY_EFFECTIVE,
  WEB_POLICY_NOTE,
  webPolicySections,
  type WebPolicyOptions,
} from "./webPolicyText";

export interface PolicyDocument {
  /** "ios" = iOS 원문, "webDraft" = 웹 초안 */
  kind: "ios" | "webDraft";
  title: string;
  /** 제목 아래 한 줄(시행일 또는 작성일·시행일 미정) */
  effective: string;
  /** 초안 표시(웹 초안만) — 본문 위 안내 상자의 굵은 첫 줄 */
  draftLabel: string | null;
  /** 본문 위 안내 */
  note: string;
  sections: readonly PolicySection[];
}

export interface PolicyBuild {
  /** 서버 저장(Supabase)이 켜진 빌드인가 */
  serverStorage: boolean;
  webOptions?: WebPolicyOptions;
}

export function policyFor({ serverStorage, webOptions = DEFAULT_WEB_POLICY_OPTIONS }: PolicyBuild): PolicyDocument {
  if (!serverStorage) {
    return {
      kind: "ios",
      title: PRIVACY_POLICY_TITLE,
      effective: PRIVACY_POLICY_EFFECTIVE,
      draftLabel: null,
      note: PRIVACY_POLICY_WEB_NOTE,
      sections: PRIVACY_POLICY_SECTIONS,
    };
  }
  return {
    kind: "webDraft",
    title: PRIVACY_POLICY_TITLE, // 제목은 같다(원문: PrivacyPolicyView.swift:21)
    effective: WEB_POLICY_EFFECTIVE,
    draftLabel: WEB_POLICY_DRAFT_LABEL,
    note: WEB_POLICY_NOTE,
    sections: webPolicySections(webOptions),
  };
}

/** 이 빌드의 방침 옵션 — Turnstile 사이트 키(NEXT_PUBLIC_TURNSTILE_SITE_KEY)가 있으면 Cloudflare를 적는다(src/auth/turnstile.ts) */
export function activeWebPolicyOptions(): WebPolicyOptions {
  return { turnstile: config.turnstileSiteKey !== null };
}

/** 이 빌드의 방침 — 빌드 때 정해지는 값(NEXT_PUBLIC_*)이라 서버 HTML과 브라우저가 같다 */
export function activePolicy(): PolicyDocument {
  return policyFor({ serverStorage: isSupabaseConfigured(), webOptions: activeWebPolicyOptions() });
}
