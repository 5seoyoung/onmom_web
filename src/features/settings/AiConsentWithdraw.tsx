"use client";

// 설정 > 내 데이터의 AI 답변 동의 철회 행 — 웹 신규(법 §37①, 처리방침 4·13절). 이 계정의 동의가 남아 있을 때만 보인다(이 브라우저 기록 또는 서버 행).
// 누르면 서버 행을 먼저 지우고 이 브라우저의 기록을 지운다(features/chat/aiConsent.ts useAiConsentStatus). 그 뒤에는 다시 동의하기 전까지 AI를 부르지 않고,
// 다른 탭·기기가 물어도 함수가 403 ai_consent_required로 막는다. 서버에서 지우지 못하면 아무것도 지우지 않고 문장으로 알린다 — 행이 남아 다시 시도할 수 있다.
// 다시 동의할 수 있으므로 확인 창을 거치지 않는다.

import { useState } from "react";
import { useAiConsentStatus } from "@/features/chat/aiConsent";
import { DATA_RIGHTS_TEXT } from "./settingsView";

export type AiWithdrawState = "idle" | "busy" | "done" | "failed";

export function AiConsentWithdraw({ accountId }: { accountId: string | null }) {
  const { present, withdraw } = useAiConsentStatus(accountId);
  const [state, setState] = useState<AiWithdrawState>("idle");

  async function onWithdraw() {
    setState("busy");
    setState((await withdraw()) ? "done" : "failed");
  }

  return <AiConsentWithdrawView present={present} state={state} onWithdraw={() => void onWithdraw()} />;
}

/** 그리기만 — 테스트가 상태별로 따로 그려 본다. 동의가 없고 방금 철회한 것도 아니면 아무것도 그리지 않는다. */
export function AiConsentWithdrawView({ present, state, onWithdraw }: { present: boolean; state: AiWithdrawState; onWithdraw: () => void }) {
  if (!present && state !== "done") return null;
  return (
    <>
      <hr className="border-divider" />
      {present ? (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={state === "busy"}
          aria-busy={state === "busy" || undefined}
          className="flex min-h-11 w-full flex-col items-start gap-0.5 py-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[0.9375rem] font-semibold text-state-alert-text">{DATA_RIGHTS_TEXT.aiWithdraw}</span>
          <span className="text-[0.8125rem] text-text-secondary">{DATA_RIGHTS_TEXT.aiWithdrawHint}</span>
        </button>
      ) : null}
      {/* 진행 상태·끝남은 polite로, 실패는 alert로 읽힌다 */}
      <p aria-live="polite" className="text-[0.8125rem] text-text-secondary empty:hidden">
        {state === "busy" ? DATA_RIGHTS_TEXT.aiWithdrawing : state === "done" ? DATA_RIGHTS_TEXT.aiWithdrawDone : null}
      </p>
      <div role="alert" className="empty:hidden">
        {state === "failed" ? <p className="text-[0.8125rem] font-semibold text-state-alert-text">{DATA_RIGHTS_TEXT.aiWithdrawFailed}</p> : null}
      </div>
    </>
  );
}
