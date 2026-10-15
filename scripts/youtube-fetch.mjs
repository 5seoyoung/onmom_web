#!/usr/bin/env node
// 유튜브 추천 영상 수집 — next build 전에 한 번. 승인된 채널·영상(src/content/youtube-allowlist.json)의 공개 메타데이터를
// YouTube Data API v3로 읽어 src/content/youtube.generated.json에 쓴다. 앱은 그 파일을 빌드 때 정적으로 싣는다(브라우저가 API를 부르지 않는다).
// 로직은 src/features/youtube/youtubeFetch.mts(형식·키워드는 youtubeCore.mjs). 의존성 없음. Node 22.18+/24(.mts 타입 제거 — CI는 Node 24).
//
//   YOUTUBE_API_KEY=… node scripts/youtube-fetch.mjs            → 생성 파일 쓰기
//   YOUTUBE_API_KEY=… node scripts/youtube-fetch.mjs --review   → 허용 채널의 최근 업로드를 검토 후보로 출력만(파일은 그대로)
//
// - 키가 없거나 허용 목록이 비었으면 아무것도 하지 않는다(요청 0, 파일 그대로 — 저장소의 빈 목록).
// - API가 실패하면 HTTP 상태만 출력하고 빈 목록을 쓴다(종료 코드 0 — 유튜브 목록 없이 배포가 이어진다).
// - 허용 목록 형식이 틀리면 종료 코드 1(빌드도 같은 검사로 멈춘다).
// - 키는 요청 헤더로만 보내고 출력·파일에 쓰지 않는다. 배포 워크플로는 이 단계에만 키를 넘긴다(.github/workflows/deploy.yml).
// 수집한 파일은 커밋하지 않는다 — 저장소에는 빈 목록을 둔다(CI가 배포 때마다 새로 만든다).

import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
const ALLOWLIST = new URL("src/content/youtube-allowlist.json", ROOT);
const CONTENT = new URL("src/content/content.json", ROOT);
const OUT = new URL("src/content/youtube.generated.json", ROOT);

try {
  const [{ runYouTubeFetch }, { orderedStageKeys }] = await Promise.all([
    import("../src/features/youtube/youtubeFetch.mts"),
    import("../src/features/youtube/youtubeCore.mjs"),
  ]);
  const allowlistRaw = JSON.parse(await readFile(ALLOWLIST, "utf8"));
  const content = JSON.parse(await readFile(CONTENT, "utf8"));
  process.exitCode = await runYouTubeFetch({
    apiKey: process.env.YOUTUBE_API_KEY,
    allowlistRaw,
    stageKeys: orderedStageKeys(content.stage_buckets),
    fetch: (url, init) => fetch(url, init),
    writeCatalog: (json) => writeFile(OUT, json, "utf8"),
    log: (line) => console.log(line),
    now: () => new Date(),
    mode: process.argv.includes("--review") ? "review" : "build",
  });
} catch (e) {
  // 여기 오는 것은 파일을 읽지 못했거나(Node 버전·경로) 쓰지 못한 경우뿐 — 키는 담기지 않는다
  console.error(`youtube-fetch: 실패(Node ${process.versions.node}) - ${e?.message ?? e}`);
  process.exitCode = 1;
}
