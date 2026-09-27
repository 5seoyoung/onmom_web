// className 이어 붙이기. 조건부 클래스(false·null·undefined)는 빠진다.
// tailwind-merge를 쓰지 않으므로, 같은 속성(패딩·배경 등)을 className으로 덮어쓰지 말고 간격·배치 보조용으로만 쓴다.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
