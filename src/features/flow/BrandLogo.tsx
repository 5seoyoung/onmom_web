import Image from "next/image";
import { cx } from "@/components/ui/cx";
import brandLogo from "./brand-logo.png";

// iOS Assets.xcassets/BrandLogo(240×240)와 같은 그림. 장식이라 스크린리더에서 숨긴다(LoginView.swift:23).
// 크기·모서리: 로그인 72 / 18(LoginView.swift:21-22), 온보딩 시작 96 / 24(OnboardingFlowView.swift:106-107).
const SIZES = {
  login: { px: 72, className: "size-18 rounded-[1.125rem]" },
  welcome: { px: 96, className: "size-24 rounded-3xl" },
} as const;

export function BrandLogo({ size }: { size: keyof typeof SIZES }) {
  const { px, className } = SIZES[size];
  return <Image src={brandLogo} alt="" aria-hidden width={px} height={px} loading="eager" className={cx("shrink-0 object-contain", className)} />;
}
