// 전화번호 표기·전화 링크 — 홈·가이드 문장 속 번호·가까운 산부인과가 같은 규칙(한 곳)을 쓴다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { telHref, toDomesticPhone } from "./phone";

describe("toDomesticPhone", () => {
  it("국제 형식 → 국내 표기", () => {
    expect(toDomesticPhone("+82 2-933-8828")).toBe("02-933-8828");
    expect(toDomesticPhone("+82 10-1234-5678")).toBe("010-1234-5678");
  });

  it("국내 표기는 그대로, 비면 null", () => {
    expect(toDomesticPhone("02-933-8828")).toBe("02-933-8828");
    expect(toDomesticPhone("")).toBeNull();
    expect(toDomesticPhone("   ")).toBeNull();
    expect(toDomesticPhone(undefined)).toBeNull();
  });
});

describe("telHref", () => {
  it("숫자만 남긴다 — 안전 연계 번호·병원 번호·국제 형식", () => {
    expect(telHref("02-933-8828")).toBe("tel:029338828");
    expect(telHref("+82 2-933-8828")).toBe("tel:029338828");
    expect(telHref("1577-0199")).toBe("tel:15770199");
    expect(telHref("109")).toBe("tel:109");
  });

  it('숫자가 없으면 null — "tel:"만 있는 링크를 만들지 않는다', () => {
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
    expect(telHref(undefined)).toBeNull();
    expect(telHref("---")).toBeNull();
  });

  it("구현은 한 곳 — 홈·가이드·병원 목록이 모두 이것을 쓰고, null이면 링크를 그리지 않는다", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    for (const file of ["../features/home/HomeCards.tsx", "../features/guide/PhoneLinks.tsx", "../features/clinics/clinicsView.ts"]) {
      expect(read(file), file).toContain('import { telHref } from "@/domain/phone";');
    }
    for (const file of ["../features/home/homeViewModel.ts", "../api/clinics.ts"]) {
      expect(read(file), file).not.toMatch(/export function telHref/);
    }
    expect(read("../features/home/HomeCards.tsx")).toContain("return href === null ? null : (");
    expect(read("../features/guide/PhoneLinks.tsx")).toContain("return href !== null ? (");
    expect(read("../features/clinics/ClinicRow.tsx")).toContain("row.telHref !== null");
  });
});
