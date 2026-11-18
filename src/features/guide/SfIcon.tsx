import { createElement } from "react";
import { cx } from "@/components/ui";
import { sfIcon } from "./sfIcons";

/**
 * 카드 머리의 원형 아이콘 자리 — 장식이라 스크린리더에서 숨긴다.
 * className은 크기까지 정한다(기본 size-5) — cx는 같은 속성을 덮어쓰지 않으므로 크기를 바꿀 때는 크기 클래스를 통째로 넘긴다.
 */
export function SfIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const { Icon, filled } = sfIcon(name);
  return createElement(Icon, { "aria-hidden": true, className: cx(className, filled && "fill-current") });
}
