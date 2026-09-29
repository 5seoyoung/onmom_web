"use client";

// 카카오 로그인에서 돌아오는 화면(/auth/callback/) — 세션을 만들고, 서버 기록을 합친 뒤 첫 화면으로 보낸다.
// - 처음 로그인(서버에 기록 없음·온보딩 전) → /onboarding/, 이미 온보딩을 마친 사람 → /home/(앱 관문과 같은 규칙 rootScreenFor),
//   지금 판의 동의가 없으면 → /onboarding/?consent=1.
// - 게스트의 카카오 계정 연결(설정)이 끝났으면 → /settings/(홈으로 보낼 사람일 때만 — 동의·온보딩이 먼저면 그쪽으로).
// - 연결하려던 카카오 계정이 이미 다른 온맘 계정이면 세션이 그 계정으로 로그인하러 카카오로 다시 보낸다 — 이 화면은 그대로 기다린다.
// - 취소·실패 → 정직한 안내 + [다시 시도](로그인 화면, 게스트로 쓰는 중이면 설정). 문구는 iOS KakaoLoginService.swift 그대로,
//   설정 없는 빌드에서 이 주소를 열었으면 "준비 중", 브라우저가 확실히 오프라인이면 실패·기록 못 읽음은 오프라인 안내
//   (callbackText.ts callbackErrorMessage·callbackSyncFailedBody — 연결되면 문구가 원문으로 돌아온다).
// - 로그인은 됐지만 서버 기록을 못 읽었고 이 브라우저에도 온보딩 기록이 없으면 → 온보딩을 다시 묻지 않고 [다시 시도].
//   (못 읽은 채로 온보딩을 보여 주면 이미 가입한 사람에게 처음부터 다시 묻게 된다. 동기화는 뒤에서 계속 시도한다.)
// 공개 주소라 앱 관문이 막거나 옮기지 않는다(features/flow/gate.ts).
// 결과 안내는 role="alert"로 읽힌다(초점은 옮기지 않는다 — 막 열린 페이지라 [다시 시도]가 첫 Tab 자리다).

import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { authSession } from "@/auth/session";
import { primaryButtonClass, PrimaryButton } from "@/components/ui";
import { rootScreenFor, type AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { StoreContext } from "@/store/StoreProvider";
import { useOnline } from "@/features/home/useOnline";
import { BrandLogo } from "./BrandLogo";
import { callbackDestination, callbackRetryHref } from "./callbackRoute";
import { AUTH_CALLBACK_TEXT, callbackErrorMessage, callbackSyncFailedBody, type CallbackErrorReason } from "./callbackText";

export { AUTH_CALLBACK_TEXT } from "./callbackText";

type View =
  | { kind: "working" }
  /** reason → 문구는 그릴 때 정한다(오프라인 여부). retryHref = [다시 시도]가 가는 곳(callbackRetryHref) */
  | { kind: "error"; reason: CallbackErrorReason; retryHref: string }
  /** 로그인은 됐고, 서버 기록 첫 읽기가 실패했다 */
  | { kind: "syncFailed" };

function useStore(): AppStore {
  return useContext(StoreContext) ?? getBrowserStore();
}

export function AuthCallbackScreen() {
  const store = useStore();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "working" });
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  /** 게스트의 카카오 연결이었는가 — [다시 시도] 뒤에도 같은 곳으로 */
  const linkedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let sync: string;
      if (attempt === 0) {
        const outcome = await authSession.completeCallback(store, window.location.href);
        if (cancelled) return;
        if (outcome.kind === "redirecting") return; // 카카오로 다시 이동하는 중 — "로그인하고 있어요" 그대로
        if (outcome.kind === "error") {
          setView({ kind: "error", reason: outcome.reason, retryHref: callbackRetryHref(store.getSnapshot().account) });
          return;
        }
        sync = outcome.sync;
        linkedRef.current = outcome.linked;
      } else {
        sync = await authSession.retryFirstFetch(store);
        if (cancelled) return;
      }
      const snap = store.getSnapshot();
      if (sync !== "ok" && sync !== "outdated" && !snap.state.hasOnboarded) {
        setView({ kind: "syncFailed" });
        return;
      }
      router.replace(callbackDestination(rootScreenFor(snap), linkedRef.current));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [store, router, attempt]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
      <BrandLogo size="login" />
      {view.kind === "working" ? (
        <div role="status" className="flex flex-col items-center gap-4">
          <LoaderCircle aria-hidden className="size-7 animate-spin text-primary motion-reduce:animate-none" />
          <h1 className="text-lg font-semibold text-text-primary">{AUTH_CALLBACK_TEXT.working}</h1>
        </div>
      ) : view.kind === "error" ? (
        <div role="alert" className="flex w-full max-w-[20rem] flex-col items-center gap-6">
          <h1 className="text-lg font-semibold text-text-primary">{callbackErrorMessage(view.reason, online)}</h1>
          <Link href={view.retryHref} replace className={primaryButtonClass}>
            {AUTH_CALLBACK_TEXT.retry}
          </Link>
        </div>
      ) : (
        <div role="alert" className="flex w-full max-w-[20rem] flex-col items-center gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{AUTH_CALLBACK_TEXT.syncFailed}</h1>
            <p className="text-[0.9375rem] text-text-secondary">{callbackSyncFailedBody(online)}</p>
          </div>
          <PrimaryButton
            onClick={() => {
              setView({ kind: "working" });
              setAttempt((n) => n + 1);
            }}
          >
            {AUTH_CALLBACK_TEXT.retry}
          </PrimaryButton>
        </div>
      )}
    </main>
  );
}
