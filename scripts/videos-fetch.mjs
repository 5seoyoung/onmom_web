#!/usr/bin/env node
// 운동 영상 목록 수집 — next build 전에 한 번. 영상 서버(VIDEO_API_URL — Edge Function videos가 부르는 그 서버)에서 두 분만 경로의
// 영상 목록을 받아 src/content/videos.generated.json에 쓴다. 앱은 그 파일을 빌드 때 정적으로 싣고, 목록이 있으면 영상 서버·함수를
// 부르지 않는다(잠든 Render 서버를 기다리지 않고, 분만 방식도 기기 밖으로 나가지 않는다 — src/features/exercise/videoLoad.ts).
// 로직은 src/features/exercise/videoSnapshotFetch.mts(형식·검사는 videoSnapshot.ts, 응답 검사는 supabase/functions/_shared/videos.ts).
// 의존성 없음. Node 22.18+/24(.ts·.mts 타입 제거 — CI는 Node 24).
//
//   VIDEO_API_URL=https://… node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/videos-fetch.mjs [출력 파일]
//
// (--disable-warning: package.json에 "type"이 없어 .ts를 불러올 때마다 Node가 모듈 형식 경고를 낸다 — 빼도 동작은 같다)
// - 늘 종료 코드 0 — 빌드를 멈추지 않는다. VIDEO_API_URL이 없거나 틀렸거나 서버가 끝내 실패하면 빈 목록을 쓰고 경고만 남긴다
//   (그 빌드의 앱은 지금처럼 함수에 묻는다). 배포 워크플로(GITHUB_ACTIONS)에서는 경고가 실행 요약에 annotation으로 보인다.
// - 받은 목록은 커밋하지 않는다 — 저장소에는 빈 목록을 둔다(CI가 배포 때마다 새로 받는다: main push + 매일 03:30 KST).
// - 출력 파일을 주면 그 파일에 쓴다(테스트용 — 저장소 파일을 건드리지 않게).

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../src/content/videos.generated.json", import.meta.url));
const warn = (line) => console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning title=운동 영상 목록::${line}` : line);

try {
  const { runVideoSnapshotFetch } = await import("../src/features/exercise/videoSnapshotFetch.mts");
  process.exitCode = await runVideoSnapshotFetch({
    baseUrl: process.env.VIDEO_API_URL,
    fetch: (url, init) => fetch(url, init),
    writeSnapshot: (json) => writeFile(OUT, json, "utf8"),
    log: (line) => console.log(line),
    warn,
    now: () => new Date(),
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  });
} catch (e) {
  // 여기 오는 것은 모듈을 읽지 못했거나(Node 버전·경로) 파일을 쓰지 못한 경우뿐 — 저장소의 빈 목록이 남아 앱은 함수에 묻는다
  warn(`videos-fetch: 실패(Node ${process.versions.node}) - ${e?.message ?? e}. 저장소의 빈 목록으로 빌드합니다.`);
  process.exitCode = 0;
}
