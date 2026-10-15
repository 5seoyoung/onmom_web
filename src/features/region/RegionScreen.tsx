"use client";

// 지역 연계 — 내 동네(주소) 기준 가까운 산부인과(RegionResourcesView.swift).
// 동네 값은 프로필(profile.neighborhood)과 묶인다 — 기록 탭의 "내 동네"와 같은 값이다.
// 저장소를 읽기 전(hydrated=false)에는 머리만 그린다 — 빈 동네가 번쩍이거나 빈 값으로 검색하지 않게.
// PC(lg 이상)에서는 본문 폭 전체를 쓰는 자리라 layout="wide" — 입력은 읽기 폭(45rem), 병원 목록은 두 열(NearbyClinics).
// PC 틀은 pageFrame(격자 화면), 사이드바에 있는 화면이라 PC에서는 [뒤로]를 숨긴다.
// 동네 입력은 글자마다 저장하지 않는다(store/useDraftField) — 입력이 멈추면 한 번, 칸을 떠나거나 검색하거나 화면을 떠나면 바로 저장한다
// (글자마다 상태 전체를 localStorage에 쓰고 서버 동기화를 예약하지 않게). 보이는 것은 그대로다.

import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { SubPageHeader, cx } from "@/components/ui";
import { NearbyClinics } from "@/features/clinics/NearbyClinics";
import { useAppStore } from "@/store/useAppStore";
import { useDraftField } from "@/store/useDraftField";
import { REGION_TEXT } from "./regionText";

export function RegionScreen() {
  const { hydrated, state, actions } = useAppStore();
  const neighborhood = useDraftField(state.profile.neighborhood, (value) => actions.updateProfile({ neighborhood: value }));
  return (
    // 칸을 떠남(blur)·검색(submit)은 안쪽 입력에서 올라온다 — 기다리던 입력을 바로 저장한다
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-6", PAGE_FRAME.wide)} onBlur={neighborhood.flush} onSubmit={neighborhood.flush}>
      <SubPageHeader title={REGION_TEXT.title} backHref={REGION_TEXT.backHref} hideBackWithSidebar />
      {hydrated ? (
        <NearbyClinics
          layout="wide"
          address={neighborhood.value}
          onAddressChange={neighborhood.change}
        />
      ) : null}
    </main>
  );
}
