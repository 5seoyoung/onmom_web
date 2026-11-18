// 회복 가이드 — iOS GuideView.swift. content.json만 쓰는 정적 화면이라 서버 컴포넌트다(사용자 데이터 없음). 주제 고르기만 클라이언트(GuideTopics).
// 2026-11-15 산부인과 전문의 화면 검토: 카드 8장을 한 줄로 길게 내리면 의료인이 아닌 사람이 읽기 어렵다 → 주제 목록 + 고른 주제 카드 하나.
// 순서: 머리(제목·부제) → 주제 목록(아이콘 타일) → 고른 주제 카드(큰 머리·요점·출처 보기) → 즉시 병원에 가야 할 신호 카드 → 출처 각주.
// 위험 신호 카드(119·109·1577-0199 전화 링크 포함)는 주제와 상관없이 늘 보인다 — 주제 패널 밖에 둔다.
// 문장 속 전화번호(정신건강복지센터 1577-0199)는 tel: 링크(PhoneLinks — web/07 §5). 글자는 그대로.
// PC(넓은 화면, 컨테이너 쿼리 42rem 이상): 주제 타일 4열, 고른 주제 카드와 위험 신호 카드를 나란히. 폰 기둥에서는 한 줄.
import { TriangleAlert } from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { SourceDisclosure, SubPageHeader, cx } from "@/components/ui";
import { GUIDE_TEXT, guideRedFlags, guideTopics } from "./guideContent";
import { GuideTopics } from "./GuideTopics";
import { PhoneLinks } from "./PhoneLinks";
import { ROUTES } from "@/routes";

const RED_FLAG_HEADING_ID = "guide-red-flags";

export function GuideScreen() {
  const redFlags = guideRedFlags();

  return (
    // VStack(spacing: md) · 좌우 lg · 끝 Spacer(minLength: lg) — GuideView.swift:83-92. PC 틀은 pageFrame(격자 화면)
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      <SubPageHeader title={GUIDE_TEXT.title} subtitle={GUIDE_TEXT.subtitle} backHref={ROUTES.profile} hideBackWithSidebar />

      <GuideTopics topics={guideTopics()} aside={redFlags.length > 0 ? <RedFlagSignsCard flags={redFlags} /> : null} />

      {/* GuideView.swift:157-163 — 11 textSecondary, 위 여백 xs */}
      <p className="pt-1 text-[0.6875rem] text-text-secondary">{GUIDE_TEXT.footnote}</p>
    </main>
  );
}

// 즉시 내원 신호 강조 카드 — GuideView.swift:106-133 (배경 전면 · 흰 글씨 · 패딩 lg · 간격 sm).
// 배경은 iOS의 stateAlert(흰 글씨 2.76:1) 대신 state-alert-strong(4.63:1), 출처 줄은 흰 85%(3.76:1) 대신 흰 글씨(DEV_NOTES §3 CPO 12).
// 출처 줄은 흰 글씨 "출처 보기" 하나로 접어 둔다(2026-11-15 산부인과 전문의 화면 검토). 글자는 GUIDE_TEXT.redFlagSource 그대로 —
// "산욕기 이상소견"은 문헌 이름이 아니라 나누지 않고 한 줄로 둔다.
function RedFlagSignsCard({ flags }: { flags: readonly string[] }) {
  return (
    <section
      aria-labelledby={RED_FLAG_HEADING_ID}
      className="flex w-full flex-col gap-2 rounded-card bg-state-alert-strong p-6 text-white"
    >
      <div className="flex items-center gap-2">
        {/* exclamationmark.triangle.fill — 흰 삼각형 안에 배경색 느낌표 */}
        <TriangleAlert aria-hidden className="size-5 shrink-0 fill-white text-state-alert-strong" />
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
            {/* 붉은 카드 위라 링크도 흰색(지금 문구에는 번호가 없다 — 생기면 같은 규칙) */}
            <PhoneLinks text={flag} linkClassName="text-white" />
          </li>
        ))}
      </ul>
      <SourceDisclosure sources={[GUIDE_TEXT.redFlagSource]} tone="inverse" className="pt-2" />
    </section>
  );
}
