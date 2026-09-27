// 회복 가이드 — iOS GuideView.swift. content.json만 쓰는 정적 화면이라 서버 컴포넌트다(사용자 데이터 없음).
// 순서: 머리(제목·부제) → 즉시 병원에 가야 할 신호 카드 → 가이드 카드 8장(출처 칩) → 출처 각주.
// PC(넓은 화면, 컨테이너 쿼리 42rem 이상): 가이드 카드를 2열로. 병원 신호 카드와 각주는 늘 전체 폭. 폰 기둥에서는 한 줄.
import { TriangleAlert } from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, EvidenceChip, SubPageHeader, cx } from "@/components/ui";
import { SfIcon } from "./SfIcon";
import { GUIDE_TEXT, guideCardViews, guideRedFlags, splitPhoneNumbers, type GuideCardView } from "./guideContent";
import { ROUTES } from "@/routes";

const RED_FLAG_HEADING_ID = "guide-red-flags";

export function GuideScreen() {
  const redFlags = guideRedFlags();
  const cards = guideCardViews();

  return (
    // VStack(spacing: md) · 좌우 lg · 끝 Spacer(minLength: lg) — GuideView.swift:83-92. PC 틀은 pageFrame(격자 화면)
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      <SubPageHeader title={GUIDE_TEXT.title} subtitle={GUIDE_TEXT.subtitle} backHref={ROUTES.profile} hideBackWithSidebar />

      {redFlags.length > 0 ? <RedFlagSignsCard flags={redFlags} /> : null}

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        {cards.map((card) => (
          <GuideCard key={card.key} card={card} />
        ))}
      </div>

      {/* GuideView.swift:157-163 — 11 textSecondary, 위 여백 xs */}
      <p className="pt-1 text-[0.6875rem] text-text-secondary">{GUIDE_TEXT.footnote}</p>
    </main>
  );
}

// 즉시 내원 신호 강조 카드 — GuideView.swift:106-133 (stateAlert 배경 · 흰 글씨 · 패딩 lg · 간격 sm)
function RedFlagSignsCard({ flags }: { flags: readonly string[] }) {
  return (
    <section
      aria-labelledby={RED_FLAG_HEADING_ID}
      className="flex w-full flex-col gap-2 rounded-card bg-state-alert p-6 text-white"
    >
      <div className="flex items-center gap-2">
        {/* exclamationmark.triangle.fill — 흰 삼각형 안에 배경색 느낌표 */}
        <TriangleAlert aria-hidden className="size-5 shrink-0 fill-white text-state-alert" />
        <h2 id={RED_FLAG_HEADING_ID} className="text-base font-bold">
          {GUIDE_TEXT.redFlagTitle}
        </h2>
      </div>
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li key={flag} className="flex items-start gap-1.5 text-base">
            <span aria-hidden className="text-white/90">
              •
            </span>
            <KeepPhones text={flag} />
          </li>
        ))}
      </ul>
      <p className="pt-0.5 text-[0.6875rem] font-medium text-white/85">{GUIDE_TEXT.redFlagSource}</p>
    </section>
  );
}

// 가이드 카드 — GuideView.swift:135-155 (아이콘 원 44 · secondary 20% · 제목 16 semibold · 요점 13 · 출처 칩)
function GuideCard({ card }: { card: GuideCardView }) {
  return (
    <Card as="article">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-primary">
          <SfIcon name={card.icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-base font-semibold text-text-primary">{card.title}</h2>
          <ul className="flex flex-col gap-1.5">
            {card.points.map((point) => (
              <li key={point} className="flex items-start gap-1.5 text-[0.8125rem] text-text-secondary">
                <span aria-hidden>•</span>
                <KeepPhones text={point} />
              </li>
            ))}
          </ul>
          {card.sourceToken ? (
            <div className="flex pt-0.5">
              <EvidenceChip token={card.sourceToken} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** 문장 속 전화번호를 한 줄에 묶어 보여 준다(글자는 그대로). */
function KeepPhones({ text }: { text: string }) {
  return (
    <span>
      {splitPhoneNumbers(text).map((seg, i) =>
        seg.phone ? (
          <span key={i} className="whitespace-nowrap">
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </span>
  );
}
