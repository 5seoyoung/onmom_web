"use client";

// 관리자 2단계 인증 화면 — 안전성 확보조치 기준 제6조②(외부에서 접속할 때 일회용 비밀번호 등 안전한 인증수단).
// 서버(supabase/migrations/0014_admin_hardening.sql)는 인증 앱 숫자까지 확인한 세션(aal2)만 관리자로 본다. 이 화면은 그 단계를 거치게 한다.
//   enroll    — 인증 앱이 없다: 등록 QR·비밀 키를 보이고, 앱의 6자리 숫자로 확인하면 등록이 끝나고 세션이 aal2가 된다.
//   challenge — 인증 앱이 있다: 6자리 숫자만 확인한다.
// 확인되면 부모(AdminScreen)가 권한을 다시 확인해 대시보드를 연다. QR·키는 화면에만 있고 어디에도 남기지 않는다(콘솔에도 쓰지 않는다).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { PrimaryButton, secondaryButtonClass } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { BrandLogo } from "@/features/flow/BrandLogo";
import { ROUTES } from "@/routes";
import { startTotpEnroll, verifyTotp, type AdminClient, type MfaFailure } from "./adminApi";
import { ADMIN_TEXT, groupSecret, normalizeTotpCode, qrImageSrc } from "./adminModel";

export type AdminMfaMode = { kind: "enroll" } | { kind: "challenge"; factorId: string };

type Enrollment =
  | { status: "loading" }
  | { status: "ready"; factorId: string; qrSrc: string | null; secret: string }
  | { status: "failed"; failure: "disabled" | "failed" };

const FIELD_CLASS =
  "min-h-11 w-full rounded-button bg-surface px-3 text-center font-mono text-[1.25rem] tracking-[0.3em] text-text-primary ring-1 ring-divider placeholder:text-text-subtle-aa";

function failureMessage(failure: MfaFailure): string {
  return failure === "invalid" ? ADMIN_TEXT.mfaCodeInvalid : failure === "disabled" ? ADMIN_TEXT.mfaDisabled : ADMIN_TEXT.mfaFailed;
}

export function AdminMfa({ client, mode, onVerified }: { client: AdminClient; mode: AdminMfaMode; onVerified(): void }) {
  const [enrollment, setEnrollment] = useState<Enrollment>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (mode.kind !== "enroll") return;
    let cancelled = false;
    void startTotpEnroll(client).then((r) => {
      if (cancelled) return;
      setEnrollment(
        r.ok ? { status: "ready", factorId: r.factorId, qrSrc: qrImageSrc(r.qrCode), secret: r.secret } : { status: "failed", failure: r.failure },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [client, mode.kind, attempt]);

  const factorId = mode.kind === "challenge" ? mode.factorId : enrollment.status === "ready" ? enrollment.factorId : null;
  const ready = factorId !== null;

  // 숫자 칸이 생기면 바로 입력할 수 있게(등록은 QR이 준비된 뒤)
  useEffect(() => {
    if (ready) inputRef.current?.focus();
  }, [ready]);

  const retryEnroll = useCallback(() => {
    setEnrollment({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || factorId === null) return;
    const normalized = normalizeTotpCode(code);
    if (normalized === null) {
      setError(ADMIN_TEXT.mfaCodeFormat);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const r = await verifyTotp(client, factorId, normalized);
    setBusy(false);
    if (r.ok) {
      onVerified();
      return;
    }
    setError(failureMessage(r.failure));
    if (r.failure === "invalid") setCode("");
    // 확인하는 동안 칸이 잠겨 포커스가 body로 떨어진다 — 칸으로 되돌린다(오류 문장을 aria-describedby로 읽는다)
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const title = mode.kind === "enroll" ? ADMIN_TEXT.mfaEnrollTitle : ADMIN_TEXT.mfaChallengeTitle;
  const body = mode.kind === "enroll" ? ADMIN_TEXT.mfaEnrollBody : ADMIN_TEXT.mfaChallengeBody;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
      <BrandLogo size="login" />
      <section aria-labelledby={titleId} className="flex w-full max-w-[22rem] flex-col items-center gap-5">
        <div className="flex flex-col gap-2">
          <h1 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h1>
          <p className="text-[0.9375rem] text-text-secondary">{body}</p>
        </div>

        {mode.kind === "enroll" ? (
          enrollment.status === "loading" ? (
            <div role="status" className="flex items-center gap-3 py-6 text-[0.9375rem] text-text-secondary">
              <LoaderCircle aria-hidden className="size-5 animate-spin text-primary motion-reduce:animate-none" />
              {ADMIN_TEXT.mfaPreparing}
            </div>
          ) : enrollment.status === "failed" ? (
            <div role="alert" className="flex w-full flex-col items-center gap-3">
              <p className="text-[0.9375rem] font-semibold text-state-alert-text">
                {enrollment.failure === "disabled" ? ADMIN_TEXT.mfaDisabled : ADMIN_TEXT.mfaEnrollFailed}
              </p>
              <PrimaryButton onClick={retryEnroll}>{ADMIN_TEXT.retry}</PrimaryButton>
            </div>
          ) : (
            <ol className="flex w-full list-none flex-col gap-4 text-left">
              <li className="flex flex-col items-center gap-3">
                <p className="w-full text-[0.9375rem] text-text-primary">1. {ADMIN_TEXT.mfaEnrollStep1}</p>
                {enrollment.qrSrc !== null ? (
                  // 서버가 준 SVG(data URL) — next/image는 정적 내보내기라 하는 일이 없다. 흰 바탕 위에 둬야 어두운 모드에서도 찍힌다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={enrollment.qrSrc} alt={ADMIN_TEXT.mfaQrAlt} width={176} height={176} className="size-44 rounded-chip bg-white p-2" />
                ) : null}
                <div className="w-full rounded-chip bg-surface px-4 py-3 ring-1 ring-divider">
                  <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.mfaSecretLabel}</p>
                  <p className="mt-0.5 select-all break-all font-mono text-[0.9375rem] text-text-primary">
                    {groupSecret(enrollment.secret)}
                  </p>
                </div>
              </li>
              <li>
                <p className="text-[0.9375rem] text-text-primary">2. {ADMIN_TEXT.mfaEnrollStep2}</p>
              </li>
            </ol>
          )
        ) : null}

        {ready ? (
          <form onSubmit={(e) => void submit(e)} className="flex w-full flex-col gap-3" aria-busy={busy} noValidate>
            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor={inputId} className="text-[0.9375rem] font-semibold text-text-secondary">
                {ADMIN_TEXT.mfaCodeLabel}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                aria-invalid={error !== null || undefined}
                aria-describedby={error !== null ? errorId : undefined}
                className={cx(FIELD_CLASS, busy && "opacity-60")}
              />
            </div>
            <div id={errorId} role="alert" className="empty:hidden text-left text-[0.8125rem] font-semibold text-state-alert-text">
              {error}
            </div>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? ADMIN_TEXT.mfaVerifying : ADMIN_TEXT.mfaVerify}
            </PrimaryButton>
          </form>
        ) : null}

        {mode.kind === "challenge" ? <p className="text-[0.8125rem] text-text-secondary">{ADMIN_TEXT.mfaLostHint}</p> : null}

        <Link href={ROUTES.home} className={secondaryButtonClass}>
          {ADMIN_TEXT.home}
        </Link>
      </section>
    </main>
  );
}
