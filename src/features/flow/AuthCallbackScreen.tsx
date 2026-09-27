"use client";

// 카카오 로그인에서 돌아오는 화면(/auth/callback/) — 세션을 만들고, 서버 기록을 합친 뒤 첫 화면으로 보낸다.
// - 처음 로그인(서버에 기록 없음·온보딩 전) → /onboarding/, 이미 온보딩을 마친 사람 → /home/(앱 관문과 같은 규칙 rootScreenFor).
// - 취소·실패 → 정직한 안내 + [다시 시도](로그인 화면). 문구는 iOS KakaoLoginService.swift 그대로.
// - 로그인은 됐지만 서버 기록을 못 읽었고 이 브라우저에도 온보딩 기록이 없으면 → 온보딩을 다시 묻지 않고 [다시 시도].
//   (못 읽은 채로 온보딩을 보여 주면 이미 가입한 사람에게 처음부터 다시 묻게 된다. 동기화는 뒤에서 계속 시도한다.)
// 공개 주소라 앱 관문이 막거나 옮기지 않는다(features/flow/gate.ts).
// 결과 안내는 role="alert"로 읽힌다(초점은 옮기지 않는다 — 막 열린 페이지라 [다시 시도]가 첫 Tab 자리다).

import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { authSession } from "@/auth/session";
import { primaryButtonClass, PrimaryButton } from "@/components/ui";
import { ROUTES } from "@/routes";
import { rootScreenFor, type AppStore } from "@/store/appStore";
import { getBrowserStore } from "@/store/browserStore";
import { StoreContext } from "@/store/StoreProvider";
import { BrandLogo } from "./BrandLogo";
import { SCREEN_PATH } from "./gate";

export const AUTH_CALLBACK_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (카카오에서 돌아와 세션을 만드는 동안)
  working: "로그인하고 있어요",
  cancelled: "로그인이 취소되었어요.", // 원문: KakaoLoginService.swift:27
  failed: "카카오 응답을 처리하지 못했어요. 잠시 후 다시 시도해주세요.", // 원문: KakaoLoginService.swift:28
  // 웹 신규 문구 — CPO 확인 필요 (로그인은 됐지만 서버의 기록을 읽지 못함)
  syncFailed: "기록을 불러오지 못했어요",
  // 웹 신규 문구 — CPO 확인 필요 (위 문구의 안내 줄 — KakaoLoginService.swift의 "잠시 후 다시 시도해주세요."와 같은 말)
  syncFailedBody: "잠시 후 다시 시도해주세요.",
  retry: "다시 시도", // 원문: ExerciseView.swift:184
} as const;

type View =
  | { kind: "working" }
  | { kind: "error"; message: string }
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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let sync: string;
      if (attempt === 0) {
        const outcome = await authSession.completeCallback(store, window.location.href);
        if (cancelled) return;
        if (outcome.kind === "error") {
          setView({ kind: "error", message: outcome.reason === "cancelled" ? AUTH_CALLBACK_TEXT.cancelled : AUTH_CALLBACK_TEXT.failed });
          return;
        }
        sync = outcome.sync;
      } else {
        sync = await authSession.retryFirstFetch(store);
        if (cancelled) return;
      }
      const snap = store.getSnapshot();
      if (sync !== "ok" && sync !== "outdated" && !snap.state.hasOnboarded) {
        setView({ kind: "syncFailed" });
        return;
      }
      const screen = rootScreenFor(snap);
      router.replace(screen === "loading" ? ROUTES.login : SCREEN_PATH[screen]);
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
          <h1 className="text-lg font-semibold text-text-primary">{view.message}</h1>
          <Link href={ROUTES.login} replace className={primaryButtonClass}>
            {AUTH_CALLBACK_TEXT.retry}
          </Link>
        </div>
      ) : (
        <div role="alert" className="flex w-full max-w-[20rem] flex-col items-center gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{AUTH_CALLBACK_TEXT.syncFailed}</h1>
            <p className="text-[0.9375rem] text-text-secondary">{AUTH_CALLBACK_TEXT.syncFailedBody}</p>
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
