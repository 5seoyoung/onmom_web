// 저장 상태의 기본값 — iOS 각 구조체의 프로퍼티 기본값(Models.swift:68-82, AppStore.swift:10-34·204-214)과 같다.
// 디코딩(없는 키)·eraseAll·첫 실행이 모두 이 값을 쓴다.

import type { MaternityRecord, PersistedState, UserProfile } from "@/domain/types";

export function defaultProfile(): UserProfile {
  return {
    // iOS는 출산일을 "오늘"로 두고 온보딩 전까지 숨겼다. 웹은 받지 않은 값을 지어내지 않는다(원칙 3).
    deliveryDate: null,
    deliveryMethod: null,
    goal: null,
    returnToWorkDate: null,
    isBreastfeeding: true,
    consentAccepted: false,
    heightCm: 0,
    currentWeightKg: 0,
    prePregnancyWeightKg: 0,
    neighborhood: "",
  };
}

export function defaultMaternity(): MaternityRecord {
  return {
    // 초산만 기본 켜짐(AppStore.swift:207) — 확인 전에 입력한 적 없는 "다분만부" 칩이 뜨지 않게(감사 #9).
    isPrimiparous: true,
    gdm: false,
    anemia: false,
    heavyBleeding: false,
    preeclampsia: false,
    pelvicPain: false,
    diastasisRecti: false,
  };
}

export function initialState(): PersistedState {
  return {
    hasOnboarded: false,
    profile: defaultProfile(),
    symptomHistory: [],
    communityPosts: [],
    maternity: defaultMaternity(),
    ownerAccountID: null,
    moodChecks: [],
    moodCardSnoozedUntil: null,
  };
}
