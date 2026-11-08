// content.json 문구 틀 — "{이름}" 자리에 계산값을 넣는다(예: "통증 NRS {nrs}/10", "BMI {bmi}").
// 틀은 쓰는 모듈을 불러올 때 확인한다: 이름마다 자리가 꼭 하나, 모르는 자리는 없어야 한다. 어긋나면 모듈 로드(정적 빌드) 때
// 실패한다 — 임상 회신으로 JSON을 바꿨을 때 자리가 빠진 글자가 조용히 화면에 나가지 않게(DEV_NOTES §3 content.json 형식 검사).

const SLOT = /\{([^{}]*)\}/g;

function slotsOf(text: string): string[] {
  return [...text.matchAll(SLOT)].map((m) => m[1]);
}

/** 틀을 확인하고 채우는 함수를 돌려준다. `path`는 오류 메시지에 쓰는 content.json 위치다. */
export function compileTemplate<K extends string>(
  path: string,
  text: unknown,
  names: readonly K[],
): (values: Readonly<Record<K, string | number>>) => string {
  const slots = typeof text === "string" ? slotsOf(text) : null;
  const ok =
    slots !== null &&
    names.every((n) => slots.filter((s) => s === n).length === 1) &&
    slots.every((s) => (names as readonly string[]).includes(s));
  if (!ok) {
    const want = names.length > 0 ? names.map((n) => `{${n}}`).join(", ") + " 자리가 하나씩만" : "자리표시가 없어야";
    throw new Error(`content.json ${path} 형식이 바뀌었습니다: ${want} 합니다 (src/content/template.ts)`);
  }
  const template = text as string;
  return (values) => template.replace(SLOT, (_, name: string) => String(values[name as K]));
}

/** 자리표시가 없는 고정 글자인지 확인하고 그대로 돌려준다. */
export function plainText(path: string, text: unknown): string {
  return compileTemplate(path, text, [])({});
}
