/* eslint-disable @typescript-eslint/ban-ts-comment -- Deno는 ".ts" 확장자가 있어야 가져온다. Next tsc(TS5097)만 그 줄을 넘기게 한다. */
// Edge Function "send-reminders"의 요청 처리 — 의존성(부른 쪽 확인·구독 읽기/지우기·발송·시각·로그)을 받아 만든다.
// 실제 연결은 index.ts(Deno), 테스트는 src/features/pwa/sendReminders.test.ts(vitest — 웹 표준 Request/Response만 쓴다).
//
// POST (x-reminder-secret: <REMINDER_CRON_SECRET> 또는 Authorization: Bearer <서버 키>) — pg_cron이 매일 11:00 UTC에 부른다(0004_push_reminders.sql).
// 순서: 1) 메서드·부른 쪽 확인 → 2) 발송 준비(VAPID 키·subject) → 3) 구독 전부 읽기 → 4) 행의 시간대에서 지금이 20시인 것만
//       → 5) 동시 20개씩 발송(받는 푸시 서비스 밖의 끝점은 요청하지 않고 rejected) → 6) 404/410(구독 사라짐)은 행 삭제 → 7) 숫자만 응답·기록.
// 로그: 상태·소요 시간·건수만. 끝점·키·사용자 id는 기록하지 않는다. 오류도 종류(코드)만.

// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { failure, jsonResponse } from "../_shared/cors.ts";
// @ts-ignore: TS5097(Next tsc) — Deno용 확장자
import { classifyPushStatus, emptySummary, forEachConcurrent, isDueNow, isKnownPushService, REMINDER_HOUR, SEND_CONCURRENCY } from "../_shared/reminders.ts";
import type { SendSummary, SubscriptionRecord } from "../_shared/reminders.ts";

export interface SendRemindersLogEntry {
  fn: "send-reminders";
  status: number;
  ms: number;
  code?: string;
  summary?: SendSummary;
}

export interface SendRemindersDeps {
  /** 부른 쪽이 pg_cron(공유 비밀) 또는 서버 키인가 */
  authorize(headers: Headers): boolean;
  /** 발송할 수 없는 까닭(VAPID 키·subject 없음 등) — 없으면 null */
  preflight(): Promise<string | null>;
  /** 모든 구독(service_role) — 실패하면 throw */
  listSubscriptions(): Promise<SubscriptionRecord[]>;
  /** 사라진 구독 행 삭제 — 실패하면 throw */
  deleteSubscriptions(ids: string[]): Promise<void>;
  /** 한 구독에 발송 → 푸시 서비스의 HTTP 상태. 암호화·네트워크 실패는 throw */
  send(subscription: SubscriptionRecord): Promise<number>;
  now(): Date;
  /** 행 시간대 기준 발송 시(기본 20) */
  hour?: number;
  concurrency?: number;
  log(entry: SendRemindersLogEntry): void;
}

/** 요청 본문의 hour(0–23 정수)가 있으면 그 값, 없거나 본문이 JSON이 아니면 기본값. */
async function requestedHour(req: Request, fallback: number): Promise<number> {
  try {
    const body: unknown = await req.json();
    const h = typeof body === "object" && body !== null ? (body as { hour?: unknown }).hour : undefined;
    return typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23 ? h : fallback;
  } catch {
    return fallback;
  }
}

export function createSendRemindersHandler(deps: SendRemindersDeps): (req: Request) => Promise<Response> {
  const hour = deps.hour ?? REMINDER_HOUR;
  const concurrency = deps.concurrency ?? SEND_CONCURRENCY;

  return async (req: Request): Promise<Response> => {
    const started = Date.now();
    const done = (status: number, body: unknown, code?: string, summary?: SendSummary) => {
      deps.log({ fn: "send-reminders", status, ms: Date.now() - started, ...(code ? { code } : {}), ...(summary ? { summary } : {}) });
      return jsonResponse(status, body);
    };
    const fail = (status: number, code: string) => {
      deps.log({ fn: "send-reminders", status, ms: Date.now() - started, code });
      return failure(status, code);
    };

    // 예상 못 한 예외(발송 준비·시각 계산 등)도 정해진 모양으로 끝낸다 — 로그에는 코드만(스택·값 없음). chat·videos와 같게.
    try {
      if (req.method !== "POST") return fail(405, "method_not_allowed");
      if (!deps.authorize(req.headers)) return fail(401, "unauthorized");

      const notReady = await deps.preflight();
      if (notReady !== null) return fail(503, notReady);

      let subscriptions: SubscriptionRecord[];
      try {
        subscriptions = await deps.listSubscriptions();
      } catch {
        return fail(503, "db_unavailable");
      }

      const now = deps.now();
      const summary = emptySummary();
      summary.total = subscriptions.length;
      // 본문 {"hour": 0–23}은 확인된 호출자(사람이 손으로 시험할 때)만 그 한 번의 발송 시를 바꾼다. pg_cron 본문({"scheduled_at"})에는 없다.
      const runHour = await requestedHour(req, hour);
      const due = subscriptions.filter((s) => isDueNow(now, s.tz, runHour));
      summary.due = due.length;

      const gone: string[] = [];
      await forEachConcurrent(due, concurrency, async (subscription) => {
        // 0004의 check 제약이 막지만 한 번 더 — 브라우저 회사의 푸시 서비스가 아닌 주소로는 요청하지 않는다
        if (!isKnownPushService(subscription.endpoint)) {
          summary.rejected += 1;
          return;
        }
        try {
          const outcome = classifyPushStatus(await deps.send(subscription));
          summary[outcome] += 1;
          if (outcome === "gone") gone.push(subscription.id);
        } catch {
          summary.errors += 1;
        }
      });

      if (gone.length > 0) {
        try {
          await deps.deleteSubscriptions(gone);
          summary.pruned = gone.length;
        } catch {
          return done(200, { ok: true, ...summary, warning: "prune_failed" }, "prune_failed", summary);
        }
      }

      return done(200, { ok: true, ...summary }, undefined, summary);
    } catch {
      return fail(500, "internal");
    }
  };
}
