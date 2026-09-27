// 상태 비교용 JSON — 객체 키를 정렬해서 만든다(키 순서가 다른 같은 상태를 같다고 보려고).
// 동기화가 "서버에 이미 있는가·합친 결과가 달라졌는가"를 판단할 때만 쓴다. 저장 형식은 아니다.

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = sortKeys(child);
    }
    return out;
  }
  return v;
}
