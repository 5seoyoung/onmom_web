// 생활 권고 — iOS LifestyleView.swift. content.json만 쓰는 정적 화면이라 서버 컴포넌트다(사용자 데이터 없음).
// iOS는 엔진을 비동기로 불러 ProgressView를 먼저 보이지만, 웹은 내용이 번들에 있어 바로 그린다.
// 순서: 카드 5장(분류 · 제목 · 설명 · 근거/출처 칩) → 면책 배너.
// PC(넓은 화면, 컨테이너 쿼리 42rem 이상): 카드를 2열로, 면책 배너는 전체 폭. 폰 기둥에서는 한 줄.
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, DisclaimerBanner, EvidenceChipList, SubPageHeader, cx } from "@/components/ui";
import { SfIcon } from "@/features/guide/SfIcon";
import { LIFESTYLE_TEXT, lifestyleTipViews, type LifestyleTipView } from "./lifestyleContent";
import { ROUTES } from "@/routes";

export function LifestyleScreen() {
  const tips = lifestyleTipViews();

  return (
    // VStack(spacing: md) · 좌우 lg · 끝 Spacer(minLength: lg) — LifestyleView.swift:12-45. PC 틀은 pageFrame(격자 화면)
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      <SubPageHeader title={LIFESTYLE_TEXT.title} backHref={ROUTES.profile} hideBackWithSidebar />

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        {tips.map((tip) => (
          <LifestyleTipCard key={tip.key} tip={tip} />
        ))}
      </div>

      <DisclaimerBanner />
    </main>
  );
}

// LifestyleView.swift:17-40 (아이콘 원 44 · accent 25% · 분류 11 semibold · 제목 16 semibold · 설명 13 · 칩 줄)
function LifestyleTipCard({ tip }: { tip: LifestyleTipView }) {
  return (
    <Card as="article">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/25 text-primary">
          <SfIcon name={tip.icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[0.6875rem] font-semibold text-text-secondary">{tip.category}</p>
          <h2 className="text-base font-semibold text-text-primary">{tip.title}</h2>
          <p className="text-[0.8125rem] text-text-secondary">{tip.detail}</p>
          <EvidenceChipList tokens={tip.chips} className="pt-0.5" />
        </div>
      </div>
    </Card>
  );
}
