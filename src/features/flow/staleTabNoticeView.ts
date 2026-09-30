// 여러 탭 보호로 이 탭의 쓰기를 버렸을 때의 안내 — 문구와 표시 규칙(순수). 화면은 StaleTabNotice.tsx.
//
// 다른 탭이 로그아웃·계정 삭제·다른 계정 로그인을 한 뒤, 그 변경을 아직 모르는 이 탭에서 기록·입력을 누르면 스토어는 저장하지 않고
// 저장소를 다시 읽는다(store/appStore.ts commit — 지운 계정의 기록을 되살리거나 다른 사람의 기록에 섞지 않게). 그러면 앱 관문이
// 로그인 화면(또는 바뀐 계정의 화면)으로 보낸다. 전에는 아무 말 없이 화면만 바뀌어, 방금 누른 것이 저장된 줄 알 수 있었다.
// 이제 스토어가 버린 수(discardedWrites)를 올리고, 이 안내가 조용히(role="status") 한 번 알린다. 닫으면 다음에 또 버릴 때까지 숨는다.

export const STALE_TAB_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (다른 탭의 로그아웃·계정 삭제·계정 전환 뒤, 이 탭에서 누른 기록을 저장하지 않았을 때 — iOS에는 없는 상황)
  message: "다른 탭에서 로그아웃하거나 계정이 바뀌어, 방금 입력한 내용은 저장하지 않았어요.",
  dismiss: "닫기", // 원문: RecordFlowView.swift:142 (닫기 버튼 접근성 이름)
} as const;

/**
 * 안내를 보일지 — 버린 쓰기 수가 마지막으로 닫았을 때의 수보다 많을 때만.
 * discarded는 페이지를 연 뒤 이 탭에서 버린 수(처음 0), dismissedAt은 [닫기]를 눌렀을 때의 그 수(처음 0).
 */
export function staleTabNoticeVisible(discarded: number, dismissedAt: number): boolean {
  return discarded > dismissedAt;
}
