// 웹 푸시 암호화·서명(supabase/functions/_shared/reminders.ts) — RFC 8291 부록 A 시험 벡터와 바이트 단위로 같은지, VAPID 서명이 검증되는지,
// 키 생성 스크립트(scripts/generate-vapid.mjs)의 출력이 함수가 받는 형식인지. Node의 Web Crypto로 돌린다(함수와 같은 API).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import content from "@/content";
import {
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  callerAuthorized,
  classifyPushStatus,
  createVapidAuthorization,
  encryptWebPushPayload,
  importVapidKeys,
  isDueNow,
  isValidVapidSubject,
  localHour,
  p256PublicKeyFromPrivate,
  parseSubscriptionRecord,
  pushAudience,
  REMINDER_HOUR,
  REMINDER_MINUTE,
  REMINDER_NOTIFICATION,
  reminderPayload,
  timingSafeEqual,
  utf8,
} from "../../../supabase/functions/_shared/reminders";

// RFC 8291 Appendix A — 전체 예시(https://www.rfc-editor.org/rfc/rfc8291#appendix-A)
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** 수신 쪽(브라우저) 복호화 — 헤더의 salt·송신 공개 키로 같은 키를 이끌어 낸다(RFC 8291 §3, RFC 8188 §2). 무작위 키 경로의 왕복 확인용. */
async function decrypt(message: Uint8Array, uaPrivateJwk: JsonWebKey, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<string> {
  const salt = message.subarray(0, 16);
  const rs = new DataView(message.buffer, message.byteOffset + 16, 4).getUint32(0);
  const idlen = message[20];
  const asPublic = message.subarray(21, 21 + idlen);
  const ciphertext = message.subarray(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);

  const uaKey = await crypto.subtle.importKey("jwk", uaPrivateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const asKey = await crypto.subtle.importKey("raw", new Uint8Array(asPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, uaKey, 256);
  const hkdf = async (ikm: ArrayBuffer | Uint8Array, s: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey("raw", new Uint8Array(ikm), "HKDF", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(s), info: new Uint8Array(info) }, k, len * 8);
  };
  const info = new Uint8Array([...utf8("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(ecdh, authSecret, info, 32);
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, new Uint8Array(ciphertext)));
  expect(record[record.length - 1]).toBe(2); // 마지막 레코드 구분자
  return new TextDecoder().decode(record.subarray(0, record.length - 1));
}

describe("base64url · P-256", () => {
  it("base64url 왕복(패딩 없음)", () => {
    for (const s of ["", "a", "ab", "abc", "abcd", "온맘"]) {
      expect(new TextDecoder().decode(base64UrlDecode(base64UrlEncode(utf8(s))))).toBe(s);
    }
    expect(base64UrlEncode(base64UrlDecode(RFC.uaPublic))).toBe(RFC.uaPublic);
    expect(base64UrlEncode(new Uint8Array([251, 255]))).toBe("-_8");
  });

  it("비밀 키 → 공개 키 스칼라 곱이 RFC 8291 부록 A의 두 키 쌍과 같다", () => {
    expect(base64UrlEncode(p256PublicKeyFromPrivate(base64UrlDecode(RFC.uaPrivate)))).toBe(RFC.uaPublic);
    expect(base64UrlEncode(p256PublicKeyFromPrivate(base64UrlDecode(RFC.asPrivate)))).toBe(RFC.asPublic);
    expect(() => p256PublicKeyFromPrivate(new Uint8Array(32))).toThrow(); // d = 0
    expect(() => p256PublicKeyFromPrivate(new Uint8Array(31))).toThrow();
  });
});

describe("RFC 8291 본문 암호화", () => {
  it("부록 A 시험 벡터와 바이트 단위로 같다(송신 키·salt 고정)", async () => {
    const out = await encryptWebPushPayload(utf8(RFC.plaintext), RFC.uaPublic, RFC.auth, {
      senderPrivateKey: base64UrlDecode(RFC.asPrivate),
      salt: base64UrlDecode(RFC.salt),
    });
    expect(base64UrlEncode(out)).toBe(RFC.message);
  });

  it("무작위 송신 키·salt로 암호화한 것을 수신 쪽 절차로 되돌리면 같은 본문 — 매번 다른 암호문", async () => {
    const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const uaPrivateJwk = await crypto.subtle.exportKey("jwk", ua.privateKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const payload = reminderPayload();
    const a = await encryptWebPushPayload(payload, base64UrlEncode(uaPublic), base64UrlEncode(authSecret));
    const b = await encryptWebPushPayload(payload, base64UrlEncode(uaPublic), base64UrlEncode(authSecret));
    expect(base64UrlEncode(a)).not.toBe(base64UrlEncode(b));
    expect(await decrypt(a, uaPrivateJwk, uaPublic, authSecret)).toBe(new TextDecoder().decode(payload));
    expect(await decrypt(b, uaPrivateJwk, uaPublic, authSecret)).toBe(new TextDecoder().decode(payload));
  });

  it("구독 키 모양이 틀리면 보내지 않는다", async () => {
    await expect(encryptWebPushPayload(utf8("x"), RFC.asPrivate, RFC.auth)).rejects.toThrow();
    await expect(encryptWebPushPayload(utf8("x"), RFC.uaPublic, "BTBZ")).rejects.toThrow();
  });
});

describe("VAPID (RFC 8292)", () => {
  it("비밀 키만으로 서명 키·공개 키를 만들고, 헤더의 JWT가 그 공개 키로 검증된다(aud = 푸시 서비스 origin, exp ≤ 24h)", async () => {
    const keys = await importVapidKeys(RFC.asPrivate);
    expect(keys.publicKeyB64).toBe(RFC.asPublic);
    const now = Date.UTC(2026, 8, 28, 11, 0, 0);
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123:APA91b";
    const header = await createVapidAuthorization(keys, pushAudience(endpoint), "mailto:hello@example.com", now);
    const m = /^vapid t=([^,]+), k=([^,]+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, jwt, k] = m!;
    expect(k).toBe(RFC.asPublic);

    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(c))) as { aud: string; exp: number; sub: string };
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:hello@example.com");
    expect(claims.exp).toBe(Math.floor(now / 1000) + 12 * 60 * 60);

    const publicKey = await crypto.subtle.importKey("raw", base64UrlDecode(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, base64UrlDecode(s), utf8(`${h}.${c}`));
    expect(ok).toBe(true);
    expect(base64UrlDecode(s).length).toBe(64); // r||s
  });

  it("exp는 24시간을 넘지 않는다 · subject는 mailto:/https:만", async () => {
    const keys = await importVapidKeys(RFC.asPrivate);
    const now = 1_700_000_000_000;
    const header = await createVapidAuthorization(keys, "https://push.example", "https://onmom.example", now, 99 * 60 * 60);
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(header.split(" ")[1].slice(2).split(".")[1]))) as { exp: number };
    expect(claims.exp).toBe(Math.floor(now / 1000) + 24 * 60 * 60);
    expect(isValidVapidSubject("mailto:a@b.c")).toBe(true);
    expect(isValidVapidSubject("https://5seoyoung.github.io/onmom_web/")).toBe(true);
    expect(isValidVapidSubject("a@b.c")).toBe(false);
    expect(isValidVapidSubject("")).toBe(false);
  });

  it("scripts/generate-vapid.mjs — 출력한 비밀 키로 만든 공개 키가 출력한 공개 키와 같다(파일을 쓰지 않는다)", async () => {
    const script = fileURLToPath(new URL("../../../scripts/generate-vapid.mjs", import.meta.url));
    const out = execFileSync(process.execPath, [script], { encoding: "utf8" });
    const publicKey = /NEXT_PUBLIC_VAPID_PUBLIC_KEY=(\S+)/.exec(out)?.[1];
    const privateKey = /VAPID_PRIVATE_KEY=(\S+)/.exec(out)?.[1];
    expect(publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const keys = await importVapidKeys(privateKey!);
    expect(keys.publicKeyB64).toBe(publicKey);
  });
});

describe("요청 · 응답 · 시각 · 부른 쪽 확인", () => {
  const sub = { id: "1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: RFC.uaPublic, auth: RFC.auth, tz: "Asia/Seoul" };

  it("알림 문구 = content.json notification.daily_reminder, 시각 20:00", () => {
    expect(REMINDER_NOTIFICATION.title).toBe(content.notification.daily_reminder.title);
    expect(REMINDER_NOTIFICATION.body).toBe(content.notification.daily_reminder.body);
    expect(REMINDER_HOUR).toBe(content.notification.daily_reminder.hour);
    expect(REMINDER_MINUTE).toBe(content.notification.daily_reminder.minute);
    expect(JSON.parse(new TextDecoder().decode(reminderPayload()))).toEqual({
      type: "daily_reminder",
      title: REMINDER_NOTIFICATION.title,
      body: REMINDER_NOTIFICATION.body,
    });
  });

  it("푸시 요청 — aes128gcm, TTL, Urgency, Topic, VAPID 헤더, 리다이렉트는 따라가지 않는다(manual)", () => {
    const body = new Uint8Array([1, 2, 3]);
    const req = buildPushRequest(sub, body, "vapid t=x, k=y");
    expect(req.url).toBe(sub.endpoint);
    expect(req.method).toBe("POST");
    expect(req.headers).toEqual({
      TTL: "14400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": "3",
      Authorization: "vapid t=x, k=y",
      Urgency: "normal",
      Topic: "onmom-daily",
    });
    expect(req.body).toBe(body);
    expect(req.redirect).toBe("manual");
  });

  it("응답 분류 — 404·410은 구독 삭제, 429·5xx는 다음에, 3xx(따라가지 않은 리다이렉트)·그 밖 4xx는 기록만", () => {
    expect(classifyPushStatus(201)).toBe("sent");
    expect(classifyPushStatus(200)).toBe("sent");
    expect(classifyPushStatus(404)).toBe("gone");
    expect(classifyPushStatus(410)).toBe("gone");
    expect(classifyPushStatus(429)).toBe("retry");
    expect(classifyPushStatus(503)).toBe("retry");
    expect(classifyPushStatus(400)).toBe("rejected");
    expect(classifyPushStatus(403)).toBe("rejected");
    for (const redirect of [301, 302, 303, 307, 308]) expect(classifyPushStatus(redirect)).toBe("rejected");
    expect(classifyPushStatus(0)).toBe("rejected"); // opaqueredirect(브라우저식 manual) — Deno는 3xx를 그대로 준다
  });

  it("행 읽기 — 모양이 틀리거나 받는 푸시 서비스 밖이면 null, 시간대 없으면 Asia/Seoul", () => {
    expect(parseSubscriptionRecord(sub)).toEqual(sub);
    expect(parseSubscriptionRecord({ ...sub, tz: "" })?.tz).toBe("Asia/Seoul");
    expect(parseSubscriptionRecord({ ...sub, endpoint: "http://fcm.googleapis.com/fcm/send/abc" })).toBeNull();
    expect(parseSubscriptionRecord({ ...sub, endpoint: "https://push.example/x" })).toBeNull();
    expect(parseSubscriptionRecord({ ...sub, endpoint: "https://169.254.169.254/latest" })).toBeNull();
    expect(parseSubscriptionRecord({ ...sub, auth: "short" })).toBeNull();
    expect(parseSubscriptionRecord(null)).toBeNull();
  });

  it("11:00 UTC는 서울 20시 — 서울·도쿄는 발송, 뉴욕은 아님, 모르는 시간대는 서울로 본다", () => {
    const at = new Date("2026-09-28T11:00:00Z");
    expect(localHour(at, "Asia/Seoul")).toBe(20);
    expect(localHour(at, "America/New_York")).toBe(7);
    expect(localHour(at, "Not/AZone")).toBeNull();
    expect(isDueNow(at, "Asia/Seoul")).toBe(true);
    expect(isDueNow(at, "Asia/Tokyo")).toBe(true);
    expect(isDueNow(at, "America/New_York")).toBe(false);
    expect(isDueNow(at, "Not/AZone")).toBe(true);
    expect(isDueNow(new Date("2026-09-28T12:00:00Z"), "Asia/Seoul")).toBe(false);
    expect(localHour(new Date("2026-09-28T15:00:00Z"), "Asia/Seoul")).toBe(0); // 자정은 0(24가 아님)
  });

  it("부른 쪽 — 공유 비밀(x-reminder-secret) 또는 서버 키 Bearer. 비밀값이 서버에 없으면 그 방식은 늘 거절", () => {
    const secret = "s".repeat(32);
    const headers = (h: Record<string, string>) => new Headers(h);
    expect(callerAuthorized(headers({ "x-reminder-secret": secret }), secret, null)).toBe(true);
    expect(callerAuthorized(headers({ "x-reminder-secret": "wrong" }), secret, null)).toBe(false);
    expect(callerAuthorized(headers({ "x-reminder-secret": "" }), "", null)).toBe(false);
    expect(callerAuthorized(headers({ "x-reminder-secret": "short" }), "short", null)).toBe(false); // 16자 미만 비밀은 쓰지 않는다
    expect(callerAuthorized(headers({ Authorization: "Bearer sb_secret_key" }), null, "sb_secret_key")).toBe(true);
    expect(callerAuthorized(headers({ Authorization: "Bearer sb_publishable_key" }), null, "sb_secret_key")).toBe(false);
    expect(callerAuthorized(headers({ Authorization: "Bearer " }), null, "")).toBe(false);
    expect(callerAuthorized(headers({}), secret, "k")).toBe(false);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});
