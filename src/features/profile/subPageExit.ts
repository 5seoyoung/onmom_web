// 하위 화면(글쓰기·글 상세·프로필 편집)을 떠나는 방법 — iOS는 시트를 닫거나(dismiss) 화면을 꺼낸다(pop).
// 웹에서 부모 주소로 다시 이동(push·replace)하면 방문 기록에 같은 화면이 두 번 남아 브라우저 [뒤로]가 제자리로 온다.
// 그래서 부모 화면에서 이동해 들어왔으면 history.back()으로, 그 밖(주소로 바로 들어옴 등)이면 부모 주소로 replace한다.
// 여기는 판단만 하는 순수 함수 — 브라우저 값을 읽고 이동하는 쪽은 LeaveSubPage.tsx.
// (공용 SubPageHeader가 "뒤로"를 늘 고정 경로로 push한다 — 공용 모듈에 옮길 후보)

export interface HistorySnapshot {
  /** 지금 주소(location.href) */
  currentUrl: string;
  /**
   * Navigation API가 있을 때 바로 앞 기록의 주소. 앞 기록이 없거나 다른 출처면 null.
   * API가 없는 브라우저면 undefined — 그때는 documentEntryUrl로 짐작한다.
   */
  previousEntryUrl?: string | null;
  /** 이 문서를 처음 연 주소(performance "navigation" 항목). 모르면 null. */
  documentEntryUrl: string | null;
  /** next.config basePath("" 또는 "/onmom_web") */
  basePath: string;
  /** 부모 화면 주소(basePath 없이, 예: "/journal/"). 앞 기록이 바로 이 화면일 때만 back() 한다. */
  parentHref: string;
}

function withoutHash(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * 같은 출처의 부모 화면 주소인가(쿼리·해시·끝 슬래시 무시). github.io는 한 출처에 다른 저장소 페이지도 살고,
 * 앱의 다른 화면(홈 등)에서 주소로 바로 들어온 경우 back()은 부모가 아닌 그 화면으로 가 버린다 — 부모일 때만 true.
 */
function isParentUrl(url: string, currentUrl: string, basePath: string, parentHref: string): boolean {
  try {
    const target = new URL(url);
    const current = new URL(currentUrl);
    if (target.origin !== current.origin) return false;
    return withoutTrailingSlash(target.pathname) === withoutTrailingSlash(`${basePath}${parentHref}`);
  } catch {
    return false;
  }
}

/**
 * history.back()으로 떠나도 되는가 = 바로 앞 기록이 부모 화면인가.
 * - Navigation API가 있으면 앞 기록 주소를 직접 본다(부모 화면이 아니면 replace — 예: 홈에서 글쓰기 주소를 입력해 들어옴).
 * - 없으면 문서를 처음 연 주소와 지금 주소가 다를 때만(= 앱 안에서 이동해 온 것) true.
 *   주소로 바로 들어온 화면은 false — 뒤로 가면 앱 밖으로 나가 버리므로 부모 주소로 replace한다.
 */
export function canLeaveWithHistoryBack(s: HistorySnapshot): boolean {
  if (s.previousEntryUrl !== undefined) {
    return s.previousEntryUrl !== null && isParentUrl(s.previousEntryUrl, s.currentUrl, s.basePath, s.parentHref);
  }
  if (!s.documentEntryUrl) return false;
  return withoutHash(s.documentEntryUrl) !== withoutHash(s.currentUrl);
}
