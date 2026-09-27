// 새 기록 id(UUID v4) — 브라우저 계층에서만 쓴다. 순수 함수(state·decode)는 id를 주입받는다.

export function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // randomUUID는 보안 컨텍스트(https·localhost)에만 있다 — 폰에서 http LAN 주소로 개발할 때를 위한 대체.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
