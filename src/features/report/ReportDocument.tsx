import type { ReactNode } from "react";
import { Card, SectionTitle, cx } from "@/components/ui";
import type { Report, ReportJournalPost, ReportMoodRow, ReportRow, ReportSection, ReportSymptomRow } from "./reportModel";
import { REPORT_TEXT } from "./reportText";

// PDF 리포트 본문 — reportModel이 고른 글자만 그린다(상태·시각·브라우저 API 없음 — 서버 렌더로 마크업을 시험한다).
// 화면: 앱 카드 모양 그대로(섹션마다 카드). 인쇄(@media print — Tailwind print:): 카드 그림자·둥근 모서리·안쪽 여백을 걷어
// 흰 종이에 제목·표만 남기고, 표의 한 줄·정보 한 줄이 쪽 사이에서 갈라지지 않게(break-inside: avoid), 제목이 쪽 끝에 홀로 남지 않게
// (break-after: avoid) 한다. 쪽 여백·흰 배경은 globals.css의 @media print, 앱 껍데기(사이드바·탭바·[뒤로])는 각 컴포넌트의 print:hidden.
// 접근성: 섹션마다 h2(제목 단계는 h1 → h2 → h3), 표는 <th scope="col">·<th scope="row">(기록 시각·날짜가 행 머리).
// 증상 기록(7열)은 카드 안 폭이 36rem 이상(PC 읽기 화면)이거나 인쇄일 때만 표, 그보다 좁으면(폰·태블릿, PC 글자 150%) 기록마다
// 한 덩어리(시각·결과 + 이름/값 목록) — 좁은 폭에서 표를 가로로 밀면 가장 중요한 "결과" 열이 화면 밖에 숨는다. 컨테이너 쿼리라
// 글자를 키우면(rem) 기준도 함께 커진다. 둘 중 하나는 display:none이라 낭독·초점에 두 번 나오지 않는다.
// 표 줄의 구분선은 칸마다(border-separate) — 겹치는 반투명 선(border-collapse)이 열 경계에 진한 점을 남기지 않게.
// 기록마다의 버전(감사 추적)은 열을 늘리지 않고 칸 안의 작은 글씨 한 줄(RecordVersion) — 증상 기록은 결과 아래 "규칙 버전",
// 기분 답은 질문 아래 "질문 버전". 버전이 없는 옛 기록·iOS 기록에는 그리지 않는다. 바닥글의 버전은 이 앱의 지금 버전이다.

/** 인쇄에서 카드 모양을 걷는다 — 흰 종이 위 제목·내용만 */
const SECTION_CLASS = "flex flex-col gap-3 print:rounded-none print:p-0 print:shadow-none";
/** 섹션 제목 — 화면은 앱 카드 소제목(SectionTitle) 그대로, 인쇄는 조금 크고 진하게 + 쪽 끝에 홀로 남지 않게 */
const HEADING_CLASS = "break-after-avoid print:text-base print:font-bold print:text-text-primary";
const EMPTY_CLASS = "text-[0.8125rem] text-text-secondary";
/** 표 — 칸마다 구분선(border-separate, 간격 0). 줄 사이 선은 인쇄에서도 보이게 조금 진하게 */
const TABLE = "w-full border-separate border-spacing-0 text-[0.8125rem]";
const TH_COL = "border-b border-neutral/20 px-2 py-2 text-left align-bottom text-xs font-semibold text-text-secondary";
const TD = "border-b border-neutral/10 px-2 py-2 align-top text-text-primary group-last:border-b-0";
/** 표의 한 줄 — 쪽 사이에서 갈라지지 않게 */
const TR = "group break-inside-avoid";
/** 표가 아닌 목록 줄(정보 줄·폰의 기록 덩어리) — 아래 구분선, 마지막 줄은 없음 */
const ROW = "break-inside-avoid border-b border-neutral/10 last:border-b-0";

const sectionId = (key: ReportSection["key"]) => `report-${key}`;

/** 값 없음(묻지 않음·옛 기록) — 보이는 "-"(범례가 뜻을 말한다), 낭독은 빈 칸 */
function NoValue() {
  return <span aria-hidden>-</span>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id} className={SECTION_CLASS}>
      <SectionTitle id={id} className={HEADING_CLASS}>
        {title}
      </SectionTitle>
      {children}
    </Card>
  );
}

/** 이름 왼쪽·값 오른쪽 — 설정 카드의 정보 줄과 같은 모양 */
function InfoRows({ rows }: { rows: readonly ReportRow[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div key={row.key} className={cx("flex items-start justify-between gap-4 py-1.5", ROW)}>
          <dt className="shrink-0 text-[0.9375rem] text-text-secondary">{row.label}</dt>
          <dd className="min-w-0 text-right text-[0.9375rem] font-semibold text-text-primary tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 기록마다의 버전(규칙 버전·질문 버전) — 작은 글씨 한 줄. 버전이 없는 옛 기록·iOS 기록(null)은 그리지 않는다. */
function RecordVersion({ text }: { text: string | null }) {
  return text !== null ? <span className="mt-0.5 block text-xs text-text-secondary">{text}</span> : null;
}

/**
 * 결과 — 색과 함께 글자가 상태를 말한다(색만으로 구분하지 않음). 켜져 있던 위험 증상이 기록에 있으면 그 라벨도,
 * 그 결과를 낸 규칙의 버전이 기록에 있으면 그 버전도(표·좁은 폭 덩어리 모두 결과 바로 아래).
 */
function SymptomResult({ row }: { row: ReportSymptomRow }) {
  return (
    <>
      <span className={cx("font-semibold", row.flagged ? "text-state-alert-text" : "text-state-normal-text")}>{row.result}</span>
      {row.signals.length > 0 ? <span className="mt-0.5 block text-xs text-text-secondary">{row.signals.join(", ")}</span> : null}
      <RecordVersion text={row.rulesVersionText} />
    </>
  );
}

/** 넓은 폭·인쇄 — 7열 표 */
function SymptomTable({ labelledBy, columns, rows }: { labelledBy: string; columns: readonly string[]; rows: readonly ReportSymptomRow[] }) {
  return (
    <table aria-labelledby={labelledBy} className={cx(TABLE, "tabular-nums")}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className={TH_COL}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={TR}>
            <th scope="row" className={cx(TD, "text-left font-normal whitespace-nowrap")}>
              <time dateTime={r.iso}>{r.dateText}</time>
            </th>
            <td className={cx(TD, "whitespace-nowrap")}>{r.dayText ?? <NoValue />}</td>
            <td className={TD}>{r.lochiaIncreased ?? <NoValue />}</td>
            <td className={TD}>{r.lochiaRed ?? <NoValue />}</td>
            <td className={TD}>{r.fever}</td>
            <td className={cx(TD, "whitespace-nowrap")}>{r.pain}</td>
            <td className={TD}>
              <SymptomResult row={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 좁은 폭(화면만) — 기록마다 시각·결과 한 줄 + 나머지 열을 이름/값으로. 이름은 표의 열 이름 그대로 */
function SymptomBlocks({ columns, rows }: { columns: readonly string[]; rows: readonly ReportSymptomRow[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const details: ReadonlyArray<readonly [string, string | null]> = [
          [columns[1], r.dayText],
          [columns[2], r.lochiaIncreased],
          [columns[3], r.lochiaRed],
          [columns[4], r.fever],
          [columns[5], r.pain],
        ];
        return (
          <li key={r.id} className={cx("flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0", ROW)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[0.9375rem]">
              <time dateTime={r.iso} className="font-semibold text-text-primary tabular-nums">
                {r.dateText}
              </time>
              <span className="text-[0.8125rem]">
                <SymptomResult row={r} />
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[0.8125rem]">
              {details.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd className="text-text-primary tabular-nums">{value ?? <NoValue />}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function MoodTable({ labelledBy, columns, rows }: { labelledBy: string; columns: readonly string[]; rows: readonly ReportMoodRow[] }) {
  return (
    <table aria-labelledby={labelledBy} className={TABLE}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className={TH_COL}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={TR}>
            <th scope="row" className={cx(TD, "text-left font-normal whitespace-nowrap tabular-nums")}>
              <time dateTime={r.iso}>{r.dateText}</time>
            </th>
            {/* 모르는 문항(다음 버전 문항 등)은 빈 칸 — 답은 이용자의 기록이라 그대로 둔다. 질문 버전이 있으면 질문 아래 작은 글씨 */}
            <td className={TD}>
              {r.question ?? ""}
              <RecordVersion text={r.moodVersionText} />
            </td>
            <td className={cx(TD, "whitespace-nowrap font-semibold")}>{r.answer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 좁은 폭(화면만) — 답마다 날짜·답 한 줄 + 질문 한 줄. 표의 질문 칸이 좁아 글자가 한 자씩 꺾이지 않게(글자 150% 폰에서 확인) */
function MoodBlocks({ rows }: { rows: readonly ReportMoodRow[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.id} className={cx("flex flex-col gap-1 py-3 first:pt-0 last:pb-0", ROW)}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[0.9375rem]">
            <time dateTime={r.iso} className="text-text-secondary tabular-nums">
              {r.dateText}
            </time>
            <span className="font-semibold text-text-primary">{r.answer}</span>
          </div>
          {/* 모르는 문항(다음 버전 문항 등)은 질문 줄을 그리지 않는다 — 답은 이용자의 기록이라 그대로 둔다 */}
          {r.question !== null ? <p className="text-[0.9375rem] text-text-primary">{r.question}</p> : null}
          <RecordVersion text={r.moodVersionText} />
        </li>
      ))}
    </ul>
  );
}

function JournalPosts({ posts }: { posts: readonly ReportJournalPost[] }) {
  return (
    <div className="flex flex-col">
      {posts.map((p) => (
        <article key={p.id} className="flex flex-col gap-1 border-b border-neutral/10 py-3 first:pt-0 last:border-b-0 last:pb-0">
          <h3 className="break-after-avoid text-base font-semibold text-text-primary">{p.title}</h3>
          <p className="text-[0.8125rem] text-text-secondary">
            <time dateTime={p.iso}>{p.dateText}</time>
          </p>
          {p.body.length > 0 ? <p className="text-[0.9375rem] whitespace-pre-wrap text-text-primary">{p.body}</p> : null}
          {p.commentsLabel !== null ? (
            <div className="mt-1 flex flex-col gap-1.5 border-l-2 border-neutral/10 pl-3">
              <p className="text-[0.8125rem] font-semibold text-text-secondary">{p.commentsLabel}</p>
              <ul className="flex flex-col gap-1.5">
                {p.comments.map((c) => (
                  <li key={c.id} className="break-inside-avoid">
                    <p className="text-[0.9375rem] whitespace-pre-wrap text-text-primary">{c.text}</p>
                    <p className="text-xs text-text-secondary">
                      <time dateTime={c.iso}>{c.dateText}</time>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SectionBody({ section }: { section: ReportSection }) {
  const id = sectionId(section.key);
  switch (section.key) {
    case "profile":
      return <InfoRows rows={section.rows} />;
    case "maternity":
      return (
        <>
          <p className="text-[0.8125rem] text-text-secondary">{section.note}</p>
          {section.items.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {section.items.map((item) => (
                <li key={item} className="rounded-full border border-neutral/15 px-3 py-1 text-[0.8125rem] font-medium text-text-primary">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className={EMPTY_CLASS}>{REPORT_TEXT.maternityEmpty}</p>
          )}
        </>
      );
    case "symptoms":
      if (section.rows.length === 0) return <p className={EMPTY_CLASS}>{REPORT_TEXT.empty}</p>;
      return (
        <>
          {/* 카드 안 폭 36rem(표가 들어가는 폭) 이상이거나 인쇄면 표, 아니면 덩어리 — 머리 주석 */}
          <div className="@container">
            <div className="hidden @xl:block print:block">
              <SymptomTable labelledBy={id} columns={section.columns} rows={section.rows} />
            </div>
            <div className="@xl:hidden print:hidden">
              <SymptomBlocks columns={section.columns} rows={section.rows} />
            </div>
          </div>
          {section.showsNoValueNote ? <p className="text-xs text-text-secondary">{REPORT_TEXT.noValueNote}</p> : null}
        </>
      );
    case "moods":
      if (section.rows.length === 0) return <p className={EMPTY_CLASS}>{REPORT_TEXT.empty}</p>;
      return (
        // 증상 기록과 같은 규칙 — 카드 안 폭 36rem 이상이거나 인쇄면 표, 아니면 덩어리
        <div className="@container">
          <div className="hidden @xl:block print:block">
            <MoodTable labelledBy={id} columns={section.columns} rows={section.rows} />
          </div>
          <div className="@xl:hidden print:hidden">
            <MoodBlocks rows={section.rows} />
          </div>
        </div>
      );
    case "journal":
      if (section.posts.length === 0) return <p className={EMPTY_CLASS}>{REPORT_TEXT.empty}</p>;
      return <JournalPosts posts={section.posts} />;
  }
}

/** 리포트 본문 — 머리(만든 날짜·계정 종류) · 섹션들 · 바닥글. 화면 제목(h1)은 ReportScreen의 머리가 그린다. */
export function ReportDocument({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-4 print:gap-6">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[0.9375rem]">
        {report.meta.map((row) => (
          <div key={row.key} className="flex gap-2">
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="font-semibold text-text-primary tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {report.sections.map((section) => (
        <Section key={section.key} id={sectionId(section.key)} title={section.title}>
          <SectionBody section={section} />
        </Section>
      ))}

      <footer className="flex break-inside-avoid flex-col gap-1 border-t border-neutral/10 pt-4">
        <p className="text-[0.8125rem] text-text-secondary">{report.footer.disclaimer}</p>
        <p className="text-[0.8125rem] text-text-secondary">{report.footer.origin}</p>
        <p className="text-xs text-text-subtle-aa">{report.footer.rulesVersion}</p>
      </footer>
    </div>
  );
}
