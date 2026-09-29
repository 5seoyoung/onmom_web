#!/usr/bin/env node
// VAPID 키 한 쌍 만들기(웹 푸시 — 매일 리마인더). 의존성 없음(node:crypto). 실행: node scripts/generate-vapid.mjs
//
// 출력 두 줄을 각각 넣는다(docs/PWA_AND_REMINDERS.md):
//   공개 키 → GitHub 저장소 Variables: NEXT_PUBLIC_VAPID_PUBLIC_KEY (사이트 번들에 들어가는 공개값)
//   비밀 키 → Supabase Edge Function 비밀값: VAPID_PRIVATE_KEY (절대 저장소·Variables·NEXT_PUBLIC_*에 넣지 않는다)
// 파일에 저장하지 않는다 — 터미널에만 보인다. 형식은 web-push 라이브러리와 같다(공개 키 = 비압축 P-256 65바이트 base64url 87자, 비밀 키 = 32바이트 base64url 43자).
// 키를 바꾸면 기존 구독은 모두 무효가 된다(사용자가 설정에서 다시 켜야 한다).

import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const fromB64 = (s) => Buffer.from(s, "base64url");
const x = fromB64(jwk.x);
const y = fromB64(jwk.y);
const d = fromB64(jwk.d);
if (x.length !== 32 || y.length !== 32 || d.length !== 32) throw new Error("unexpected key size");

const publicKey = Buffer.concat([Buffer.from([0x04]), x, y]).toString("base64url");
const secretKey = d.toString("base64url");
if (publicKey.length !== 87 || !publicKey.startsWith("B") || secretKey.length !== 43) throw new Error("unexpected encoding");

console.log("VAPID 키 한 쌍 — 각 줄을 아래 자리에 넣으세요. 비밀 키는 다시 볼 수 없으니 넣기 전까지만 보관하세요.\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}    # GitHub Variables(공개값)`);
console.log(`VAPID_PRIVATE_KEY=${secretKey}    # Supabase 함수 비밀값(비밀)`);
console.log(`VAPID_PUBLIC_KEY=${publicKey}    # (선택) 함수 비밀값 — 위 공개 키와 같은 값. 어긋남 확인용`);
