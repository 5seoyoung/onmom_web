// content.json의 `icon_sf`(iOS SF Symbols 이름) → lucide 아이콘.
// 회복 가이드·생활 권고 카드가 함께 쓴다. 다른 화면에도 같은 매핑이 필요하면 공용(components/ui)으로 옮길 후보다.
// 모르는 이름은 중립 아이콘으로 그린다(아이콘은 장식이라 aria-hidden — 의미는 제목 글자가 전한다).
import {
  Bandage,
  BedDouble,
  BookOpen,
  Brain,
  CalendarDays,
  Droplet,
  FileHeart,
  PersonStanding,
  Stethoscope,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export interface SfIconSpec {
  Icon: LucideIcon;
  /** SF의 `.fill` 변형처럼 속을 채워 그릴지(모양이 닫힌 아이콘만) */
  filled: boolean;
}

const SF_ICONS: Readonly<Record<string, SfIconSpec>> = {
  calendar: { Icon: CalendarDays, filled: false },
  "drop.fill": { Icon: Droplet, filled: true },
  "bandage.fill": { Icon: Bandage, filled: false },
  // lucide에는 스트레칭·걷는 사람 모양이 없어 서 있는 사람으로 대신한다.
  "figure.cooldown": { Icon: PersonStanding, filled: false },
  "figure.walk": { Icon: PersonStanding, filled: false },
  "heart.text.square": { Icon: FileHeart, filled: false },
  "fork.knife": { Icon: Utensils, filled: false },
  "brain.head.profile": { Icon: Brain, filled: false },
  stethoscope: { Icon: Stethoscope, filled: false },
  "bed.double.fill": { Icon: BedDouble, filled: false },
};

export const SF_ICON_FALLBACK: SfIconSpec = { Icon: BookOpen, filled: false };

export function hasSfIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SF_ICONS, name);
}

export function sfIcon(name: string): SfIconSpec {
  return hasSfIcon(name) ? SF_ICONS[name] : SF_ICON_FALLBACK;
}
