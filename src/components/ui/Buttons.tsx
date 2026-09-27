import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";

// 링크(<Link>)를 버튼 모양으로 쓸 때도 같은 클래스를 쓴다.
/** 전폭 · neutral 배경 · 흰 글씨 17 semibold · 라운드 14 · 비활성 30%(Components.swift:3-21) */
export const primaryButtonClass =
  "flex min-h-11 w-full items-center justify-center rounded-button bg-neutral px-4 py-4 text-center text-[1.0625rem] font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral/30";

/** 전폭 · 투명 · neutral 글씨 · divider 1.5 테두리(Components.swift:23-41) */
export const secondaryButtonClass =
  "flex min-h-11 w-full items-center justify-center rounded-button border-[1.5px] border-divider bg-transparent px-4 py-4 text-center text-[1.0625rem] font-semibold text-neutral disabled:cursor-not-allowed disabled:opacity-50";

export type ButtonProps = ComponentPropsWithoutRef<"button">;

export function PrimaryButton({ className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(primaryButtonClass, className)} {...rest} />;
}

export function SecondaryButton({ className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(secondaryButtonClass, className)} {...rest} />;
}
