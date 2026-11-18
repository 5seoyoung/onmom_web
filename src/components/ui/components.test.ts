// 컴포넌트 마크업 검사 — 접근성 속성과 문구가 원문대로 나오는지(브라우저 없이 서버 렌더로 확인).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { House } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  DisclaimerBanner,
  EvidenceChip,
  EvidenceChipList,
  MeasurementField,
  NrsSlider,
  PrimaryButton,
  RedFlagCard,
  SectionTitle,
  SelectableGroup,
  SelectableRow,
  SourceDisclosure,
  StatusBadge,
  StepIndicator,
  Toggle,
} from "./index";
import type { SelectableGroupProps } from "./index";

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const visibleText = (html: string) =>
  html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();

describe("EvidenceChip", () => {
  it("출처 칩: 접두를 떼고, 아이콘 + primary 스타일 + 스크린리더용 '출처'", () => {
    const html = render(h(EvidenceChip, { token: "src:임산부수첩 2023" }));
    expect(visibleText(html)).toBe("임산부수첩 2023");
    expect(html).toContain("text-primary-text"); // 글자는 AA 글자 전용 토큰(globals.css), 배경은 원색 10%
    expect(html).toContain("bg-primary/10");
    expect(html).toContain("<svg");
    expect(html).toContain('<span class="sr-only">출처: </span>');
  });

  it("근거 설명 칩: 아이콘 없이 textSecondary + background", () => {
    const html = render(h(EvidenceChip, { token: "EPDS" }));
    expect(visibleText(html)).toBe("EPDS");
    expect(html).toContain("text-text-secondary");
    expect(html).toContain("bg-background");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("출처");
  });

  it("inverse(레드플래그 카드 안): 채움 없는 흰 테두리 + 흰 글씨, 아이콘 없음", () => {
    const html = render(h(EvidenceChip, { token: "src:ACOG-736", tone: "inverse" }));
    expect(visibleText(html)).toBe("ACOG-736");
    expect(html).toContain("inset-ring-white/60");
    expect(html).not.toContain("bg-white/22");
    expect(html).not.toContain("<svg");
  });

  it("빈 토큰 배열이면 아무것도 그리지 않는다", () => {
    expect(render(h(EvidenceChipList, { tokens: [] }))).toBe("");
  });

  it("칩 목록은 목록(ul/li)으로 나온다", () => {
    const html = render(h(EvidenceChipList, { tokens: ["a", "b"] }));
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).not.toContain("<details");
  });
});

/** <details>…</details> 밖 — 접어도 늘 보이는 마크업 */
const outsideDetails = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, "");

describe("EvidenceChipList — 설명 칩은 보이고, 출처는 '출처 보기' 하나로 접는다(2026-11-15 산부인과 전문의 화면 검토)", () => {
  const tokens = ["오로 증가", "src:임산부수첩 2023", "src:NICE NG194", "src:임산부수첩 2023"];

  it("설명 칩은 늘 보이고, 출처 칩은 접힌 <details> 안에만(중복 없이)", () => {
    const html = render(h(EvidenceChipList, { tokens }));
    const always = outsideDetails(html);
    expect(always).toContain(">오로 증가</span>");
    expect(always).not.toContain("임산부수첩");
    expect(always).not.toContain("bg-primary/10"); // 코랄 출처 칩이 화면에 늘어서지 않는다
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html.match(/<span class="sr-only">출처: <\/span>임산부수첩 2023/g)).toHaveLength(1);
    expect(html).toContain('<span class="sr-only">출처: </span>NICE NG194');
    expect(html).not.toContain("src:");
  });

  it("출처만 있으면 칩 줄 없이 '출처 보기'만", () => {
    const html = render(h(EvidenceChipList, { tokens: ["src:FDA"] }));
    expect(html).not.toContain('class="flex flex-wrap');
    expect(html).toContain(">출처 보기<");
  });
});

describe("SourceDisclosure", () => {
  it("출처가 없으면 아무것도 그리지 않는다", () => {
    expect(render(h(SourceDisclosure, { sources: [] }))).toBe("");
  });

  it("작은 보조 글씨 단추(summary) — 누르는 자리 44px, 낭독 이름 '출처 보기', 아이콘은 장식", () => {
    const html = render(h(SourceDisclosure, { sources: ["A", "B"] }));
    const summary = /<summary class="([^"]*)">([\s\S]*?)<\/summary>/.exec(html);
    expect(summary).not.toBeNull();
    expect(summary![1]).toContain("min-h-11");
    expect(summary![1]).toContain("text-xs");
    expect(summary![1]).toContain("text-text-secondary");
    expect(visibleText(summary![2])).toBe("출처 보기");
    for (const svg of summary![2].match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html.match(/<span class="sr-only">출처: <\/span>/g)).toHaveLength(2);
  });

  it("inverse(짙은 코랄 카드 위): 단추·목록 모두 흰 글씨", () => {
    const html = render(h(SourceDisclosure, { sources: ["A"], tone: "inverse" }));
    expect(html).not.toContain("text-text-secondary");
    expect(html.match(/text-white/g)).toHaveLength(2);
  });
});

describe("StatusBadge", () => {
  it("색만이 아니라 글자로 상태를 알린다", () => {
    expect(visibleText(render(h(StatusBadge, { status: "normal" })))).toBe("해당 없음");
    expect(visibleText(render(h(StatusBadge, { status: "watch" })))).toBe("살펴볼 신호");
    expect(visibleText(render(h(StatusBadge, { status: "alert" })))).toBe("병원 확인 신호");
  });

  it("빈 라벨·공백 라벨이면 기본 라벨로 — 빈 색 캡슐이 되지 않는다", () => {
    expect(visibleText(render(h(StatusBadge, { status: "alert", label: "" })))).toBe("병원 확인 신호");
    expect(visibleText(render(h(StatusBadge, { status: "normal", label: "   ", variant: "exercise" })))).toBe("해당 없음");
    expect(visibleText(render(h(StatusBadge, { status: "watch", label: "라벨", variant: "exercise" })))).toBe("라벨");
  });

  it("지표 배지 12%, 운동 배지 15% 배경", () => {
    expect(render(h(StatusBadge, { status: "alert" }))).toContain("bg-state-alert/12");
    expect(render(h(StatusBadge, { status: "watch", label: "라벨", variant: "exercise" }))).toContain(
      "bg-state-watch/15",
    );
  });

  it("글자는 AA 글자 전용 토큰(state-*-text), 원색 글자 클래스는 없다(CPO 12 기본값)", () => {
    for (const status of ["normal", "watch", "alert"] as const) {
      const html = render(h(StatusBadge, { status }));
      expect(html).toContain(`text-state-${status}-text`);
      expect(html).not.toMatch(new RegExp(`text-state-${status}[\\s"]`));
    }
  });
});

describe("SectionTitle", () => {
  it("textSecondary(검수 #61: textSubtle 아님)", () => {
    const html = render(h(SectionTitle, null, "제목"));
    expect(html).toContain("text-text-secondary");
    expect(html).not.toContain("text-subtle");
  });
});

describe("DisclaimerBanner", () => {
  it("두 줄 — 식약처 웰니스 판단기준 권고 주의 문구 + 참고용(2026-11-13, 원래 AnalyzeComponents.swift:124·127)", () => {
    const html = render(h(DisclaimerBanner));
    expect(html).toContain('role="note"');
    expect(html).toContain(">온맘은 의료기기가 아니므로 질병 유무를 판단할 수 없으며, 질병 유무 판단을 위해서는 의사의 검진이 필요합니다.</p>");
    expect(html).toContain(">제공되는 정보는 참고용입니다.</p>");
  });
});

describe("RedFlagCard", () => {
  it("심각도 라벨 원문 + 문구 + 칩(접두 제거)", () => {
    const html = render(h(RedFlagCard, { severity: "immediate", message: "문구", chips: ["근거", "src:출처명"] }));
    expect(html).toContain(">즉시 내원</p>");
    expect(html).toContain(">문구</p>");
    expect(html).toContain("bg-state-alert-strong");
    expect(html).not.toContain("src:");
    expect(html).not.toContain('role="alert"');
  });

  it("설명 칩은 흰 테두리 칩으로 보이고, 출처는 흰 글씨 '출처 보기' 하나로 접힌다", () => {
    const html = render(h(RedFlagCard, { severity: "immediate", message: "문구", chips: ["근거", "src:출처1", "src:출처2"] }));
    expect(outsideDetails(html)).toContain('inset-ring-white/60">근거</span>');
    expect(outsideDetails(html)).not.toContain("출처1");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toMatch(/<summary class="[^"]*text-white[^"]*">/);
    expect(html).toContain('<span class="sr-only">출처: </span>출처2');
  });

  it("announce면 role=alert", () => {
    expect(render(h(RedFlagCard, { severity: "urgent", message: "m", announce: true }))).toContain('role="alert"');
  });

  it("모르는 심각도 코드는 라벨을 빼고 원시 코드를 내지 않는다", () => {
    const html = render(h(RedFlagCard, { severity: "routine", message: "문구" }));
    expect(html).not.toContain("routine");
    expect(visibleText(html)).toBe("문구");
  });

  it("rules-1.2 등급 라벨 · 문구 아래·칩 위에 행동(전화 링크 등)을 둘 수 있다", () => {
    expect(render(h(RedFlagCard, { severity: "emergency", message: "m" }))).toContain(">119 연락</p>");
    expect(render(h(RedFlagCard, { severity: "crisis", message: "m" }))).toContain(">위기 상담 연락</p>");
    const html = render(h(RedFlagCard, { severity: "emergency", message: "문구", chips: ["src:출처명"] }, h("a", { href: "tel:119" }, "119")));
    expect(html.indexOf(">문구</p>")).toBeLessThan(html.indexOf('href="tel:119"'));
    expect(html.indexOf('href="tel:119"')).toBeLessThan(html.indexOf("출처명"));
  });
});

describe("PrimaryButton", () => {
  it("기본 type=button, disabled 전달", () => {
    const html = render(h(PrimaryButton, { disabled: true }, "다음"));
    expect(html).toContain('type="button"');
    expect(html).toContain("disabled");
  });
});

describe("SelectableRow", () => {
  it("실제 라디오 입력 + 라벨", () => {
    const html = render(h(SelectableRow, { icon: House, title: "제목", name: "g", value: "a", defaultChecked: true }));
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="g"');
    expect(html).toContain('value="a"');
    expect(html).toMatch(/checked=""/);
    expect(html.startsWith("<label")).toBe(true);
  });

  it("선택 모양은 이 행의 라디오에만 묶인다 — 바깥 `group` 안에서도 번지지 않는다", () => {
    const html = render(
      h(
        "div",
        { className: "group" },
        h(SelectableRow, { icon: House, title: "a", name: "g", value: "a", defaultChecked: true }),
        h(SelectableRow, { icon: House, title: "b", name: "g", value: "b" }),
      ),
    );
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(" "));
    // 이름 없는 group-* 변형은 바깥의 어떤 .group(선택된 입력을 가진)에도 반응하므로 쓰지 않는다.
    expect(classes.filter((c) => /^group-[a-z-]+:/.test(c))).toEqual([]);
    // 행 자신이 이름 붙은 그룹이고, 선택 표시 변형은 모두 그 이름을 가리킨다.
    expect(classes.filter((c) => c === "group/selectable-row")).toHaveLength(2);
    const stateClasses = classes.filter((c) => c.startsWith("group-has-checked"));
    expect(stateClasses.length).toBeGreaterThan(0);
    for (const c of stateClasses) expect(c.startsWith("group-has-checked/selectable-row:")).toBe(true);
  });
});

describe("SelectableGroup", () => {
  it("radiogroup + 이름(label 또는 labelledBy)", () => {
    expect(render(h(SelectableGroup, { label: "묶음", children: null }))).toContain('aria-label="묶음"');
    const byId = render(h(SelectableGroup, { labelledBy: "title-id", children: null }));
    expect(byId).toContain('role="radiogroup"');
    expect(byId).toContain('aria-labelledby="title-id"');
    expect(byId).not.toContain("aria-label=");
  });

  it("이름 없는 묶음은 타입 오류(tsc가 확인)", () => {
    // @ts-expect-error — label/labelledBy 중 하나는 있어야 한다
    const noName: SelectableGroupProps = { children: null };
    // @ts-expect-error — 둘 다 주면 안 된다
    const both: SelectableGroupProps = { children: null, label: "a", labelledBy: "b" };
    expect([noName, both]).toHaveLength(2);
  });
});

describe("Toggle", () => {
  it("button role=switch + aria-checked + 라벨 연결", () => {
    const html = render(h(Toggle, { label: "라벨", description: "설명", id: "t1" }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('for="t1"');
    expect(html).toContain('aria-describedby="t1-description"');
    expect(html).toContain('id="t1-description"');
  });

  it("켜짐 색: 기본 primary, alert는 stateAlert", () => {
    expect(render(h(Toggle, { label: "l", defaultChecked: true }))).toContain("bg-primary");
    const alert = render(h(Toggle, { label: "l", checked: true, variant: "alert" }));
    expect(alert).toContain('aria-checked="true"');
    expect(alert).toContain("bg-state-alert");
  });

  it('descriptionWhen="checked": 꺼져 있으면 설명도 aria-describedby도 없고, 켜면 라벨 아래 설명 + aria-describedby', () => {
    const off = render(h(Toggle, { label: "라벨", description: "기준", descriptionWhen: "checked", id: "t2" }));
    expect(off).not.toContain("기준");
    expect(off).not.toContain("aria-describedby");
    expect(off).not.toContain('id="t2-description"');
    const on = render(h(Toggle, { label: "라벨", description: "기준", descriptionWhen: "checked", checked: true, id: "t2" }));
    expect(on).toContain('aria-describedby="t2-description"');
    expect(on).toContain('>라벨</label><p id="t2-description" class="mt-0.5 text-[0.8125rem] text-text-secondary">기준</p>');
  });

  it('descriptionWhen="checked"는 위 맞춤 — 라벨 첫 줄을 스위치 가운데에 두고, 켜서 설명이 생겨도 스위치·라벨 자리가 그대로', () => {
    for (const checked of [false, true]) {
      const html = render(h(Toggle, { label: "l", description: "d", descriptionWhen: "checked", checked }));
      expect(html).toContain('<div class="flex w-full items-start justify-between gap-4"><div class="min-w-0 flex-1 pt-2.5">');
    }
    // 기본(늘 보임)은 예전 그대로 가운데 맞춤
    expect(render(h(Toggle, { label: "l", description: "d" }))).toContain(
      '<div class="flex w-full items-center justify-between gap-4"><div class="min-w-0 flex-1">',
    );
  });

  it("고대비 모드 대비: 트랙 윤곽선 + 손잡이 채움(배경·그림자가 지워져도 보이게)", () => {
    const html = render(h(Toggle, { label: "l" }));
    expect(html).toContain("forced-colors:outline-[CanvasText]");
    expect(html).toContain("forced-colors:bg-[CanvasText]");
  });
});

describe("NrsSlider", () => {
  it('0~10 range + 값 "n/10"', () => {
    const html = render(h(NrsSlider, { label: "통증", defaultValue: 3, id: "n" }));
    expect(html).toContain('type="range"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="10"');
    expect(html).toContain('step="1"');
    expect(html).toContain('aria-valuetext="3/10"');
  });

  it("scaleLabels: 슬라이더 아래 양 끝에 0·10과 뜻 — 슬라이더의 aria-describedby(없으면 둘 다 없음)", () => {
    const html = render(h(NrsSlider, { label: "통증", id: "n", scaleLabels: { min: "안 아파요", max: "제일 아파요" } }));
    expect(/<input[^>]*type="range"[^>]*>/.exec(html)?.[0]).toContain('aria-describedby="n-min n-max"');
    expect(html).toContain('<p id="n-min" class="flex flex-col items-start"><span>0</span><span>안 아파요</span></p>');
    expect(html).toContain('<p id="n-max" class="flex flex-col items-end text-end"><span>10</span><span>제일 아파요</span></p>');
    expect(html).toContain('aria-valuetext="0/10"'); // 값 글자는 그대로 "n/10"
    const plain = render(h(NrsSlider, { label: "통증", id: "n" }));
    expect(plain).not.toContain("aria-describedby");
    expect(plain).not.toContain('id="n-min"');
  });

  it('보이는 "n/10"은 aria-hidden 글자 — live region(<output>)이 아니라 한 번만 읽힌다', () => {
    const html = render(h(NrsSlider, { label: "통증", defaultValue: 3, id: "n" }));
    expect(html).not.toContain("<output");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>3\/10<\/span>/);
    expect(html).not.toContain("aria-live");
  });
});

describe("MeasurementField", () => {
  it("0이면 빈 값 + placeholder '입력'", () => {
    const html = render(h(MeasurementField, { label: "키(cm)", value: 0 }));
    expect(html).toContain('placeholder="입력"');
    expect(html).toContain('value=""');
    expect(html).toContain('inputMode="decimal"');
  });

  it("값이 있으면 숫자", () => {
    expect(render(h(MeasurementField, { label: "키(cm)", defaultValue: 160 }))).toContain('value="160"');
  });
});

describe("StepIndicator", () => {
  it("progressbar로 현재 단계를 알린다(0부터 시작하는 current)", () => {
    const html = render(h(StepIndicator, { current: 1, total: 4, label: "단계" }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuetext="2/4"');
    expect(html.match(/w-5 bg-primary/g)).toHaveLength(1);
  });

  it("고대비 모드 대비: 현재 단계는 시스템 색으로 채우고, 나머지는 테두리", () => {
    const html = render(h(StepIndicator, { current: 0, total: 3, label: "단계" }));
    expect(html.match(/forced-colors:bg-\[CanvasText\]/g)).toHaveLength(1);
    expect(html.match(/forced-colors:border-\[CanvasText\]/g)).toHaveLength(2);
  });

  it("범위를 벗어난 current는 끝으로 맞춘다", () => {
    expect(render(h(StepIndicator, { current: 9, total: 4, label: "단계" }))).toContain('aria-valuenow="4"');
  });
});
