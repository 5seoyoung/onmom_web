"use client";

// 프로필 탭 — iOS ProfileView.swift. 내 정보를 바로 보고, 나머지 기능으로 이동하는 허브.
// 순서: 큰 제목 → 머리(이름 · 산후 n일차 · n주차) → 내 정보 카드 → 기능 허브 7개(순서 고정).
// 저장소를 읽기 전(hydrated=false)에는 제목만 그린다 — 기본값(미설정 등)이 번쩍이지 않게.
// PC(넓은 화면, 컨테이너 쿼리): 42rem 이상이면 허브를 2열 타일로, 56rem 이상이면 왼쪽에 머리·내 정보, 오른쪽에 허브.
// 폰 기둥(최대 30rem)에서는 iOS처럼 한 줄 목록이다. PC 사이드바에도 같은 메뉴가 있지만 여기 허브는 폰의 입구라 그대로 둔다.

import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Hand,
  Leaf,
  MapPin,
  MessagesSquare,
  Pill,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { PAGE_FRAME } from "@/components/shell/pageFrame";
import { Card, SectionTitle, cx } from "@/components/ui";
import { useAppStore } from "@/store/useAppStore";
import {
  PROFILE_MENU,
  PROFILE_TEXT,
  maternityFlags,
  postpartumLine,
  profileInfoRows,
  type ProfileMenuItem,
  type ProfileMenuKey,
} from "./profileView";
import { useNowMs } from "./useNow";

// SF Symbol → lucide (ProfileView.swift:19-25)
const MENU_ICON: Record<ProfileMenuKey, LucideIcon> = {
  support: Hand, // hand.raised.fill
  lifestyle: Leaf, // leaf.fill
  substance: Pill, // pills.fill
  chat: MessagesSquare, // bubble.left.and.bubble.right.fill
  region: MapPin, // mappin.and.ellipse
  guide: BookOpen, // book.fill
  settings: Settings, // gearshape.fill
};

const INFO_HEADING_ID = "profile-info-heading";

export function ProfileScreen() {
  const { hydrated, state, displayName } = useAppStore();
  const nowMs = useNowMs();

  return (
    // VStack(spacing: md) · 좌우 lg · 위 sm — ProfileView.swift:32-44. PC 틀은 pageFrame(탭 화면)
    <main className={cx("@container flex flex-1 flex-col gap-4 px-6 pt-2 pb-10", PAGE_FRAME.wide)}>
      {/* .navigationTitle("프로필") — 큰 제목(34 bold). PC(lg)는 다른 화면의 제목(ScreenHeader 24 bold)과 같은 크기·같은 높이 */}
      <h1 className="pt-6 text-[2.125rem] leading-tight font-bold text-neutral lg:pt-2 lg:text-2xl lg:leading-8">{PROFILE_TEXT.title}</h1>

      {hydrated && nowMs !== null ? (
        <div className="flex flex-col gap-4 @4xl:grid @4xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @4xl:items-start @4xl:gap-6">
          <div className="flex flex-col gap-4">
            <ProfileHeader name={displayName} line={postpartumLine(state.profile.deliveryDate, new Date(nowMs))} />
            <InfoCard rows={profileInfoRows(state.profile)} flags={maternityFlags(state.maternity)} />
          </div>
          <ul className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @2xl:gap-3">
            {PROFILE_MENU.map((item) => (
              <li key={item.key}>
                <MenuRow item={item} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}

// 머리 — 아이콘 원 64(primary 15%) + 이름 20 bold + 산후 일차 13 (ProfileView.swift:52-68)
function ProfileHeader({ name, line }: { name: string; line: string | null }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <UserRound className="size-7.5 fill-primary text-primary" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xl font-bold text-neutral">{name}</p>
        {line ? <p className="text-[0.8125rem] text-text-secondary">{line}</p> : null}
      </div>
    </div>
  );
}

// 내 정보 — 행 사이 구분선, 값 15 semibold, 라벨 16 textSecondary (ProfileView.swift:72-102, 120-126)
function InfoCard({ rows, flags }: { rows: ReturnType<typeof profileInfoRows>; flags: string[] }) {
  return (
    <Card as="section" aria-labelledby={INFO_HEADING_ID} className="flex flex-col gap-2">
      <SectionTitle id={INFO_HEADING_ID}>{PROFILE_TEXT.infoTitle}</SectionTitle>
      <dl className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={`flex items-center justify-between gap-4 ${i > 0 ? "border-t border-divider pt-2" : ""}`}
          >
            <dt className="shrink-0 text-base text-text-secondary">{row.label}</dt>
            <dd className="min-w-0 text-right text-[0.9375rem] font-semibold text-text-primary">{row.value}</dd>
          </div>
        ))}
        {flags.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-divider pt-2">
            <dt className="text-base text-text-secondary">{PROFILE_TEXT.maternityFlags}</dt>
            <dd>
              {/* 칩 12 medium primary · coralTint 캡슐 · 간격 6 (ProfileView.swift:91-97) */}
              <ul className="flex flex-wrap gap-1.5">
                {flags.map((flag) => (
                  <li
                    key={flag}
                    className="rounded-full bg-coral-tint px-2.5 py-1.25 text-xs font-medium text-primary"
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

// 허브 행 — 아이콘 원 44(primary 12%) + 제목 16 semibold / 부제 13 + 오른쪽 chevron, 패딩 md, 표면 카드(그림자 없음)
// (ProfileView.swift:128-144)
function MenuRow({ item }: { item: ProfileMenuItem }) {
  const Icon = MENU_ICON[item.key];
  return (
    // h-full — 2열 타일에서 한 줄의 높이를 맞춘다(한 줄 목록에서는 차이 없음)
    <Link href={item.href} className="flex h-full min-h-11 items-center gap-4 rounded-card bg-surface p-4">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold text-text-primary">{item.title}</span>
        <span className="text-[0.8125rem] text-text-secondary">{item.subtitle}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-text-subtle/40" />
    </Link>
  );
}
