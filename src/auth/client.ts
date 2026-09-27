// Supabase 클라이언트 — 설정(주소 + 공개 키)이 있을 때만, 처음 필요할 때 한 번 만든다.
// 설정이 없으면 만들지 않고, supabase-js 번들도 받지 않고, 네트워크 요청도 없다(카카오 버튼은 "준비 중").
//
// 정적 호스팅이라 서버 코드가 없다: 카카오 OAuth는 Supabase Auth가 대신 하고(REST 키·client secret은 Supabase 대시보드에만),
// 브라우저는 PKCE로 받은 code를 세션으로 바꾼다. code_verifier는 로그인을 시작한 이 브라우저에만 있어서
// 남이 만든 code를 이 브라우저에 밀어 넣는 로그인 CSRF도 교환 단계에서 실패한다.
//
// 세션 저장 키는 "onmom.web.auth" — 계정 삭제(store eraseAll)가 "onmom.web." 키를 모두 지울 때 로그인 세션도 같이 지워진다.

import type { SupabaseClient, SupabaseClientOptions } from "@supabase/supabase-js";
import { config, isSupabaseConfigured } from "@/config";
import { ROUTES } from "@/routes";

/** Supabase 세션을 두는 localStorage 키(접두 "onmom.web." — 계정 삭제가 지운다) */
export const AUTH_STORAGE_KEY = "onmom.web.auth";

export interface SupabaseSettings {
  url: string | null;
  anonKey: string | null;
}

export type CreateClientFn = (url: string, key: string, options: SupabaseClientOptions<"public">) => SupabaseClient;

/** 클라이언트 옵션 — PKCE, 우리 저장 키, URL 자동 감지 끔(콜백 화면이 code를 직접 교환한다). */
export const SUPABASE_CLIENT_OPTIONS: SupabaseClientOptions<"public"> = {
  auth: {
    flowType: "pkce",
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // 켜 두면 클라이언트를 만든 어느 화면에서든 ?code=를 보고 교환을 시도한다. 콜백 화면 한 곳에서만 하게 끈다.
    detectSessionInUrl: false,
  },
};

/** 설정이 둘 다 있을 때만 만든다 — 없으면 createClient를 부르지 않는다(테스트가 확인). */
export function createSupabaseClientIfConfigured(settings: SupabaseSettings, create: CreateClientFn): SupabaseClient | null {
  if (settings.url === null || settings.anonKey === null) return null;
  return create(settings.url, settings.anonKey, SUPABASE_CLIENT_OPTIONS);
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * 브라우저의 Supabase 클라이언트(하나만). 설정이 없거나 서버 렌더링 중이면 null.
 * supabase-js는 여기서 처음 불러온다(동적 import) — 게스트·설정 없음이면 받지 않는다.
 */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return Promise.resolve(null);
  clientPromise ??= import("@supabase/supabase-js").then(
    ({ createClient }) =>
      createSupabaseClientIfConfigured({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey }, (url, key, options) =>
        createClient(url, key, options),
      ),
    () => {
      clientPromise = null; // 번들을 못 받았다(오프라인 등) — 다음에 다시 시도
      return null;
    },
  );
  return clientPromise;
}

/** 이 브라우저에 저장된 Supabase 세션이 있는가(읽기만, 네트워크 없음) — 없으면 새로고침 때 클라이언트를 만들지 않는다. */
export function hasStoredAuthSession(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** 카카오 → Supabase → 이 주소로 돌아온다(basePath 포함, 끝 슬래시). Supabase의 Redirect URLs에 같은 값을 등록한다. */
export function authCallbackUrl(origin: string, basePath: string = config.basePath): string {
  return `${origin.replace(/\/+$/, "")}${basePath}${ROUTES.authCallback}`;
}
