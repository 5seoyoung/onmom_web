import { createElement } from "react";
import { cx } from "@/components/ui";
import { sfIcon } from "./sfIcons";

/** 카드 머리의 원형 아이콘 자리 — 장식이라 스크린리더에서 숨긴다. */
export function SfIcon({ name, className }: { name: string; className?: string }) {
  const { Icon, filled } = sfIcon(name);
  return createElement(Icon, { "aria-hidden": true, className: cx("size-5", filled && "fill-current", className) });
}
