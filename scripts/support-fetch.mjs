#!/usr/bin/env node
// 우리 지역 지원사업 수집 — next build 전에 한 번. 행정안전부_대한민국 공공서비스(혜택) 정보(공공데이터포털 15113968)의 목록에서
// 임신·출산 사업(개인·가구 대상)만 골라 public/support-programs.json(화면이 지역을 고를 때 받는 목록)과
// src/content/support-programs.generated.json(앱 번들에 들어가는 기준일·개수·해시)을 쓴다. 브라우저는 공공데이터포털을 부르지 않는다.
// 로직은 src/features/support/regionalFetch.mts(형식·규칙은 regionalCore.mjs). 의존성 없음. Node 22.18+/24(.mts 타입 제거 — CI는 Node 24).
//
//   DATA_GO_KR_SERVICE_KEY=… node scripts/support-fetch.mjs        → 두 파일 쓰기
//   node scripts/support-fetch.mjs --fixture <응답 JSON 파일>        → 네트워크 없이 그 파일을 serviceList 응답으로 보고 두 파일 쓰기
//                                                                    (내 컴퓨터에서 화면을 미리 볼 때만 — 만든 표시 파일은 커밋하지 않는다)
//
// - 키가 없으면 요청 없이 빈 표시를 쓰고 목록 파일을 지운다(저장소의 빈 표시와 같은 내용 — 기능 숨김).
// - API가 실패하면 경고 한 줄(HTTP 상태)과 빈 표시를 쓴다(종료 코드 0 — 이 기능 없이 배포가 이어진다).
// - 키는 공공데이터포털이 정한 serviceKey 주소 값으로만 보내고, 요청 주소를 출력·파일에 쓰지 않는다.
//   배포 워크플로는 이 단계에만 키를 넘긴다(.github/workflows/deploy.yml).
// 만든 목록 파일은 커밋하지 않는다(.gitignore) — 저장소에는 빈 표시만 둔다(CI가 배포 때마다 새로 만든다).

import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
const META = new URL("src/content/support-programs.generated.json", ROOT);
const DATA = new URL("public/support-programs.json", ROOT);

const inCi = process.env.GITHUB_ACTIONS === "true";

/** --fixture <파일> — 그 파일을 serviceList의 한 쪽 응답으로 돌려주는 가짜 fetch(perPage는 요청 값으로 맞춘다) */
async function fixtureFetch(path) {
  const body = JSON.parse(await readFile(path, "utf8"));
  return async (url) => {
    const perPage = Number(new URL(url).searchParams.get("perPage"));
    return { ok: true, status: 200, json: async () => ({ ...body, perPage }) };
  };
}

try {
  const { runSupportFetch } = await import("../src/features/support/regionalFetch.mts");
  const fixtureAt = process.argv.indexOf("--fixture");
  const fixture = fixtureAt >= 0 ? process.argv[fixtureAt + 1] : undefined;
  if (fixtureAt >= 0 && !fixture) throw new Error("--fixture 다음에 응답 JSON 파일 경로가 필요합니다");
  if (fixture) console.log(`support-fetch: --fixture ${fixture} (네트워크 없음 - 만든 표시 파일을 커밋하지 마세요)`);
  process.exitCode = await runSupportFetch({
    serviceKey: fixture ? "fixture" : process.env.DATA_GO_KR_SERVICE_KEY,
    fetch: fixture ? await fixtureFetch(fixture) : (url, init) => fetch(url, init),
    hash: (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12),
    // 목록을 먼저 쓰고 표시를 나중에(표시가 없는 목록을 가리키지 않게), 지울 때는 표시를 먼저 비운다
    write: async ({ meta, data }) => {
      if (data !== null) {
        await writeFile(DATA, data, "utf8");
        await writeFile(META, meta, "utf8");
      } else {
        await writeFile(META, meta, "utf8");
        await rm(DATA, { force: true });
      }
    },
    log: (line) => console.log(line),
    warn: (line) => console.log(inCi ? `::warning::${line}` : line),
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
} catch (e) {
  // 여기 오는 것은 파일을 읽지 못했거나(Node 버전·경로) 쓰지 못한 경우뿐 — 키·요청 주소는 담기지 않는다
  console.error(`support-fetch: 실패(Node ${process.versions.node}) - ${e?.message ?? e}`);
  process.exitCode = 1;
}
