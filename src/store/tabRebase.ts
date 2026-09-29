// 여러 탭 보호 — 이 탭이 마지막으로 읽은 뒤 다른 탭이 저장한 상태 위로 이 탭의 쓰기를 옮긴다(DEV_NOTES §3 CPO 10, §10).
//
// 탭마다 상태 전체를 메모리에 들고 쓰기마다 통째로 저장하므로(04 §4), 다른 탭의 변경 알림(storage 이벤트)이 늦거나 오지 않으면
// (뒤로 가기 캐시 복원·백그라운드 탭) 낡은 전체 상태가 다른 탭의 새 기록을 덮을 수 있었다. appStore.commit은 저장 직전에 저장소가
// 바뀌었는지 보고(persistence stateToken), 바뀌었으면 다시 읽어 이 함수로 합친 뒤 저장한다.
//
// 합치기는 서버 합치기(store/sync/merge.ts mergeStates)를 그대로 쓴다 — 기록·기분 답·글·댓글은 id 합집합(앱에 개별 삭제가 없다),
// 프로필·산모수첩은 칸마다 3방향(base = 이 탭이 마지막으로 본 저장 상태: 이 탭이 그 뒤 바꾼 칸만 이 탭 값, 나머지는 저장된 값).
// 하나만 다르다: 동의 묶음(consentAccepted·consentVersion·consentAcceptedAt)도 칸별 3방향으로 둔다. 서버 합치기의 "지금 판의 동의가
// 있는 쪽" 규칙을 탭 사이에 쓰면, 동기화 엔진이 가져온 기록의 동의를 지운 쓰기(engine.ts guardAdopted)를 다른 탭의 동의가 되살린다.

import type { PersistedState, UserProfile } from "@/domain/types";
import { mergeStates } from "./sync/merge";

const CONSENT_FIELDS = ["consentAccepted", "consentVersion", "consentAcceptedAt"] as const satisfies readonly (keyof UserProfile)[];

/**
 * mine   — 이 탭이 저장하려던 상태(낡은 상태에서 계산됨)
 * stored — 방금 다시 읽은 저장 상태(다른 탭이 쓴 것)
 * seen   — 이 탭이 마지막으로 읽거나 쓴 저장 상태(3방향의 기준)
 * accountId — 이 탭과 저장소가 같은 계정일 때만 부른다(다르면 appStore가 쓰기를 버린다)
 */
export function rebaseOnStored(mine: PersistedState, stored: PersistedState, seen: PersistedState, accountId: string): PersistedState {
  const merged = mergeStates(stored, mine, { accountId, base: seen });
  const consentChanged = CONSENT_FIELDS.some((k) => mine.profile[k] !== seen.profile[k]);
  const src = consentChanged ? mine.profile : stored.profile;
  return {
    ...merged,
    profile: {
      ...merged.profile,
      consentAccepted: src.consentAccepted,
      consentVersion: src.consentVersion,
      consentAcceptedAt: src.consentAcceptedAt,
    },
  };
}
