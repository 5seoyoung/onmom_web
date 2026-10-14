"use client";

// 설정 > 내 데이터 > PDF 리포트 — 내 기록을 인쇄용 한 문서로 보여 주고, [PDF로 저장]이 브라우저 인쇄 창(window.print)을 연다.
// PDF 라이브러리를 쓰지 않는다: 한글 글꼴(내장 Pretendard)이 그대로 찍히고, 새 의존성·번들 무게가 없고, 오프라인에서도 되고,
// 기록이 이 기기를 떠나지 않는다(네트워크 요청 없음 — 원본은 JSON 내려받기와 같은 스토어 스냅샷, reportModel.ts).
// 문서 제목(document.title)을 "온맘 기록 리포트 YYYY-MM-DD"로 바꿔 두어 브라우저가 그 이름을 PDF 파일 이름으로 제안하게 한다.
// 인쇄에서는 조작 요소(체크박스·버튼·[뒤로]·사이드바·탭바)가 빠지고 본문만 흰 종이에 찍힌다(print:hidden — ReportDocument 머리 주석).
// 기록장 글은 개인 메모라 기본으로 빼고, [기록장 글 포함]을 고를 때만 넣는다.
// PC 틀은 pageFrame(읽기 화면 — 최대 48rem, 왼쪽 정렬). 설정 아래 더 깊은 화면이라 PC에서도 [뒤로]가 맨 위 줄에 있다.

import { useEffect, useId, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useLocalDay } from "@/components/clock";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, PrimaryButton, SubPageHeader, cx } from "@/components/ui";
import { DATA_RIGHTS_TEXT, SETTINGS_HREF } from "@/features/settings/settingsView";
import { useAppStore } from "@/store/useAppStore";
import { ReportDocument } from "./ReportDocument";
import { buildReport } from "./reportModel";
import { REPORT_TEXT } from "./reportText";

/**
 * 이 화면에 있는 동안 문서 제목을 바꾼다 — 브라우저가 PDF 파일 이름으로 제안한다(window.print·브라우저 메뉴의 인쇄 모두).
 * - 주소로 바로 열면 Next가 메타데이터 <title>을 이 효과 뒤에 하이드레이션하며 원래 제목("온맘")으로 되돌린다 —
 *   그래서 머리(<head>)를 지켜보다가 **원래 제목으로 되돌아갈 때만** 다시 쓴다. 다른 제목(다음 화면의 메타데이터)으로 바뀌면 건드리지 않는다.
 * - 떠날 때 되돌리되, 그사이 다음 화면의 제목이 이미 들어왔으면 건드리지 않는다.
 */
function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = title;
    const observer = new MutationObserver(() => {
      // previous === title이면 쓰지 않는다(같은 값을 다시 써도 변화가 생겨 이 콜백이 끝없이 돈다)
      if (document.title === previous && previous !== title) document.title = title;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title === title) document.title = previous;
    };
  }, [title]);
}

export function ReportScreen() {
  const { hydrated, isSignedIn, state, account } = useAppStore();
  // 날짜 단위(산후 일차·만든 날짜) — 자정에만 다시 그린다. 서버 렌더·하이드레이션 첫 렌더는 null이라 사용자 데이터를 그리지 않는다.
  const day = useLocalDay();
  const [includeJournal, setIncludeJournal] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = hydrated && isSignedIn && day !== null;

  const report = useMemo(
    () => (ready && day !== null ? buildReport(state, account, day, { includeJournal }) : null),
    [ready, state, account, day, includeJournal],
  );
  useDocumentTitle(report?.documentTitle ?? null);

  function printReport() {
    // 인쇄 창은 브라우저가 연다(이 페이지의 인라인 스크립트 없음 — 보통의 클릭 처리). 막힌 브라우저면 문장으로 알린다.
    try {
      window.print();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <main className={cx("flex flex-1 flex-col gap-4 px-6 pt-2 pb-10 print:gap-5 print:p-0", PAGE_FRAME.reading)}>
      <SubPageHeader title={REPORT_TEXT.title} backHref={SETTINGS_HREF} />
      {report !== null ? (
        <>
          <ReportControls
            includeJournal={includeJournal}
            onIncludeJournalChange={setIncludeJournal}
            onPrint={printReport}
            failed={failed}
          />
          <ReportDocument report={report} />
        </>
      ) : null}
    </main>
  );
}

/** 화면 전용 조작(인쇄되지 않음) — [기록장 글 포함] 체크박스 · [PDF로 저장] 버튼 · 안내 · 실패 안내 */
export function ReportControls({
  includeJournal,
  onIncludeJournalChange,
  onPrint,
  failed,
}: {
  includeJournal: boolean;
  onIncludeJournalChange: (checked: boolean) => void;
  onPrint: () => void;
  /** 인쇄 창을 열지 못했다 */
  failed: boolean;
}) {
  const hintId = useId();
  return (
    <Card className="flex flex-col gap-3 print:hidden">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-text-primary">
        <input
          type="checkbox"
          checked={includeJournal}
          onChange={(e) => onIncludeJournalChange(e.target.checked)}
          className="size-5 shrink-0 cursor-pointer accent-neutral"
        />
        {REPORT_TEXT.includeJournal}
      </label>
      <PrimaryButton onClick={onPrint} aria-describedby={hintId} className="gap-2">
        <Printer aria-hidden className="size-5 shrink-0" strokeWidth={2.2} />
        {REPORT_TEXT.print}
      </PrimaryButton>
      <p id={hintId} className="text-[0.8125rem] text-text-secondary">
        {REPORT_TEXT.printHint}
      </p>
      {/* 실패는 색만이 아니라 문장으로 — 내 데이터 내려받기와 같은 안내(파일을 만들지 못함) */}
      <div role="alert" className="empty:hidden">
        {failed ? <p className="text-[0.8125rem] font-semibold text-state-alert-text">{DATA_RIGHTS_TEXT.exportFailed}</p> : null}
      </div>
    </Card>
  );
}
