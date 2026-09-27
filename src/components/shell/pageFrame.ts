// 앱 화면(AppShell 안 <main>)의 PC 틀 — 사이드바가 보일 때(lg 이상) 모든 화면이 같은 자리에서 시작하게 한다.
// 탭 5개·"더보기" 서비스 7개·더 깊은 화면(프로필 편집·글쓰기·글 상세·회복 단계 분석)이 모두 이 값을 쓴다.
//
// 폰·태블릿(lg 미만)에는 아무 영향이 없다 — 여기 클래스는 전부 `lg:` 접두다. 폰 여백(px-5/px-6, pb-6/pb-10 …)은
// 화면마다 Swift 값 그대로 두고, 이 값을 뒤에 붙인다: cx(폰 클래스, PAGE_FRAME.wide).
//
// PC 규칙:
// - 왼쪽 선: 좌우 1.5rem. 껍데기 안쪽 2rem(AppShell lg:px-8)과 더해 모든 화면의 제목·카드 왼쪽이 같은 x(1440 창에서 392px).
// - 머리 자리: 위 1.5rem — [뒤로] 줄(44px)이 사이드바 로고 줄과 같은 높이, 제목(ScreenHeader, 위아래 8px)은 32px에서 시작.
//   창 높이가 52rem 이하(1366×768 노트북 브라우저 등)면 사이드바처럼 위 여백을 0.75rem으로 줄인다(SideNav와 같은 기준).
// - 아래 3rem.
// - 폭: reading(읽기·입력 화면) = 최대 48rem(좌우 여백 포함 → 글줄 45rem), 왼쪽 정렬.
//   wide(격자 화면·탭 화면) = 껍데기 폭 전부(최대 64rem). 가운데 정렬하는 화면은 없다(AI 상담 포함).
// - wide 화면 안의 한 줄 블록(동네 입력·운동 안내 카드)은 READING_BLOCK — reading 화면의 글줄과 같은 45rem.
//
// [뒤로]: 사이드바에 바로 있는 화면(서비스 7개)은 PC에서 숨긴다(SubPageHeader hideBackWithSidebar) — 사이드바가 길잡이다.
// 더 깊은 화면(프로필 편집·글쓰기·글 상세·분석)은 PC에서도 같은 자리(맨 위 줄)에 둔다. 폰·태블릿은 지금까지처럼 늘 보인다.

/** PC 좌우 여백 */
export const PAGE_EDGE_X = "lg:px-6";
/** PC 위 여백(낮은 창에서는 사이드바처럼 줄인다) */
export const PAGE_EDGE_TOP = "lg:pt-6 lg:[@media(max-height:52rem)]:pt-3";
/** reading 화면의 폭 — 좌우 여백 포함 48rem, 왼쪽 정렬 */
export const READING_WIDTH = "lg:w-full lg:max-w-[48rem]";

export const PAGE_FRAME = {
  /** 격자 화면·탭 화면 — 껍데기 폭 전부 */
  wide: `${PAGE_EDGE_X} ${PAGE_EDGE_TOP} lg:pb-12`,
  /** 읽기·입력 화면 — 최대 48rem, 왼쪽 정렬 */
  reading: `${READING_WIDTH} ${PAGE_EDGE_X} ${PAGE_EDGE_TOP} lg:pb-12`,
} as const;

/** reading 화면의 글줄 폭(48rem − 좌우 1.5rem×2) — wide 화면 안의 한 줄 블록 */
export const READING_BLOCK = "lg:max-w-[45rem]";
