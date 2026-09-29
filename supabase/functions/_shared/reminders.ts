// Edge Function 공용 — 매일 리마인더(웹 푸시)의 규칙과 암호화. 설명: docs/PWA_AND_REMINDERS.md
//
// ⚠️ 이 폴더(_shared)의 파일은 Deno(함수)·vitest(src/features/pwa/webPush.test.ts)·Next tsc가 모두 읽는다(cors.ts 머리말과 같은 제약):
//    Deno 전역·npm: 가져오기를 쓰지 않는다. 암호화는 어디에나 있는 Web Crypto(crypto.subtle)만으로 한다 — 의존성 없음.
//
// 구현 규격
// - RFC 8291 Message Encryption for Web Push (aes128gcm — RFC 8188): ECDH P-256 + HKDF-SHA256 + AES-128-GCM.
//   RFC 8291 부록 A의 시험 벡터와 바이트 단위로 같은지 테스트가 확인한다(송신 키·salt를 넣을 수 있게 열어 둔다).
// - RFC 8292 VAPID: ES256(JWT) 서명, `Authorization: vapid t=<JWT>, k=<공개 키>`. aud = 푸시 서비스 origin, exp ≤ 24시간.
// - VAPID 비밀 키(32바이트 base64url)만 있으면 공개 키를 P-256 스칼라 곱으로 만든다(Web Crypto는 d만으로 가져오지 못한다).
//
// 개인정보: 알림 본문은 아래 고정 문구뿐이다(건강 데이터 없음). 끝점 주소·키·사용자 id는 기록하지 않는다(숫자만 — SendSummary).
// 보내는 곳: 브라우저 회사의 푸시 서비스(PUSH_SERVICE_HOSTS)뿐 — 그 밖의 주소로는 요청하지 않고, 리다이렉트도 따라가지 않는다.

// 원문: src/content/content.json notification.daily_reminder (NotificationManager.swift:22-23). 테스트가 content.json과 같은지 확인한다.
export const REMINDER_NOTIFICATION = {
  title: "오늘의 회복 체크",
  body: "이상 증상이 있었나요? 1분이면 빠르게 확인할 수 있어요.",
} as const;
/** 기기 시간대 기준 발송 시각 — content.json notification.daily_reminder.hour/minute */
export const REMINDER_HOUR = 20;
export const REMINDER_MINUTE = 0;
/** 푸시 서비스가 기기가 꺼져 있을 때 보관하는 시간 — 저녁 안에만 뜻이 있다 */
export const REMINDER_TTL_SECONDS = 4 * 60 * 60;
/** 같은 주제의 미전달 알림은 하나로 합쳐진다(어제 것이 오늘 것과 겹치지 않게) */
export const REMINDER_TOPIC = "onmom-daily";
export const VAPID_TOKEN_TTL_SECONDS = 12 * 60 * 60;
/** pg_cron이 보내는 공유 비밀 헤더(Vault reminder_cron_secret = 함수 비밀값 REMINDER_CRON_SECRET) */
export const REMINDER_SECRET_HEADER = "x-reminder-secret";
export const PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";
/**
 * 받는 푸시 서비스만(남용·SSRF 방지) — FCM(Chrome·Samsung 인터넷 등 Chromium 계열), Mozilla autopush(Firefox), WNS(Edge), Apple(Safari).
 * src/features/pwa/reminderModel.ts의 같은 이름 상수·0004_push_reminders.sql의 check 제약과 같은 규칙이다(pwa.test.ts가 글자로 비교).
 */
export const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"] as const;
export const PUSH_ENDPOINT_PATTERN = /^https:\/\/(?:[a-z0-9-]+\.)*(?:fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\/\S+$/i;
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

export function isKnownPushService(endpoint: string): boolean {
  return endpoint.length <= PUSH_ENDPOINT_MAX_LENGTH && PUSH_ENDPOINT_PATTERN.test(endpoint);
}

/** 한 번에 보내는 요청 수 */
export const SEND_CONCURRENCY = 20;
/** 한 페이지에 읽는 구독 수 */
export const SUBSCRIPTION_PAGE_SIZE = 1000;

type Bytes = Uint8Array<ArrayBuffer>;

// MARK: 바이트 · base64url

export function bytes(length: number): Bytes {
  return new Uint8Array(length);
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = bytes(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function utf8(s: string): Bytes {
  return concatBytes(new TextEncoder().encode(s));
}

export function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 1) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): Bytes {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = bytes(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function u32be(n: number): Bytes {
  const out = bytes(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < b.length; i += 1) n = (n << 8n) | BigInt(b[i]);
  return n;
}

function bigIntToBytes(n: bigint, length: number): Bytes {
  const out = bytes(length);
  let v = n;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// MARK: P-256 (secp256r1) — 비밀 키 → 공개 키

const P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const GX = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
const GY = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");

type Point = { x: bigint; y: bigint } | null;

const mod = (a: bigint): bigint => ((a % P) + P) % P;

function modInverse(a: bigint): bigint {
  let [r0, r1] = [mod(a), P];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error("no inverse");
  return mod(s0);
}

function pointDouble(p: Point): Point {
  if (p === null || p.y === 0n) return null;
  const l = mod((3n * p.x * p.x - 3n) * modInverse(2n * p.y)); // a = -3
  const x = mod(l * l - 2n * p.x);
  return { x, y: mod(l * (p.x - x) - p.y) };
}

function pointAdd(p: Point, q: Point): Point {
  if (p === null) return q;
  if (q === null) return p;
  if (p.x === q.x) return mod(p.y + q.y) === 0n ? null : pointDouble(p);
  const l = mod((q.y - p.y) * modInverse(q.x - p.x));
  const x = mod(l * l - p.x - q.x);
  return { x, y: mod(l * (p.x - x) - p.y) };
}

function scalarMultiply(k: bigint, point: Point): Point {
  let result: Point = null;
  let addend = point;
  let n = k;
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend);
    addend = pointDouble(addend);
    n >>= 1n;
  }
  return result;
}

/** 32바이트 비밀 키(d) → 비압축 공개 키(0x04 || x || y, 65바이트). d가 [1, n-1] 밖이면 예외. */
export function p256PublicKeyFromPrivate(d: Uint8Array): Bytes {
  if (d.length !== 32) throw new Error("private key must be 32 bytes");
  const k = bytesToBigInt(d);
  if (k === 0n || k >= N) throw new Error("private key out of range");
  const point = scalarMultiply(k, { x: GX, y: GY });
  if (point === null) throw new Error("invalid private key");
  return concatBytes(new Uint8Array([4]), bigIntToBytes(point.x, 32), bigIntToBytes(point.y, 32));
}

/** 비압축 공개 키(65바이트, 0x04로 시작)인가 */
export function isUncompressedP256Point(key: Uint8Array): boolean {
  return key.length === 65 && key[0] === 4;
}

async function importEcPrivateKey(d: Uint8Array, publicKey: Uint8Array, algorithm: "ECDH" | "ECDSA", usages: KeyUsage[]): Promise<CryptoKey> {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(d),
    x: base64UrlEncode(publicKey.subarray(1, 33)),
    y: base64UrlEncode(publicKey.subarray(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: algorithm, namedCurve: "P-256" }, false, usages);
}

// MARK: VAPID (RFC 8292)

export interface VapidKeys {
  privateKey: CryptoKey;
  publicKey: Bytes;
  /** `k=` 값 — 브라우저의 applicationServerKey(NEXT_PUBLIC_VAPID_PUBLIC_KEY)와 같아야 한다 */
  publicKeyB64: string;
}

/** 비밀 키(32바이트 base64url — scripts/generate-vapid.mjs 출력)에서 서명 키와 공개 키를 만든다. */
export async function importVapidKeys(privateKeyB64: string): Promise<VapidKeys> {
  const d = base64UrlDecode(privateKeyB64.trim());
  const publicKey = p256PublicKeyFromPrivate(d);
  const privateKey = await importEcPrivateKey(d, publicKey, "ECDSA", ["sign"]);
  return { privateKey, publicKey, publicKeyB64: base64UrlEncode(publicKey) };
}

/** mailto: 또는 https: — RFC 8292 §2.1 sub */
export function isValidVapidSubject(subject: string): boolean {
  return /^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s/]+/.test(subject);
}

/** 푸시 서비스 origin — JWT aud */
export function pushAudience(endpoint: string): string {
  return new URL(endpoint).origin;
}

/** `Authorization: vapid t=<JWT>, k=<공개 키>` 헤더 값. exp는 nowMs + ttl(기본 12시간, 24시간을 넘지 않는다). */
export async function createVapidAuthorization(
  keys: VapidKeys,
  audience: string,
  subject: string,
  nowMs: number,
  ttlSeconds: number = VAPID_TOKEN_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + Math.min(ttlSeconds, 24 * 60 * 60);
  const header = base64UrlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(utf8(JSON.stringify({ aud: audience, exp, sub: subject })));
  const signingInput = `${header}.${claims}`;
  // Web Crypto의 ECDSA 서명은 r||s(64바이트) — JWS ES256이 요구하는 형식 그대로다
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, utf8(signingInput)));
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${keys.publicKeyB64}`;
}

// MARK: 본문 암호화 (RFC 8291 · RFC 8188 aes128gcm)

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", concatBytes(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: concatBytes(salt), info: concatBytes(info) }, key, length * 8));
}

export interface EncryptOptions {
  /** 시험 벡터용 — 송신(서버) 임시 키를 고정한다. 보통은 매번 새로 만든다. */
  senderPrivateKey?: Uint8Array;
  /** 시험 벡터용 — 16바이트 salt를 고정한다. */
  salt?: Uint8Array;
}

/**
 * 구독의 공개 키(p256dh)·인증 비밀(auth)로 본문을 암호화한다 → 푸시 서비스에 보내는 바이트(aes128gcm 헤더 포함).
 * 헤더: salt(16) || rs(4, 4096) || idlen(1, 65) || 송신 공개 키(65) — 그 뒤 AES-128-GCM 암호문(마지막 레코드 구분자 0x02 포함).
 */
export async function encryptWebPushPayload(plaintext: Uint8Array, p256dh: string, auth: string, options: EncryptOptions = {}): Promise<Bytes> {
  const uaPublic = base64UrlDecode(p256dh);
  const authSecret = base64UrlDecode(auth);
  if (!isUncompressedP256Point(uaPublic)) throw new Error("invalid p256dh");
  if (authSecret.length !== 16) throw new Error("invalid auth secret");
  const salt = options.salt ? concatBytes(options.salt) : crypto.getRandomValues(bytes(16));
  if (salt.length !== 16) throw new Error("invalid salt");

  let senderPrivate: CryptoKey;
  let senderPublic: Bytes;
  if (options.senderPrivateKey) {
    senderPublic = p256PublicKeyFromPrivate(options.senderPrivateKey);
    senderPrivate = await importEcPrivateKey(options.senderPrivateKey, senderPublic, "ECDH", ["deriveBits"]);
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    senderPrivate = pair.privateKey;
    senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, senderPrivate, 256));

  // RFC 8291 §3.3–3.4
  const ikm = await hkdf(ecdhSecret, authSecret, concatBytes(utf8("WebPush: info\0"), uaPublic, senderPublic), 32);
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 12);

  // 레코드 하나: 본문 || 0x02(마지막 레코드 구분자). 패딩은 넣지 않는다(본문은 늘 같은 고정 문구).
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record));

  const header = concatBytes(salt, u32be(4096), new Uint8Array([senderPublic.length]), senderPublic);
  return concatBytes(header, ciphertext);
}

// MARK: 구독 행 · 요청 · 응답

export interface SubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
}

/** DB 행 → 구독. 모양이 틀리거나 받는 푸시 서비스(PUSH_SERVICE_HOSTS) 밖의 끝점이면 null(보내지 않는다 — 0004의 check 제약과 이중 확인). */
export function parseSubscriptionRecord(raw: unknown): SubscriptionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { id, endpoint, p256dh, auth, tz } = r;
  if (typeof id !== "string" || typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!isKnownPushService(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,30}$/.test(auth)) return null;
  return { id, endpoint, p256dh, auth, tz: typeof tz === "string" && tz.length > 0 ? tz : "Asia/Seoul" };
}

/** 푸시 본문 — 고정 문구뿐(서비스 워커는 이 본문을 읽지 않고 같은 문구를 보인다). 건강 데이터는 어디에도 없다. */
export function reminderPayload(): Bytes {
  return utf8(JSON.stringify({ type: "daily_reminder", title: REMINDER_NOTIFICATION.title, body: REMINDER_NOTIFICATION.body }));
}

export interface PushRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Bytes;
  /** 푸시 서비스는 리다이렉트하지 않는다 — 따라가지 않고 3xx를 그대로 받아 rejected로 센다(다른 주소로 새지 않게) */
  redirect: "manual";
}

export function buildPushRequest(subscription: SubscriptionRecord, encryptedBody: Bytes, authorization: string): PushRequest {
  return {
    url: subscription.endpoint,
    method: "POST",
    headers: {
      TTL: String(REMINDER_TTL_SECONDS),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(encryptedBody.length),
      Authorization: authorization,
      Urgency: "normal",
      Topic: REMINDER_TOPIC,
    },
    body: encryptedBody,
    redirect: "manual",
  };
}

export type PushOutcome =
  /** 푸시 서비스가 받았다(201·200·202) */
  | "sent"
  /** 구독이 사라졌다(404·410) — 행을 지운다 */
  | "gone"
  /** 일시 오류(429·5xx) — 행은 두고 다음에 다시 */
  | "retry"
  /** 그 밖(3xx 리다이렉트 — 따라가지 않는다, 400·401·403·413 — 키·서명·본문 문제) — 행은 두고 기록만 */
  | "rejected";

export function classifyPushStatus(status: number): PushOutcome {
  if (status === 200 || status === 201 || status === 202) return "sent";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "retry";
  return "rejected";
}

/** 시간대의 현재 시(0–23). 시간대 이름이 틀리면 null. */
export function localHour(date: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value;
    const n = hour === undefined ? NaN : Number.parseInt(hour, 10);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  } catch {
    return null;
  }
}

/** 이 구독의 시간대에서 지금이 발송 시(기본 20시)인가. 시간대를 모르면 Asia/Seoul로 본다. */
export function isDueNow(date: Date, tz: string, hour: number = REMINDER_HOUR): boolean {
  const h = localHour(date, tz) ?? localHour(date, "Asia/Seoul");
  return h === hour;
}

/** 길이가 같을 때만 바이트 단위로 비교한다(길이가 다르면 바로 false — 길이는 비밀이 아니다). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = utf8(a);
  const y = utf8(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * 부른 쪽 확인 — pg_cron(x-reminder-secret = REMINDER_CRON_SECRET) 또는 서버 키(Authorization: Bearer <service_role/secret 키>).
 * 비밀값이 서버에 없으면 그 방식은 늘 거절(빈 값끼리 같다고 통과시키지 않는다).
 */
export function callerAuthorized(
  headers: { get(name: string): string | null },
  cronSecret: string | null,
  serverKey: string | null,
): boolean {
  const presented = headers.get(REMINDER_SECRET_HEADER);
  if (cronSecret && cronSecret.length >= 16 && presented && timingSafeEqual(presented, cronSecret)) return true;
  const authorization = headers.get("authorization") ?? headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (serverKey && bearer && timingSafeEqual(bearer, serverKey)) return true;
  return false;
}

/** 진행 결과 요약 — 로그·응답에 숫자만 싣는다. */
export interface SendSummary {
  total: number;
  due: number;
  sent: number;
  gone: number;
  retry: number;
  rejected: number;
  errors: number;
  pruned: number;
}

export function emptySummary(): SendSummary {
  return { total: 0, due: 0, sent: 0, gone: 0, retry: 0, rejected: 0, errors: 0, pruned: 0 };
}

/** 최대 concurrency개씩 동시에 처리한다(순서는 지키지 않는다). */
export async function forEachConcurrent<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
