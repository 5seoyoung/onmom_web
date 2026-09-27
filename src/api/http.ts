// 온맘 백엔드(영상·LLM·계정) 호출용 fetch 래퍼 — 타임아웃, x-onmom-key, 실패 분류만 한다.
//
// - x-onmom-key는 온맘 백엔드 origin으로 가는 요청에만 붙인다(카카오 등 제3자에 흘리지 않는다 — 검수 #12).
//   웹에서 이 값은 번들에 들어가는 공개값이다. 인증 수단으로 기대하지 않는다(검수 #16).
// - CORS 차단은 브라우저가 fetch를 TypeError로 끝내므로 네트워크 실패와 구분되지 않는다.
//   2026-09-23 현재 영상 서버는 CORS가 없다(preflight 405 — 검수 #12). 백엔드 수정 사항이라 여기서는 정직하게 실패로 올린다.
// - 자동 재시도는 하지 않는다(검수 #57). 다시 시도는 화면의 [다시 시도] 버튼 몫이다.

import { config as appConfig } from "@/config";

/** 호출에 쓰는 설정. 테스트는 env를 바꾸지 않고 이 값을 주입한다. */
export type BackendConfig = {
  videoURL: string | null;
  llmURL: string | null;
  accountURL: string | null;
  appKey: string | null;
};

export const defaultBackendConfig: BackendConfig = {
  videoURL: appConfig.videoURL,
  llmURL: appConfig.llmURL,
  accountURL: appConfig.accountURL,
  appKey: appConfig.appKey,
};

export const APP_KEY_HEADER = "x-onmom-key";

export type NetworkFailure = "timeout" | "aborted" | "failed" | "badBody";

export type HttpResult =
  /** 허용된 상태 코드 + JSON 본문 파싱 성공 */
  | { ok: true; status: number; data: unknown }
  /** 응답은 왔지만 허용되지 않는 상태 코드 */
  | { ok: false; kind: "status"; status: number }
  /** 응답을 못 받았거나(오프라인·CORS·타임아웃·취소) 본문을 읽지 못함 */
  | { ok: false; kind: "network"; reason: NetworkFailure };

export type JsonRequest = {
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  /** 있으면 JSON으로 직렬화해 보낸다 */
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /** 성공으로 볼 상태 코드. 기본 2xx */
  acceptStatus?: (status: number) => boolean;
  config?: BackendConfig;
};

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** 요청 URL의 origin이 설정된 온맘 백엔드 중 하나와 같은가 */
export function isOwnBackendUrl(url: string, cfg: BackendConfig = defaultBackendConfig): boolean {
  const target = originOf(url);
  if (!target) return false;
  return [cfg.videoURL, cfg.llmURL, cfg.accountURL].some((base) => originOf(base) === target);
}

/** 설정된 base URL 뒤에 경로를 붙인다(iOS appendingPathComponent). base가 비었거나 URL이 아니면 null. */
export function joinBackendUrl(base: string | null, path: string): URL | null {
  if (!base) return null;
  try {
    const u = new URL(`${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const is2xx = (s: number) => s >= 200 && s < 300;

export async function requestJson(url: string, req: JsonRequest): Promise<HttpResult> {
  const cfg = req.config ?? defaultBackendConfig;
  const headers: Record<string, string> = { ...req.headers };
  let body: string | undefined;
  if (req.body !== undefined) {
    body = JSON.stringify(req.body);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
  }
  if (cfg.appKey && isOwnBackendUrl(url, cfg)) headers[APP_KEY_HEADER] = cfg.appKey;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, req.timeoutMs);
  const forwardAbort = () => controller.abort();
  if (req.signal?.aborted) controller.abort();
  else req.signal?.addEventListener("abort", forwardAbort, { once: true });

  const failure = (fallback: NetworkFailure): HttpResult => ({
    ok: false,
    kind: "network",
    reason: timedOut ? "timeout" : req.signal?.aborted ? "aborted" : fallback,
  });

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
        credentials: "omit",
      });
    } catch {
      return failure("failed");
    }
    if (!(req.acceptStatus ?? is2xx)(res.status)) return { ok: false, kind: "status", status: res.status };
    try {
      return { ok: true, status: res.status, data: await res.json() };
    } catch {
      return failure("badBody");
    }
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", forwardAbort);
  }
}
