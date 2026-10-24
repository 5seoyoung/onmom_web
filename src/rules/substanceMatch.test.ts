// 약물·음식 표의 낱말 단위 별칭 맞추기(substanceMatch.ts) — 규칙마다 작은 표로 시험한다. content.json 표 전체의 회귀 시험은 substance.test.ts.
import { describe, expect, it } from "vitest";
import { createSubstanceMatcher, type SubstanceMatch } from "./substanceMatch";

interface TestRow {
  id: string;
  aliases: string[];
}

const ROWS: TestRow[] = [
  { id: "acetaminophen", aliases: ["타이레놀", "아세트아미노펜", "acetaminophen"] },
  { id: "antibiotic", aliases: ["아목시실린", "항생제"] },
  { id: "supplement", aliases: ["철분", "비타민", "영양제", "종합비타민"] },
  { id: "herbal", aliases: ["한약", "보약"] },
  { id: "ginseng", aliases: ["홍삼", "인삼"] },
  { id: "coffee", aliases: ["카페인", "커피", "caffeine"] },
  { id: "tea", aliases: ["녹차", "홍차", "티", "tea"] },
  { id: "energy", aliases: ["에너지드링크", "콜라", "카페인음료"] },
  { id: "alcohol", aliases: ["술", "맥주", "codeine"] },
  { id: "smoking", aliases: ["담배"] },
  { id: "fish", aliases: ["참치", "생선"] },
  { id: "raw", aliases: ["회", "생선회", "초밥"] },
  { id: "cold", aliases: ["감기약", "종합감기약"] },
  { id: "spicy", aliases: ["매운음식", "매운", "마늘"] },
];

const match = createSubstanceMatcher(ROWS);
/** 맞은 행 id, 맞춤 없음이면 null */
const rowOf = (q: string) => {
  const m = match(q);
  return m.kind === "match" ? m.row.id : null;
};

describe("규칙 1 — 별칭 앞은 입력의 처음이거나 띄어쓰기·문장부호", () => {
  it("다른 낱말의 뒤쪽에 숨은 별칭은 맞지 않는다", () => {
    for (const q of ["수술", "수술 후 진통제", "기술", "미술", "예술", "육회", "동창회", "파티", "허브티", "루이보스티", "전자담배", "디카페인", "생맥주"]) {
      expect(rowOf(q), q).toBeNull();
    }
  });

  it("처음·띄어쓰기·문장부호 뒤면 맞는다", () => {
    expect(rowOf("술")).toBe("alcohol");
    expect(rowOf("수유 중에 술")).toBe("alcohol");
    expect(rowOf("(술)")).toBe("alcohol");
    expect(rowOf("·술")).toBe("alcohol");
    expect(rowOf("ㅠㅠ술")).toBe("alcohol"); // 호환 자모는 낱말로 보지 않는다
  });
});

describe("규칙 2 — 별칭 뒤는 끝·띄어쓰기·문장부호·허용한 꼬리", () => {
  it("낱말이 더 이어지면 맞지 않는다", () => {
    for (const q of ["콜라겐", "커피우유", "커피믹스", "맥주효모", "녹차라떼", "참치김밥", "마늘주사", "인삼주", "철분주사", "항생제연고"]) {
      expect(rowOf(q), q).toBeNull();
    }
  });

  it("토씨·어미·양이 붙거나, 끝·문장부호면 맞는다", () => {
    for (const q of ["커피", "커피는요", "커피도", "커피?", "커피!!", "'커피'", "커피ㅋㅋ", "커피마셔도되나요", "커피 마셔도 돼요?", "커피한잔", "커피 두 잔"]) {
      expect(rowOf(q), q).toBe("coffee");
    }
  });
});

describe("규칙 3 — 한 글자 별칭(술·회·티)은 꼬리를 좁게 받는다", () => {
  it("한 글자 뒤에 붙어 다른 낱말이 되는 꼬리는 받지 않는다", () => {
    for (const q of ["회의", "회의 중", "회로", "회고", "회복", "회복용", "회복에 좋은 차", "회사", "회식", "회음부 연고", "회충약", "티나요", "티셔츠", "티슈", "티비", "술래", "술집", "술안주"]) {
      expect(rowOf(q), q).toBeNull();
    }
  });

  it("기본 토씨·먹어도·마셔도·양은 받는다", () => {
    for (const q of ["회", "회는", "회도 먹어도 되나요", "회먹어도", "회랑 초밥"]) expect(rowOf(q), q).toBe("raw");
    for (const q of ["술은 언제부터 마셔도 되나요", "술이랑", "술한잔", "술마셔도돼요", "술 한 잔"]) expect(rowOf(q), q).toBe("alcohol");
    for (const q of ["티는", "티 한 잔"]) expect(rowOf(q), q).toBe("tea");
  });
});

describe("규칙 4 — 두 글자 이상 별칭은 꼬리를 더 받는다", () => {
  it("의·에·로·나·거·것과 같은 품목의 다른 모양(제·정·액·시럽·캡슐)", () => {
    expect(rowOf("철분제")).toBe("supplement");
    expect(rowOf("철분제 먹어도 돼요?")).toBe("supplement");
    expect(rowOf("홍삼정")).toBe("ginseng");
    expect(rowOf("홍삼액")).toBe("ginseng");
    expect(rowOf("매운거")).toBe("spicy");
    expect(rowOf("매운것도 괜찮나요")).toBe("spicy");
    expect(rowOf("커피의 카페인")).toBe("coffee");
    expect(rowOf("커피에 카페인이 얼마나")).toBe("coffee");
    expect(rowOf("타이레놀복용")).toBe("acetaminophen");
  });
});

describe("규칙 5 — 글자 종류가 바뀌면 경계", () => {
  it("한글 별칭 뒤 영문·숫자, 영문 별칭 뒤 숫자", () => {
    expect(rowOf("비타민C")).toBe("supplement");
    expect(rowOf("비타민d3")).toBe("supplement");
    expect(rowOf("타이레놀500")).toBe("acetaminophen");
    expect(rowOf("타이레놀ER")).toBe("acetaminophen");
    expect(rowOf("커피2잔")).toBe("coffee");
    expect(rowOf("codeine30mg")).toBe("alcohol");
  });

  it("영문 별칭 뒤에 영문이 이어지면 다른 낱말", () => {
    for (const q of ["teaspoon", "steak", "tear", "caffeinated"]) expect(rowOf(q), q).toBeNull();
    expect(rowOf("tea.")).toBe("tea");
    expect(rowOf("tea는")).toBe("tea");
  });

  it("영문 별칭은 한글·숫자 바로 뒤에서도 시작한다 — 붙여 쓴 다른 품목을 놓치지 않는다", () => {
    expect(match("마늘tea")).toEqual({ kind: "ambiguous", aliases: ["tea", "마늘"] });
    expect(match("아이스tea")).toMatchObject({ kind: "qualified", qualifier: "아이스", position: "before" });
    expect(rowOf("수유중caffeine")).toBe("coffee");
    // 한글 별칭은 숫자 바로 뒤에서 시작하지 않는다 — 하루 3회의 회는 회(날것) 행이 아니다
    expect(rowOf("타이레놀 3회")).toBe("acetaminophen");
  });

  it("영문 별칭 뒤 한글은 꼬리로 본다(토씨만 — 다른 한글 낱말이면 맞지 않는다)", () => {
    expect(rowOf("caffeine이 걱정돼요")).toBe("coffee");
    expect(rowOf("caffeine없는")).toBeNull();
  });
});

describe("규칙 6 — 띄어쓰기", () => {
  it("세 글자 이상 한글 별칭은 사이를 띄어 써도 맞는다", () => {
    expect(match("종합 감기약")).toMatchObject({ kind: "match", alias: "종합감기약" });
    expect(rowOf("에너지 드링크")).toBe("energy");
    expect(rowOf("카페인 음료")).toBe("energy"); // 카페인(커피 행)보다 긴 카페인음료(에너지 행)가 이긴다
    expect(match("생선 회")).toMatchObject({ kind: "match", alias: "생선회" });
    expect(rowOf("매운 음식")).toBe("spicy");
  });

  it("두 글자 별칭은 띄어 쓴 두 낱말에 걸쳐 맞지 않는다", () => {
    // "한 약" = 한(하나) + 약 — 한약이 아니다
    expect(rowOf("하루에 한 약을")).toBeNull();
  });

  it("별칭 안의 띄어쓰기·문장부호는 입력에서 있어도 없어도 된다", () => {
    const m = createSubstanceMatcher([
      { id: "oral", aliases: ["경구 세마글루타이드"] },
      { id: "glp1", aliases: ["glp-1", "세마글루타이드"] },
    ]);
    const id = (q: string) => {
      const r = m(q);
      return r.kind === "match" ? r.row.id : null;
    };
    expect(id("경구 세마글루타이드")).toBe("oral");
    expect(id("경구세마글루타이드")).toBe("oral");
    expect(id("경구 세마글루타이드 먹어도 되나요")).toBe("oral");
    expect(id("세마글루타이드 괜찮나요")).toBe("glp1");
    for (const q of ["GLP-1", "glp1", "glp 1", "GLP-1이요"]) expect(id(q), q).toBe("glp1");
    expect(id("glp-10")).toBeNull();
    // 주사·먹는 약을 따로 묻는 말은 별칭으로 더해야 맞는다(규칙 10 — 바로 뒤 "주사"는 품목을 바꿀 수 있는 말)
    expect(id("세마글루타이드 주사")).toBeNull();
  });
});

describe("규칙 7 — 겹치면 긴 별칭, 같은 자리에 다른 행이면 맞춤 없음", () => {
  it("더 긴(구체적인) 별칭이 이긴다 — 표 순서와 상관없다", () => {
    expect(match("생선회")).toMatchObject({ kind: "match", alias: "생선회" });
    expect(match("종합비타민")).toMatchObject({ kind: "match", alias: "종합비타민" });
    const reversed = createSubstanceMatcher([...ROWS].reverse());
    for (const q of ["생선회", "생선 회", "카페인 음료", "종합 감기약", "타이레놀", "회는요", "수술 후 진통제", "다이어트 영양제"]) {
      expect(reversed(q), q).toEqual(match(q));
    }
  });

  it("같은 별칭이 두 행에 있으면 고르지 않는다", () => {
    const m = createSubstanceMatcher([
      { id: "a", aliases: ["홍삼"] },
      { id: "b", aliases: ["홍삼"] },
    ]);
    expect(m("홍삼").kind).toBe("ambiguous");
  });

  it("두 별칭이 일부만 겹치면 고르지 않는다", () => {
    const m = createSubstanceMatcher([
      { id: "a", aliases: ["알파 베타"] },
      { id: "b", aliases: ["베타 감마"] },
    ]);
    expect(m("알파 베타 감마").kind).toBe("ambiguous");
    expect(m("알파 베타")).toMatchObject({ kind: "match", alias: "알파 베타" });
  });
});

describe("규칙 8 — 서로 다른 행의 품목이 함께 있으면 맞춤 없음", () => {
  it("한 판정을 고르지 않는다", () => {
    expect(match("타이레놀이랑 술")).toEqual({ kind: "ambiguous", aliases: ["타이레놀", "술"] });
    for (const q of ["술 마신 후 타이레놀", "타이레놀, 커피", "술·담배", "커피 대신 녹차", "참치 회"]) {
      expect(match(q).kind, q).toBe("ambiguous");
    }
  });

  it("같은 행의 별칭이 여럿이면 그 행", () => {
    for (const q of ["녹차 홍차", "녹차랑 홍차", "녹차, tea"]) expect(rowOf(q), q).toBe("tea");
    expect(rowOf("아세트아미노펜(타이레놀)")).toBe("acetaminophen");
    expect(rowOf("커피 커피")).toBe("coffee");
  });
});

describe("규칙 9 — 바로 앞 낱말이 품목을 꾸미면 맞춤 없음", () => {
  it("꾸미는 앞말", () => {
    expect(match("다이어트 영양제")).toEqual({ kind: "qualified", alias: "영양제", qualifier: "다이어트", position: "before" });
    expect(match("퀴놀론계 항생제")).toEqual({ kind: "qualified", alias: "항생제", qualifier: "퀴놀론계", position: "before" });
    expect(match("허브 티")).toEqual({ kind: "qualified", alias: "티", qualifier: "허브", position: "before" });
    // 복합제 성분을 거꾸로 적은 것 — 트라마돌염산염/아세트아미노펜(울트라셋)
    expect(match("트라마돌 아세트아미노펜")).toMatchObject({ kind: "qualified", qualifier: "트라마돌", position: "before" });
    for (const q of ["어린이 타이레놀", "디카페인 커피", "바르는 항생제", "수유 중 다이어트 영양제", "광어 회", "green tea", "low-dose caffeine", "저용량 비타민"]) {
      expect(match(q).kind, q).toBe("qualified");
    }
  });

  it("상황만 말하는 앞말은 꾸밈이 아니다", () => {
    for (const q of [
      "수유 중 타이레놀",
      "수유중에 타이레놀 먹어도 되나요?",
      "모유수유 중인데 타이레놀",
      "모유 수유 중 타이레놀",
      "출산 후에 커피",
      "출산후 커피",
      "제왕절개 후 타이레놀",
      "제왕절개 수술 후 타이레놀",
      "산후 보약",
      "산후에 홍삼",
      "혹시 커피",
      "요즘에 커피 마셔도 될까요",
      "식후 타이레놀",
    ]) {
      expect(match(q).kind, q).toBe("match");
    }
  });

  it("상황 이름이 아닌 말 뒤의 중·후는 상황으로 보지 않는다", () => {
    // 임신 중 — 이 표는 산후·수유 기준이다
    for (const q of ["임신 중 커피", "다이어트 중 영양제", "운동 후 커피", "회의 중 커피"]) expect(match(q).kind, q).toBe("qualified");
  });

  it("물음·때·나를 말하는 앞말도 꾸밈이 아니다", () => {
    for (const q of ["언제부터 커피 마셔도 되나요", "출산 후 언제부터 맥주", "제가 타이레놀 먹어도 되나요", "저도 커피", "다시 술"]) {
      expect(match(q).kind, q).toBe("match");
    }
  });
});

describe("규칙 10 — 바로 뒤 낱말이 품목을 바꾸면 맞춤 없음", () => {
  it("다른 품목·제품 이름·쓰는 길이 바로 뒤에 오면", () => {
    expect(match("타이레놀 콜드")).toEqual({ kind: "qualified", alias: "타이레놀", qualifier: "콜드", position: "after" });
    expect(match("아세트아미노펜 트라마돌")).toEqual({ kind: "qualified", alias: "아세트아미노펜", qualifier: "트라마돌", position: "after" });
    for (const q of [
      "아세트아미노펜/트라마돌",
      "아세트아미노펜(트라마돌)",
      "타이레놀이랑 트라마돌",
      "타이레놀은 트라마돌이랑 같이 먹어도 되나요",
      "맥주 효모",
      "마늘 주사",
      "비타민 주사",
      "항생제 연고",
      "커피 우유",
      "타이레놀 말고 다른 진통제",
      "커피 대신 보리차",
      "acetaminophen cold",
    ]) {
      expect(match(q).kind, q).toBe("qualified");
    }
  });

  it("먹어도·되나요·양·용량·약 모양·짧은 영문 표기·같은 행 별칭은 괜찮다", () => {
    for (const [q, id] of [
      ["타이레놀 먹어도 되나요", "acetaminophen"],
      ["타이레놀 500mg 두 알", "acetaminophen"],
      ["타이레놀 이알", "acetaminophen"],
      ["타이레놀 1정씩 하루 3번", "acetaminophen"],
      ["커피 하루에 몇 잔까지 괜찮나요", "coffee"],
      ["커피 마시고 몇 시간 뒤 수유", "coffee"],
      ["caffeine이 걱정돼요", "coffee"],
      ["맥주 한 잔 정도는 괜찮나요?", "alcohol"],
      ["술은 언제부터 마실 수 있나요", "alcohol"],
      ["비타민 c", "supplement"],
      ["비타민 d3 1000iu", "supplement"],
      ["철분 영양제", "supplement"],
      ["철분 캡슐", "supplement"],
      ["감기약 시럽", "cold"],
      ["홍삼 정", "ginseng"],
      ["담배 피워도 되나요", "smoking"],
    ] as const) {
      expect(rowOf(q), q).toBe(id);
    }
  });
});

describe("빈 별칭·NFD·대소문자", () => {
  it("빈 별칭·문장부호뿐인 별칭은 어떤 입력에도 맞지 않는다", () => {
    const m = createSubstanceMatcher([{ id: "empty", aliases: ["", " ", "·", "-"] }]);
    for (const q of ["", " ", "아무거나", "·", "-"]) expect(m(q).kind, JSON.stringify(q)).toBe("none");
  });

  it("자모가 분리된(NFD) 입력·별칭과 영문 대소문자", () => {
    expect(rowOf("감기약".normalize("NFD"))).toBe("cold");
    expect(rowOf("ACETAMINOPHEN")).toBe("acetaminophen");
    expect(createSubstanceMatcher([{ id: "nfd", aliases: ["홍삼".normalize("NFD")] }])("홍삼은").kind).toBe("match");
  });

  it("맞는 별칭이 없으면 none", () => {
    expect(match("없는약")).toEqual({ kind: "none" } satisfies SubstanceMatch<TestRow>);
  });
});

describe("긴 입력", () => {
  // 두 가지로 나뉘는 꼬리(이랑 = 이 + 랑)가 이어지면 정규식 반복은 되돌아가며 시도하는 길이 지수로 늘었다(24번에 1초).
  // 그렇게 돌아가면 이 시험은 끝나지 않아 시간 초과로 실패한다.
  const run = "이랑".repeat(200);

  it("겹쳐 나뉘는 꼬리가 길게 이어져도 바로 끝난다", () => {
    expect(rowOf(`타이레놀${run}`)).toBe("acetaminophen");
    expect(match(`타이레놀${run}겐`).kind).toBe("none");
    expect(match(`타이레놀 ${run}겐`).kind).toBe("qualified");
    expect(match(`수유중${run}겐 타이레놀`).kind).toBe("qualified");
    expect(rowOf(`수유중${run} 타이레놀`)).toBe("acetaminophen");
  });
});
