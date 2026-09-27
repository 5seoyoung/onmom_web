import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegionScreen } from "./RegionScreen";
import { REGION_TEXT } from "./regionText";

// iOS 원본(web/)은 공개 저장소에 없다 — 로컬에 있을 때만 Swift 원문과 대조하고, CI에서는 건너뛴다.
const SWIFT_PATH = fileURLToPath(new URL("../../../web/reference/swift/RegionResourcesView.swift", import.meta.url));

describe("지역 연계", () => {
  it.skipIf(!existsSync(SWIFT_PATH))("제목은 Swift 원문", () => {
    const source = readFileSync(SWIFT_PATH, "utf8");
    expect(source).toContain(`.navigationTitle("${REGION_TEXT.title}")`);
  });

  it("저장소를 읽기 전: 머리(뒤로 → 프로필)만, 동네 입력은 그리지 않는다", () => {
    const html = renderToStaticMarkup(h(RegionScreen));
    expect(html).toContain(">지역 연계</h1>");
    // 끝 "/"는 빌드 때 trailingSlash가 붙인다(테스트는 Next 런타임 밖)
    expect(html).toMatch(/href="\/profile\/?"/);
    expect(html).not.toContain("<input");
  });
});
