import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";

type CardElement = "div" | "section" | "article";

export interface CardProps extends ComponentPropsWithoutRef<"div"> {
  as?: CardElement;
}

// 흰 표면 · 라운드 20 · 패딩 20 · 검정 4% 그림자(Components.swift:89-102).
// 06 §2의 "패딩 16~24 / 그림자 없음"은 오기(검수 #61) — Swift 값을 따른다.
export function Card({ as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx("w-full rounded-card bg-surface p-5 shadow-[0_0.125rem_1rem_rgb(0_0_0/0.04)]", className)}
      {...rest}
    />
  );
}

type SectionTitleElement = "h2" | "h3" | "p" | "span" | "legend";

export interface SectionTitleProps extends ComponentPropsWithoutRef<"h2"> {
  as?: SectionTitleElement;
}

// 카드 안 소제목 — 15 semibold textSecondary(Components.swift:105-113).
// 06 §4의 textSubtle은 오기(검수 #61).
export function SectionTitle({ as: Tag = "h2", className, ...rest }: SectionTitleProps) {
  return <Tag className={cx("block w-full text-[0.9375rem] font-semibold text-text-secondary", className)} {...rest} />;
}
