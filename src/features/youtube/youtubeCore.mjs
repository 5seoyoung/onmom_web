// @ts-check
// 유튜브 추천 영상 — 허용 목록(src/content/youtube-allowlist.json)과 생성 목록(src/content/youtube.generated.json)의 형식 검사,
// 제목·설명 키워드 판정. 빌드 때 앱(catalog.ts)과 빌드 전 수집 단계(scripts/youtube-fetch.mjs → youtubeFetch.mts)가 같이 쓴다.
//
// 왜 .mjs(JSDoc 타입)인가: Node(빌드 전 수집)·Turbopack(앱 번들)·Vitest·tsc가 모두 그대로 불러오는 형식이 이것뿐이다.
// - Turbopack은 "./x.mjs"를 x.mts로 바꿔 찾지 않는다(시험해 봄 — Module not found).
// - .ts는 Node가 불러올 때마다 모듈 형식 경고를 낸다(package.json에 "type"이 없다 — src/cspHash.mts 머리 주석).
// 그래서 다른 모듈을 불러오지 않는다(@/ 별칭은 Node가 모른다). 단계 key 목록은 부르는 쪽이 content.json에서 넘긴다.
// 맨 위 `// @ts-check` + tsconfig allowJs로 tsc가 이 파일도 검사한다.
//
// 이 파일의 오류 문구는 개발용이다(빌드·수집 단계에서 멈출 때만 보인다 — 화면에 그리지 않는다).

// MARK: - 형식

/** @typedef {"vaginal" | "cesarean"} Delivery */
/** @typedef {"A" | "B" | "C"} ChannelTier */

/**
 * 허용 채널 — CPO·임상 자문이 승인한 채널.
 * autoShow가 false(기본)면 이 채널의 영상은 videos에 영상 ID로 따로 승인된 것만 보인다(새 영상은 검토 대기).
 * true면 최근 업로드 중 단계 키워드에 맞는 영상이 자동으로 보인다.
 * @typedef {object} AllowlistChannel
 * @property {string} channelId UC로 시작하는 24자
 * @property {string} title 알아보기 위한 채널 이름(화면에는 API가 준 채널 이름을 쓴다)
 * @property {ChannelTier} tier 검토 등급
 * @property {boolean} autoShow
 * @property {string} note 누가·언제·왜 승인했는지
 */

/**
 * 승인 영상 — 단계(stageKey)를 사람이 정한다. delivery가 있으면 그 분만 방식에만 보인다.
 * @typedef {object} AllowlistVideo
 * @property {string} videoId 11자
 * @property {string} stageKey content.json stage_buckets의 key
 * @property {Delivery | null} delivery
 * @property {string} note
 */

/** @typedef {{ include: string[], exclude: string[] }} StageKeywordRule */

/**
 * @typedef {object} YouTubeAllowlist
 * @property {AllowlistChannel[]} channels
 * @property {AllowlistVideo[]} videos
 * @property {Record<string, StageKeywordRule>} stageKeywords 단계 key → 제목·설명에서 찾을 말(자동 표시 채널의 단계 판정용)
 * @property {string[]} excludeKeywords 제목에 있으면 어떤 영상이든 뺀다
 * @property {string[]} excludePatterns 제목에 맞으면 뺀다(정규식 원문, 플래그 iu)
 */

/**
 * 생성 목록의 영상 한 건 — 공개 메타데이터만(API 키·설명은 싣지 않는다).
 * @typedef {object} CatalogVideo
 * @property {string} videoId
 * @property {string} channelId
 * @property {string} title
 * @property {string} channelTitle
 * @property {string} publishedAt ISO 8601
 * @property {string} stageKey
 * @property {Delivery | null} delivery JSON에서는 값이 있을 때만 적는다
 * @property {string} thumbnail https://i.ytimg.com/vi/{videoId}/mqdefault.jpg
 */

/** @typedef {{ generatedAt: string | null, videos: CatalogVideo[] }} YouTubeCatalog */

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
/** @type {readonly Delivery[]} */
export const DELIVERIES = ["vaginal", "cesarean"];
/** @type {readonly ChannelTier[]} */
export const CHANNEL_TIERS = ["A", "B", "C"];
/** 미리보기 이미지 호스트 — CSP img-src는 목록이 비지 않았을 때만 이 호스트를 연다(src/csp.ts) */
export const THUMBNAIL_HOST = "i.ytimg.com";
export const MAX_TITLE_LENGTH = 200;
export const MAX_CHANNEL_TITLE_LENGTH = 100;

/** @type {YouTubeCatalog} */
export const EMPTY_CATALOG = Object.freeze({ generatedAt: null, videos: /** @type {CatalogVideo[]} */ ([]) });

export class YouTubeDataError extends Error {
  /**
   * @param {string} file
   * @param {string[]} problems
   */
  constructor(file, problems) {
    super(`${file} 형식 오류:\n  ${problems.join("\n  ")}`);
    this.name = "YouTubeDataError";
    /** @type {string[]} */
    this.problems = problems;
  }
}

/** 미리보기 이미지 주소(320×180) — API 응답의 주소를 믿지 않고 영상 ID로 만든다(호스트가 늘 i.ytimg.com) */
export function thumbnailUrl(/** @type {string} */ videoId) {
  return `https://${THUMBNAIL_HOST}/vi/${videoId}/mqdefault.jpg`;
}

/** 유튜브 보기 주소 — 화면은 safeExternalUrl을 한 번 더 거친다 */
export function watchUrl(/** @type {string} */ videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * content.json stage_buckets → 단계 key(order 오름차순). 단계 판정은 이 순서로 "가장 늦은 단계"를 고른다.
 * @param {readonly { key: string, order: number }[]} buckets
 * @returns {string[]}
 */
export function orderedStageKeys(buckets) {
  return [...buckets].sort((a, b) => a.order - b.order).map((b) => b.key);
}

// MARK: - 검사 도우미

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isText(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * "$"로 시작하는 키는 설명(주석)이라 넘어간다. 그 밖의 모르는 키는 오타일 수 있어 멈춘다(예: autoshow).
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} allowed
 * @param {string} path
 * @param {string[]} problems
 */
function checkKeys(obj, allowed, path, problems) {
  for (const k of Object.keys(obj)) {
    if (!k.startsWith("$") && !allowed.includes(k)) problems.push(`${path}.${k}: 모르는 항목`);
  }
}

/**
 * @param {unknown} v
 * @param {string} path
 * @param {string[]} problems
 * @returns {string[]}
 */
function keywordList(v, path, problems) {
  if (!Array.isArray(v)) {
    problems.push(`${path}: 글자 목록이 아닙니다`);
    return [];
  }
  /** @type {string[]} */
  const out = [];
  v.forEach((k, i) => {
    if (typeof k !== "string" || normalizeForMatch(k) === "") problems.push(`${path}[${i}]: 빈 글자이거나 글자가 아닙니다`);
    else out.push(k);
  });
  return out;
}

/**
 * @param {unknown} v
 * @returns {v is Delivery}
 */
function isDelivery(v) {
  return typeof v === "string" && /** @type {readonly string[]} */ (DELIVERIES).includes(v);
}

// MARK: - 허용 목록

/**
 * 허용 목록 JSON → 검사한 값. 문제가 하나라도 있으면 모두 모아 YouTubeDataError(빌드가 멈춘다).
 * @param {unknown} raw
 * @param {readonly string[]} stageKeys content.json stage_buckets의 key
 * @returns {YouTubeAllowlist}
 */
export function parseAllowlist(raw, stageKeys) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(raw)) throw new YouTubeDataError("youtube-allowlist.json", ["최상위가 객체가 아닙니다"]);
  checkKeys(raw, ["channels", "videos", "stageKeywords", "excludeKeywords", "excludePatterns"], "", problems);

  /** @type {AllowlistChannel[]} */
  const channels = [];
  const seenChannels = new Set();
  if (!Array.isArray(raw.channels)) problems.push("channels: 목록이 아닙니다");
  else
    raw.channels.forEach((c, i) => {
      const p = `channels[${i}]`;
      if (!isRecord(c)) {
        problems.push(`${p}: 객체가 아닙니다`);
        return;
      }
      checkKeys(c, ["channelId", "title", "tier", "autoShow", "note"], p, problems);
      const before = problems.length;
      const { channelId, title, tier, note } = c;
      const autoShow = c.autoShow ?? false;
      if (typeof channelId !== "string" || !CHANNEL_ID_PATTERN.test(channelId)) {
        problems.push(`${p}.channelId: UC로 시작하는 24자 채널 ID가 아닙니다`);
      } else if (seenChannels.has(channelId)) problems.push(`${p}.channelId: 같은 채널이 두 번 있습니다`);
      if (!isText(title)) problems.push(`${p}.title: 비어 있습니다`);
      if (typeof tier !== "string" || !/** @type {readonly string[]} */ (CHANNEL_TIERS).includes(tier)) {
        problems.push(`${p}.tier: ${CHANNEL_TIERS.join("·")} 중 하나가 아닙니다`);
      }
      if (typeof autoShow !== "boolean") problems.push(`${p}.autoShow: true/false가 아닙니다`);
      if (!isText(note)) problems.push(`${p}.note: 승인 기록(누가·언제·왜)이 비어 있습니다`);
      if (problems.length > before) return;
      seenChannels.add(channelId);
      channels.push({
        channelId: /** @type {string} */ (channelId),
        title: /** @type {string} */ (title),
        tier: /** @type {ChannelTier} */ (tier),
        autoShow: /** @type {boolean} */ (autoShow),
        note: /** @type {string} */ (note),
      });
    });

  /** @type {AllowlistVideo[]} */
  const videos = [];
  const seenVideos = new Set();
  if (!Array.isArray(raw.videos)) problems.push("videos: 목록이 아닙니다");
  else
    raw.videos.forEach((v, i) => {
      const p = `videos[${i}]`;
      if (!isRecord(v)) {
        problems.push(`${p}: 객체가 아닙니다`);
        return;
      }
      checkKeys(v, ["videoId", "stageKey", "delivery", "note"], p, problems);
      const before = problems.length;
      const { videoId, stageKey, note } = v;
      const delivery = v.delivery ?? null;
      if (typeof videoId !== "string" || !VIDEO_ID_PATTERN.test(videoId)) problems.push(`${p}.videoId: 11자 영상 ID가 아닙니다`);
      else if (seenVideos.has(videoId)) problems.push(`${p}.videoId: 같은 영상이 두 번 있습니다`);
      if (typeof stageKey !== "string" || !stageKeys.includes(stageKey)) {
        problems.push(`${p}.stageKey: content.json stage_buckets의 key(${stageKeys.join(", ")})가 아닙니다`);
      }
      if (delivery !== null && !isDelivery(delivery)) problems.push(`${p}.delivery: "vaginal"·"cesarean" 또는 생략`);
      if (!isText(note)) problems.push(`${p}.note: 승인 기록(누가·언제·왜)이 비어 있습니다`);
      if (problems.length > before) return;
      seenVideos.add(videoId);
      videos.push({
        videoId: /** @type {string} */ (videoId),
        stageKey: /** @type {string} */ (stageKey),
        delivery: /** @type {Delivery | null} */ (delivery),
        note: /** @type {string} */ (note),
      });
    });

  /** @type {Record<string, StageKeywordRule>} */
  const stageKeywords = {};
  if (!isRecord(raw.stageKeywords)) problems.push("stageKeywords: 객체가 아닙니다");
  else
    for (const [key, rule] of Object.entries(raw.stageKeywords)) {
      if (key.startsWith("$")) continue;
      const p = `stageKeywords.${key}`;
      if (!stageKeys.includes(key)) problems.push(`${p}: content.json stage_buckets에 없는 단계입니다`);
      if (!isRecord(rule)) {
        problems.push(`${p}: 객체가 아닙니다`);
        continue;
      }
      checkKeys(rule, ["include", "exclude"], p, problems);
      stageKeywords[key] = { include: keywordList(rule.include, `${p}.include`, problems), exclude: keywordList(rule.exclude ?? [], `${p}.exclude`, problems) };
    }

  const excludeKeywords = keywordList(raw.excludeKeywords, "excludeKeywords", problems);
  const excludePatterns = keywordList(raw.excludePatterns ?? [], "excludePatterns", problems);
  excludePatterns.forEach((source, i) => {
    try {
      new RegExp(source, "iu");
    } catch {
      problems.push(`excludePatterns[${i}]: 정규식이 아닙니다`);
    }
  });

  if (problems.length > 0) throw new YouTubeDataError("youtube-allowlist.json", problems);
  return { channels, videos, stageKeywords, excludeKeywords, excludePatterns };
}

/** 승인된 채널·영상이 하나도 없는가 — 그러면 수집하지 않고(요청 0) 화면에도 그리지 않는다 */
export function isAllowlistEmpty(/** @type {YouTubeAllowlist} */ allowlist) {
  return allowlist.channels.length === 0 && allowlist.videos.length === 0;
}

// MARK: - 키워드 판정

/** 비교용 글자 — 호환 문자 정규화(NFKC)·소문자·공백 없이("골반 교정" = "골반교정") */
export function normalizeForMatch(/** @type {string} */ s) {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

/**
 * @param {string} normalized normalizeForMatch를 거친 글자
 * @param {readonly string[]} keywords
 * @returns {string | null} 처음 맞은 키워드
 */
function firstKeyword(normalized, keywords) {
  for (const k of keywords) {
    const n = normalizeForMatch(k);
    if (n !== "" && normalized.includes(n)) return k;
  }
  return null;
}

/**
 * 제목이 전역 제외 키워드·패턴에 맞는가 — 맞으면 그 키워드(패턴 원문), 아니면 null. 승인 영상에도 적용한다(제목이 바뀌어도 걸러지게).
 * @param {string} title
 * @param {Pick<YouTubeAllowlist, "excludeKeywords" | "excludePatterns">} allowlist
 * @returns {string | null}
 */
export function exclusionMatch(title, allowlist) {
  const hit = firstKeyword(normalizeForMatch(title), allowlist.excludeKeywords);
  if (hit !== null) return hit;
  const text = title.normalize("NFKC");
  for (const source of allowlist.excludePatterns) {
    if (new RegExp(source, "iu").test(text)) return source;
  }
  return null;
}

/**
 * 자동 표시 채널 영상의 단계. 맞는 단계가 없으면 null(보이지 않는다).
 * - 한 단계가 "맞는다" = 제목이나 설명에 그 단계의 include가 있고, 제목과 설명 어디에도 그 단계의 exclude가 없다.
 * - 제목이 어느 단계에 맞아야 후보가 된다. 설명은 단계를 더 늦게 만들 수만 있다 — 설명의 상투 문구("호흡에 집중하세요")만으로
 *   주제가 다른 영상이 이른 단계에 들어오지 않게.
 * - 여러 단계에 맞으면 가장 늦은 단계(order가 큰 것)로 둔다: 영상 안의 가장 강한 동작이 열리기 전에는 보이지 않게(보수적).
 * 설명은 판정에만 쓰고 생성 목록에 싣지 않는다.
 * @param {string} title
 * @param {string} description
 * @param {Pick<YouTubeAllowlist, "stageKeywords">} allowlist
 * @param {readonly string[]} stageKeys order 오름차순(orderedStageKeys)
 * @returns {string | null}
 */
export function stageForVideo(title, description, allowlist, stageKeys) {
  const t = normalizeForMatch(title);
  const d = normalizeForMatch(description);
  /** @type {string | null} */
  let stage = null;
  let titleMatched = false;
  for (const key of stageKeys) {
    const rule = allowlist.stageKeywords[key];
    if (rule === undefined) continue;
    if (firstKeyword(t, rule.exclude) !== null || firstKeyword(d, rule.exclude) !== null) continue;
    const inTitle = firstKeyword(t, rule.include) !== null;
    if (inTitle) titleMatched = true;
    if (inTitle || firstKeyword(d, rule.include) !== null) stage = key;
  }
  return titleMatched ? stage : null;
}

// MARK: - 생성 목록

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * 생성 목록 JSON → 검사한 값. 문제가 있으면 YouTubeDataError(빌드가 멈춘다 — 수집 단계가 쓰기 전에 같은 검사를 거친다).
 * @param {unknown} raw
 * @param {readonly string[]} stageKeys
 * @returns {YouTubeCatalog}
 */
export function parseCatalog(raw, stageKeys) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(raw)) throw new YouTubeDataError("youtube.generated.json", ["최상위가 객체가 아닙니다"]);
  checkKeys(raw, ["generatedAt", "videos"], "", problems);
  const generatedAt = raw.generatedAt ?? null;
  if (generatedAt !== null && !isIsoDate(generatedAt)) problems.push("generatedAt: ISO 시각 또는 null이 아닙니다");
  /** @type {CatalogVideo[]} */
  const videos = [];
  const seen = new Set();
  if (!Array.isArray(raw.videos)) problems.push("videos: 목록이 아닙니다");
  else
    raw.videos.forEach((v, i) => {
      const p = `videos[${i}]`;
      if (!isRecord(v)) {
        problems.push(`${p}: 객체가 아닙니다`);
        return;
      }
      checkKeys(v, ["videoId", "channelId", "title", "channelTitle", "publishedAt", "stageKey", "delivery", "thumbnail"], p, problems);
      const before = problems.length;
      const { videoId, channelId, title, channelTitle, publishedAt, stageKey, thumbnail } = v;
      const delivery = v.delivery ?? null;
      if (typeof videoId !== "string" || !VIDEO_ID_PATTERN.test(videoId)) problems.push(`${p}.videoId: 11자 영상 ID가 아닙니다`);
      else if (seen.has(videoId)) problems.push(`${p}.videoId: 같은 영상이 두 번 있습니다`);
      if (typeof channelId !== "string" || !CHANNEL_ID_PATTERN.test(channelId)) problems.push(`${p}.channelId: 채널 ID가 아닙니다`);
      if (!isText(title) || title.length > MAX_TITLE_LENGTH) problems.push(`${p}.title: 비었거나 너무 깁니다`);
      if (!isText(channelTitle) || channelTitle.length > MAX_CHANNEL_TITLE_LENGTH) problems.push(`${p}.channelTitle: 비었거나 너무 깁니다`);
      if (!isIsoDate(publishedAt)) problems.push(`${p}.publishedAt: ISO 시각이 아닙니다`);
      if (typeof stageKey !== "string" || !stageKeys.includes(stageKey)) problems.push(`${p}.stageKey: 모르는 단계입니다`);
      if (delivery !== null && !isDelivery(delivery)) problems.push(`${p}.delivery: "vaginal"·"cesarean" 또는 생략`);
      if (typeof videoId === "string" && thumbnail !== thumbnailUrl(videoId)) problems.push(`${p}.thumbnail: ${thumbnailUrl("{videoId}")} 모양이 아닙니다`);
      if (problems.length > before) return;
      seen.add(videoId);
      videos.push({
        videoId: /** @type {string} */ (videoId),
        channelId: /** @type {string} */ (channelId),
        title: /** @type {string} */ (title),
        channelTitle: /** @type {string} */ (channelTitle),
        publishedAt: /** @type {string} */ (publishedAt),
        stageKey: /** @type {string} */ (stageKey),
        delivery: /** @type {Delivery | null} */ (delivery),
        thumbnail: /** @type {string} */ (thumbnail),
      });
    });
  if (problems.length > 0) throw new YouTubeDataError("youtube.generated.json", problems);
  return { generatedAt: /** @type {string | null} */ (generatedAt), videos };
}

/**
 * 생성 목록 → 파일 글자(키 순서 고정, 2칸 들여쓰기, 끝 줄바꿈). delivery는 값이 있을 때만 적는다.
 * 저장소에 커밋된 빈 파일은 serializeCatalog(EMPTY_CATALOG)와 같아야 한다(테스트).
 * @param {YouTubeCatalog} catalog
 * @returns {string}
 */
export function serializeCatalog(catalog) {
  const videos = catalog.videos.map((v) => ({
    videoId: v.videoId,
    channelId: v.channelId,
    title: v.title,
    channelTitle: v.channelTitle,
    publishedAt: v.publishedAt,
    stageKey: v.stageKey,
    ...(v.delivery !== null ? { delivery: v.delivery } : {}),
    thumbnail: v.thumbnail,
  }));
  return `${JSON.stringify({ generatedAt: catalog.generatedAt, videos }, null, 2)}\n`;
}

/**
 * 생성 목록을 지금 허용 목록과 다시 맞춘다 — 빌드에 들어가는 것은 이 결과뿐이다.
 * - 승인 영상(videos): 단계·분만 방식은 허용 목록 값으로(생성 목록 값을 믿지 않는다).
 * - 자동 표시 채널(autoShow: true)의 영상: 수집 단계가 판정한 단계 그대로.
 * - 그 밖(허용 목록에서 빠졌거나 autoShow가 꺼진 채널의 영상)은 뺀다 — 낡은 생성 파일이 남아도 승인 없이 보이지 않게.
 * - 제목이 전역 제외 키워드·패턴에 맞으면 뺀다.
 * @param {YouTubeCatalog} catalog
 * @param {YouTubeAllowlist} allowlist
 * @returns {CatalogVideo[]}
 */
export function resolveCatalog(catalog, allowlist) {
  const approved = new Map(allowlist.videos.map((v) => [v.videoId, v]));
  const autoShow = new Set(allowlist.channels.filter((c) => c.autoShow).map((c) => c.channelId));
  /** @type {CatalogVideo[]} */
  const out = [];
  for (const v of catalog.videos) {
    if (exclusionMatch(v.title, allowlist) !== null) continue;
    const a = approved.get(v.videoId);
    if (a !== undefined) out.push({ ...v, stageKey: a.stageKey, delivery: a.delivery });
    else if (autoShow.has(v.channelId)) out.push(v);
  }
  return out;
}
