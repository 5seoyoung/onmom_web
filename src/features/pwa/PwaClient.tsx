"use client";

// PWA 클라이언트 연결 — 루트 레이아웃이 한 번 그린다(화면 없음).
//   1) 운영 빌드에서만 서비스 워커(public/sw.js)를 등록한다 — 정적 파일 캐시·푸시 수신. 개발 서버에서는 등록하지 않는다.
//   2) 계정이 바뀌면 이 브라우저의 푸시 구독을 계정에 맞춘다(reminderModel.accountTransition):
//      - 없어지면(로그아웃·계정 삭제) 구독을 푼다 — 다음 사람에게 "오늘의 회복 체크"가 울리지 않게(AppStore.swift:116 eraseAll이 예약 알림을
//        지우는 것과 같은 뜻). 계정 삭제면 서버 행은 cascade로 이미 없고, 로그아웃이면 세션이 없어 여기서는 못 지우지만 풀린 끝점은 다음 발송 때
//        푸시 서비스가 404/410으로 답해 서버가 지운다(supabase/functions/send-reminders). 로그아웃 흐름이 세션이 살아 있을 때
//        reminderActions.disableReminderNow()를 부르면 그 자리에서 지운다(docs/PWA_AND_REMINDERS.md §8).
//      - 다른 계정으로 바로 바뀌면(게스트 → 이미 있던 카카오 계정 전환은 익명 사용자와 그 서버 행을 먼저 지운다) 끝점을 새 계정의 행으로
//        다시 저장한다. 저장하지 못하면(행이 아직 다른 사용자의 것 — RLS) 구독을 푼다 → 설정 화면은 "꺼짐"(서버가 보낼 곳이 없는 "켜짐"은 없다).
//   3) 앱을 열 때 한 번(계정이 있을 때) — 이 브라우저에서 켜 둔 알림의 구독을 브라우저가 갈아 끼웠거나(pushsubscriptionchange) 잃었으면
//      서버 행을 맞춘다(reminderActions.reconcileReminderOnce). 켜 둔 표시가 없으면 아무 요청도 하지 않는다. Supabase + VAPID 설정이 없는
//      빌드에서는 부르지도 않는다.
//   모두 순서대로 하나씩 처리한다(계정이 빠르게 여러 번 바뀌어도). 화면을 막지 않는다.

import { useEffect, useRef } from "react";
import { config, isReminderConfigured } from "@/config";
import { useAppStore } from "@/store/useAppStore";
import { rebindReminderNow, reconcileReminderOnce, releaseReminderNow } from "./reminderActions";
import { accountTransition, shouldAutoRegisterServiceWorker } from "./reminderModel";
import { pushSupported, registerServiceWorker } from "./serviceWorker";

export function PwaClient() {
  const { hydrated, account } = useAppStore();
  const accountId = account?.id ?? null;
  const previousAccountId = useRef<string | null | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (shouldAutoRegisterServiceWorker(process.env.NODE_ENV, "serviceWorker" in navigator)) void registerServiceWorker(config.basePath);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const transition = accountTransition(previousAccountId.current, accountId);
    previousAccountId.current = accountId;
    if (!pushSupported()) return;
    let run: (() => Promise<unknown>) | null = null;
    if (transition === "signedOut") run = releaseReminderNow;
    else if (accountId !== null) {
      const id = accountId;
      if (transition === "switched") run = () => rebindReminderNow(id);
      else if (isReminderConfigured()) run = () => reconcileReminderOnce(id);
    }
    if (run !== null) queue.current = queue.current.then(run).catch(() => undefined);
  }, [hydrated, accountId]);

  return null;
}
