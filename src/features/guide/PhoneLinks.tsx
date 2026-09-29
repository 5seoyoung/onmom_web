// 문장 속 전화번호를 눌러서 걸 수 있는 tel: 링크로 — 회복 가이드·생활 권고·지원사업·AI 상담의 앱 안내가 함께 쓴다.
// 근거: web/07 §5 "안전 연계 번호 (변경 금지, 전화 링크로)" — 1577-0199 · 109 · 119 · 02-2276-2276 · 1350.
// 글자는 그대로 두고(번호 표기·앞뒤 문장 변경 없음) 번호만 링크가 된다. 번호가 하이픈에서 줄바뀌지 않게 한 덩어리로 묶는다.
// 어느 글자를 번호로 보는지는 guideContent.ts splitPhoneNumbers — 하이픈 번호와 안전 연계 짧은 번호(109·119·1350)만.
// 접근성 이름은 "{번호}에 전화 걸기"(원문 패턴 NearbyClinicsView.swift:128). 데스크톱 브라우저에서 tel:이 아무 일도 하지 않을 수
// 있는 점은 DEV_NOTES §3 CPO 19(표시 방식 결정 대기) — 그동안 링크는 밑줄로만 표시하고 문장은 바꾸지 않는다.
// 서버 컴포넌트(회복 가이드·생활 권고)에서도 쓰이므로 훅·"use client"가 없다.
// AI 답(신뢰할 수 없는 값)에는 쓰지 않는다 — 지어낸 번호가 눌리는 링크가 되지 않게(ChatScreen은 앱 안내 말풍선에만 쓴다).

import { cx } from "@/components/ui";
import { telHref } from "@/features/home/homeViewModel";
import { phoneCallLabel, splitPhoneNumbers } from "./guideContent";

export interface PhoneLinksProps {
  text: string;
  /** 링크 색 — 기본은 글자용 코랄(primary-text, AA 4.5:1 — docs/ACCESSIBILITY.md §4). 붉은 카드처럼 어두운 배경에서는 흰색 등으로 바꾼다 */
  linkClassName?: string;
  /**
   * false면 링크를 걸지 않고 번호를 한 줄로 묶기만 한다 — 이미 통째로 링크인 행 안(지원사업의 전화·페이지 행)에서 링크를 겹치지 않게.
   * 기본 true.
   */
  link?: boolean;
}

export function PhoneLinks({ text, linkClassName = "text-primary-text", link = true }: PhoneLinksProps) {
  return (
    <span>
      {splitPhoneNumbers(text).map((seg, i) =>
        !seg.phone ? (
          seg.text
        ) : link ? (
          <a
            key={i}
            href={telHref(seg.text)}
            aria-label={phoneCallLabel(seg.text)}
            className={cx("whitespace-nowrap rounded-xs underline underline-offset-2", linkClassName)}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i} className="whitespace-nowrap">
            {seg.text}
          </span>
        ),
      )}
    </span>
  );
}
