import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  Ban,
  BookMarked,
  BookOpenCheck,
  ClipboardPen,
  Clock3,
  Dumbbell,
  HandHeart,
  ListChecks,
  LockKeyhole,
  MessageCircleHeart,
  Stethoscope,
} from "lucide-react";
import content from "@/content";
import { isClinicSearchConfigured } from "@/api/clinics";
import { cx, primaryButtonClass } from "@/components/ui";
import { isLLMBackendConfigured, isSupabaseConfigured } from "@/config";
import { CLINICS_TEXT } from "@/features/clinics/clinicsView";
import brandLogo from "@/features/flow/brand-logo.png";
import { CONTACT_EMAIL, CONTACT_TEXT, mailtoHref } from "@/features/terms/contact";
import { hasTermsText, TERMS_TEXT } from "@/features/terms/termsText";
import { ROUTES } from "@/routes";
import {
  FEATURES,
  LANDING_TEXT,
  NAV_ITEMS,
  PRINCIPLES,
  SECTION_ID,
  STEPS,
  ctaNoteFor,
  paragraphText,
  sectionTitle,
  type LandingBuild,
  type LandingIcon,
  type LandingSection,
} from "./landingContent";
import { LandingHomeLink } from "./LandingHomeLink";
import { StartLink, StartNote } from "./StartLink";

// 서비스 소개("/") — 누구나 보는 첫 주소. 앱(로그인·온보딩·탭)과 달리 폰 폭 기둥 없이 전체 폭을 쓴다.
// 서버 컴포넌트라 정적 HTML에 그대로 들어간다. 사용자 데이터는 쓰지 않고, 시작 버튼(StartLink)과 그 안내 줄(StartNote)만
// 브라우저에서 로그인 여부를 읽어 [시작하기] ↔ [내 회복 기록 열기]로 바뀐다(안내 줄은 앱을 쓰는 사람에게 숨김).
// 카카오 로그인·AI 서버·산부인과 찾기가 이 빌드에서 켜졌는지(LandingBuild)에 따라 사실이 달라지는 문장은 빌드 때 고른다.
//
// 폰: 한 줄(좌우 여백 1.25rem), 머리 메뉴 숨김. md(48rem)부터: 히어로 두 칸, 기능 두 칸 → lg(64rem) 세 칸, 머리 메뉴.
// 본문 폭은 최대 72rem 가운데, 문단은 42rem 이하.
// 문구와 구성은 landingContent.ts. 가짜 수치·후기·예시 화면은 넣지 않는다(원칙 3).

const CONTAINER = "mx-auto w-full max-w-[72rem] px-5 md:px-8";
/** 바닥글 링크(개인정보처리방침·이용약관·문의) — 누르는 영역 44, 밑줄 */
const FOOTER_LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-button font-semibold text-text-primary underline underline-offset-4 hover:text-text-secondary";
/** brand-logo.png의 바탕색 — 로고가 판 위에 떠 보이지 않고 한 장처럼 보이게 */
const LOGO_BACKGROUND = "bg-[#fdefeb]";

const ICONS: Record<LandingIcon, LucideIcon> = {
  exercise: Dumbbell,
  record: ClipboardPen,
  question: MessageCircleHeart,
  guide: BookOpenCheck,
  support: HandHeart,
  storage: LockKeyhole,
  notDevice: Stethoscope,
  rules: ListChecks,
  noScore: Ban,
  sources: BookMarked,
};

/** 기본값은 모두 빌드 설정(NEXT_PUBLIC_*) — 테스트는 값을 넘겨 빌드별 문구를 확인한다. */
export interface LandingPageProps {
  /** 가까운 산부인과 찾기가 이 빌드에서 동작하는가(카카오 JS 키). 아니면 해당 문단 옆에 "준비 중". */
  clinicSearchReady?: boolean;
  /** 카카오 로그인·서버 저장(Supabase)이 켜졌는가. 저장 안내·마지막 권유의 안내 줄이 달라진다. */
  kakaoLoginReady?: boolean;
  /** AI 서버가 켜졌는가. "서버로 전송되지 않습니다"·"AI는 판단하지 않아요"를 뺀 문구로 바꾼다. */
  llmReady?: boolean;
}

export function LandingPage({
  clinicSearchReady = isClinicSearchConfigured(),
  kakaoLoginReady = isSupabaseConfigured(),
  llmReady = isLLMBackendConfigured(),
}: LandingPageProps) {
  const build: LandingBuild = { clinicSearchReady, kakaoLoginReady, llmReady };
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Mission />
        <Features build={build} />
        <Steps />
        <Principles build={build} />
        <FinalCta note={ctaNoteFor(build)} />
      </main>
      <SiteFooter />
    </div>
  );
}

function Logo({ className, eager = false }: { className: string; eager?: boolean }) {
  return (
    <Image
      src={brandLogo}
      alt=""
      aria-hidden
      width={240}
      height={240}
      loading={eager ? "eager" : "lazy"}
      className={cx("shrink-0 object-contain", className)}
    />
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-divider bg-background/90 backdrop-blur-md">
      <div className={cx(CONTAINER, "flex min-h-16 items-center justify-between gap-4")}>
        {/* 로고·온맘 — 여기(서비스 소개)서 누르면 맨 위로 부드럽게(움직임 줄이기면 바로), 섹션 조각(#…)은 지운다(landingTop.ts) */}
        <LandingHomeLink className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-button px-1">
          <Logo eager className="size-9 rounded-[0.625rem]" />
          <span className="shrink-0 text-[1.1875rem] font-bold whitespace-nowrap text-neutral">{LANDING_TEXT.brand}</span>
        </LandingHomeLink>
        <nav className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex min-h-11 items-center rounded-button px-3 text-[0.9375rem] font-semibold text-text-secondary hover:bg-surface hover:text-text-primary"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <StartLink className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-button bg-neutral px-4 text-[0.9375rem] font-semibold text-white hover:bg-neutral/85" />
      </div>
    </header>
  );
}

function Hero() {
  // 부제는 쉼표 뒤에서 줄을 바꾼다(글자는 그대로 — 줄바꿈 앞 공백을 남겨 읽을 때도 한 문장).
  const [lead, rest] = splitAfterComma(LANDING_TEXT.tagline);
  return (
    <section aria-labelledby="landing-title" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_32rem_at_85%_0%,var(--color-coral-tint),transparent_70%)]"
      />
      <div className={cx(CONTAINER, "grid items-center gap-10 pt-10 pb-14 md:grid-cols-[1.15fr_0.85fr] md:gap-12 md:pt-20 md:pb-24")}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[0.8125rem] font-semibold text-text-secondary ring-1 ring-text-subtle/20">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            {LANDING_TEXT.eyebrow}
          </p>
          <h1 id="landing-title" className="mt-5 text-[2.25rem] leading-[1.2] font-bold tracking-tight text-neutral md:text-[3rem] lg:text-[3.5rem]">
            {lead}
            {rest !== null && (
              <>
                {" "}
                <br />
                {rest}
              </>
            )}
          </h1>
          <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-relaxed text-text-secondary md:text-lg">{LANDING_TEXT.promo}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <StartLink className={cx(primaryButtonClass, "hover:bg-neutral/85 sm:w-auto sm:px-8")} />
            <a
              href={`#${SECTION_ID.about}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-surface px-6 py-4 text-[1.0625rem] font-semibold text-neutral ring-1 ring-text-subtle/30 ring-inset hover:bg-divider sm:w-auto"
            >
              {LANDING_TEXT.learnMore}
              <ArrowDown aria-hidden className="size-4" />
            </a>
          </div>
        </div>

        {/* 브랜드 판 — 로고와 온보딩 첫 화면 인사말. 앱 화면 흉내(예시 데이터)는 넣지 않는다. */}
        <div className={cx("relative isolate mx-auto w-full max-w-[26rem] overflow-hidden rounded-[2rem] px-6 py-8 md:py-14", LOGO_BACKGROUND)}>
          <div className="relative mx-auto size-32 sm:size-40 md:size-48">
            {/* 둥근 선은 로고(불투명 정사각형)의 대각선보다 크게 — 로고 모서리에 잘려 보이지 않게 */}
            <span aria-hidden className="absolute top-1/2 left-1/2 -z-10 size-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white sm:size-[16rem] md:size-[19rem]" />
            <span aria-hidden className="absolute top-1/2 left-1/2 -z-10 size-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 sm:size-[23rem] md:size-[27rem]" />
            <Logo eager className="size-full" />
          </div>
          <p className="mt-4 text-center text-[1.125rem] leading-snug font-semibold whitespace-pre-line text-neutral md:text-[1.25rem]">
            {LANDING_TEXT.welcome}
          </p>
        </div>
      </div>
    </section>
  );
}

function Mission() {
  return (
    <div id={SECTION_ID.about} className="scroll-mt-16 border-y border-divider bg-surface">
      <p className={cx(CONTAINER, "py-12 text-center md:py-16")}>
        <span className="mx-auto block max-w-[42rem] text-[1.1875rem] leading-relaxed font-semibold text-neutral md:text-[1.5rem]">
          {LANDING_TEXT.mission}
        </span>
      </p>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow?: string; title: string; intro?: string }) {
  return (
    <div className="max-w-[42rem]">
      {eyebrow && <p className="text-[0.9375rem] font-semibold text-text-secondary">{eyebrow}</p>}
      <h2 id={id} className={cx("text-[1.625rem] leading-snug font-bold tracking-tight text-neutral md:text-[2.125rem]", eyebrow && "mt-2")}>
        {title}
      </h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-text-secondary md:text-[1.0625rem]">{intro}</p>}
    </div>
  );
}

function Features({ build }: { build: LandingBuild }) {
  return (
    <section id={SECTION_ID.features} aria-labelledby="features-title" className="scroll-mt-16 py-16 md:py-24">
      <div className={CONTAINER}>
        <SectionHeading id="features-title" eyebrow={LANDING_TEXT.featuresEyebrow} title={LANDING_TEXT.featuresTitle} intro={LANDING_TEXT.featuresIntro} />
        <ul className="mt-10 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col rounded-card bg-surface p-6 ring-1 ring-divider md:p-7">
              <SectionCardBody section={f} iconBox="bg-coral-tint" build={build} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionCardBody({ section, iconBox, build }: { section: LandingSection; iconBox: string; build: LandingBuild }) {
  const Icon = ICONS[section.icon];
  return (
    <>
      <span aria-hidden className={cx("flex size-10 items-center justify-center rounded-xl text-primary md:size-12 md:rounded-2xl", iconBox)}>
        <Icon className="size-5 md:size-6" strokeWidth={2} />
      </span>
      <h3 className="mt-4 text-[1.125rem] leading-snug font-bold text-neutral md:mt-5">{sectionTitle(section, build)}</h3>
      {section.body.map((p) => (
        <div key={p.text} className="mt-2">
          <p className="text-[0.9375rem] leading-relaxed text-text-secondary">{paragraphText(p, build)}</p>
          {p.requires === "clinicSearch" && !build.clinicSearchReady && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-[0.8125rem] font-semibold text-text-secondary ring-1 ring-divider">
              <Clock3 aria-hidden className="size-3.5 shrink-0" />
              {CLINICS_TEXT.notConfigured}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function Steps() {
  return (
    <section id={SECTION_ID.steps} aria-labelledby="steps-title" className="scroll-mt-16 border-y border-divider bg-surface py-16 md:py-24">
      <div className={CONTAINER}>
        <SectionHeading id="steps-title" title={LANDING_TEXT.stepsTitle} />
        <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-card bg-background p-6 md:p-7">
              {/* 순서는 <ol>이 읽어 준다 — 동그라미 숫자는 보이는 표시만 */}
              <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-coral-tint text-base font-bold text-neutral">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[1.125rem] leading-snug font-bold text-neutral md:mt-5">{s.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Principles({ build }: { build: LandingBuild }) {
  return (
    <section id={SECTION_ID.principles} aria-labelledby="principles-title" className="scroll-mt-16 py-16 md:py-24">
      <div className={CONTAINER}>
        <div className="rounded-[2rem] bg-coral-tint px-5 py-10 md:px-12 md:py-14">
          <SectionHeading id="principles-title" title={LANDING_TEXT.principlesTitle} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className="flex flex-col rounded-card bg-surface p-6">
                <SectionCardBody section={p} iconBox="bg-coral-tint" build={build} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FinalCta({ note }: { note: string }) {
  return (
    <section aria-labelledby="cta-title" className="pb-16 md:pb-24">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center rounded-[2rem] bg-neutral px-6 py-12 text-center md:py-16">
          <Logo className="size-16 rounded-2xl" />
          <h2 id="cta-title" className="mt-6 text-[1.625rem] leading-snug font-bold tracking-tight text-white md:text-[2.25rem]">
            {LANDING_TEXT.ctaTitle}
          </h2>
          <StartLink className="mt-8 inline-flex min-h-11 w-full max-w-[20rem] items-center justify-center rounded-button bg-white px-8 py-4 text-[1.0625rem] font-semibold text-neutral hover:bg-white/90 sm:w-auto sm:max-w-none" />
          {/* 시작 방법 안내 — 버튼 아래 작은 글씨. 앱을 쓰는 사람에게는 숨기되 자리는 남는다(버튼 아래라 빈 자리가 여백처럼 보인다). */}
          <StartNote text={note} className="mt-4 max-w-[42rem] text-[0.875rem] leading-relaxed text-white/80 md:text-[0.9375rem]" />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-divider bg-surface">
      <div className={cx(CONTAINER, "flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between md:gap-12")}>
        <div className="flex max-w-[42rem] flex-col gap-3">
          <p className="inline-flex items-center gap-2 text-base font-bold text-neutral">
            <Logo className="size-8 rounded-lg" />
            {LANDING_TEXT.brand}
          </p>
          <p className="text-[0.8125rem] leading-relaxed text-text-secondary">{content.disclaimers.home_footer}</p>
        </div>
        <div className="flex flex-col items-start gap-1 text-[0.875rem] md:items-end">
          {/* 개인정보처리방침 · 이용약관(초안 — features/terms) · 문의(방침의 이메일로 mailto — features/terms/contact.ts). 링크는 본문이 있을 때만. */}
          <div className="flex flex-wrap items-center gap-x-4 md:justify-end">
            <Link href={ROUTES.privacy} className={FOOTER_LINK_CLASS}>
              {LANDING_TEXT.privacy}
            </Link>
            {hasTermsText() ? (
              <Link href={ROUTES.terms} className={FOOTER_LINK_CLASS}>
                {TERMS_TEXT.navTitle}
              </Link>
            ) : null}
            {CONTACT_EMAIL !== null ? (
              <a href={mailtoHref(CONTACT_EMAIL)} className={FOOTER_LINK_CLASS}>
                {CONTACT_TEXT.label}
              </a>
            ) : null}
          </div>
          <p className="text-text-secondary">{LANDING_TEXT.copyright}</p>
        </div>
      </div>
    </footer>
  );
}

/** "산후 회복, 하루 1분 기록으로" → ["산후 회복,", "하루 1분 기록으로"]. 쉼표가 없으면 [전체, null]. */
export function splitAfterComma(text: string): [string, string | null] {
  const i = text.indexOf(", ");
  if (i < 0) return [text, null];
  return [text.slice(0, i + 1), text.slice(i + 2)];
}
