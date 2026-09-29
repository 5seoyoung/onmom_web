-- 온맘 웹 — 매일 리마인더(웹 푸시): 구독 표 + 매일 발송 예약(pg_cron → Edge Function send-reminders). 설명: docs/PWA_AND_REMINDERS.md
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
--
-- 무엇을 남기나: 기기(브라우저)마다 푸시 끝점(endpoint)·브라우저가 만든 암호화 키(p256dh·auth)·시간대·시각. 건강 데이터는 없다.
--   iOS 앱은 기기 안 로컬 알림이라 서버가 없었다(NotificationManager.swift). 웹 푸시는 서버가 보내야 하므로 이 표가 필요하다.
-- 권한: 로그인한 사용자(카카오·익명 게스트 = authenticated)가 본인 행만 읽고 쓴다(RLS). 발송 함수는 service_role로 모든 행을 읽고
--   푸시 서비스가 404/410으로 답한 행(구독 해지·만료)을 지운다. 계정을 지우면(delete_my_account → auth.users) 함께 지워진다(on delete cascade).
-- 예약: 매일 11:00 UTC = 20:00 KST(content.json notification.daily_reminder hour 20). 함수는 행의 시간대로 "지금 20시인가"를 다시 확인한다.
-- 비밀값은 이 파일에 없다 — 발송 함수를 부를 때 쓰는 값은 Vault에서 실행 시점에 읽는다(아래 3). 여러 번 실행해도 같은 결과.
-- 켜는 순서: 이 파일이 먼저 적용돼도 예약은 Vault에 reminder_cron_secret이 생기기 전까지 아무 요청도 보내지 않는다(아래 3) —
--   함수 배포·비밀값을 마친 뒤 Vault 값을 넣는 것이 "켜기"다(docs/PWA_AND_REMINDERS.md §5).
-- 남용 방지: 끝점은 브라우저 회사의 푸시 서비스만(check 제약), 사용자당 기기 10개까지(트리거) — 발송 함수가 아무 주소로나 요청하지 않게.

-- 1) 표 ------------------------------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 푸시 서비스가 준 끝점 주소. 기기(브라우저)마다 하나 — 같은 끝점을 다시 보내면 키·시간대만 갱신한다(upsert on conflict).
  endpoint text not null unique,
  -- 브라우저가 만든 구독 키(RFC 8291): P-256 공개 키(65바이트)·인증 비밀(16바이트)의 base64url
  p256dh text not null,
  auth text not null,
  -- 브라우저의 IANA 시간대(예: Asia/Seoul) — 발송 함수가 "그 기기의 20시"를 판단한다
  tz text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 받는 푸시 서비스만: FCM(Chrome·Samsung 인터넷 등) · Mozilla(Firefox) · WNS(Edge) · Apple(Safari). https, 포트·사용자 정보 없음.
  -- src/features/pwa/reminderModel.ts·supabase/functions/_shared/reminders.ts의 PUSH_ENDPOINT_PATTERN과 같은 글자(pwa.test.ts가 비교). ~* = 대소문자 무시
  constraint push_subscriptions_endpoint_check check (
    endpoint ~* '^https:\/\/(?:[a-z0-9-]+\.)*(?:fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\/\S+$'
    and length(endpoint) <= 2048
  ),
  constraint push_subscriptions_p256dh_check check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  constraint push_subscriptions_auth_check check (auth ~ '^[A-Za-z0-9_-]{20,30}$'),
  constraint push_subscriptions_tz_check check (tz ~ '^[A-Za-z0-9_+/-]{1,64}$')
);

comment on table public.push_subscriptions is
  '온맘 웹 매일 리마인더(웹 푸시) 구독 — 기기마다 한 행(끝점·브라우저 암호화 키·시간대). 건강 데이터 없음. 본인 행만(RLS), 발송 함수는 service_role.';

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- updated_at은 서버가 매긴다
create or replace function public.push_subscriptions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.push_subscriptions_touch();

-- 사용자당 끝점(기기·브라우저) 10개까지 — 휴대폰·태블릿·PC 브라우저 몇 개면 충분하다. 같은 끝점을 다시 저장(upsert)하는 것은 세지 않는다
-- (insert … on conflict do update도 before insert 트리거를 지나므로). 같은 사용자의 동시 저장은 잠금으로 한 줄로 세운다.
create or replace function public.push_subscriptions_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('push_subscriptions:' || new.user_id::text));
  if (
    select count(*) from public.push_subscriptions s
    where s.user_id = new.user_id and s.endpoint <> new.endpoint
  ) >= 10 then
    raise exception 'too many push subscriptions' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_limit on public.push_subscriptions;
create trigger push_subscriptions_limit
  before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_limit();

-- 2) 권한 · 행 수준 보안 — 본인 행만 ------------------------------------------------------------------

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: 본인 행 읽기" on public.push_subscriptions;
create policy "push_subscriptions: 본인 행 읽기" on public.push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions: 본인 행 만들기" on public.push_subscriptions;
create policy "push_subscriptions: 본인 행 만들기" on public.push_subscriptions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions: 본인 행 바꾸기" on public.push_subscriptions;
create policy "push_subscriptions: 본인 행 바꾸기" on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions: 본인 행 지우기" on public.push_subscriptions;
create policy "push_subscriptions: 본인 행 지우기" on public.push_subscriptions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 3) 매일 발송 예약 — pg_cron + pg_net → Edge Function send-reminders --------------------------------------
-- Supabase 문서 "Scheduling Edge Functions"의 방식 그대로: 주소·키는 Vault에서 실행 시점에 읽고(vault.decrypted_secrets), 이 파일에는 없다.
-- 사람이 한 번 넣는 값(docs/PWA_AND_REMINDERS.md "주인이 할 일"):
--   select vault.create_secret('<REMINDER_CRON_SECRET과 같은 긴 무작위 문자열>', 'reminder_cron_secret');   -- 필수. 함수 비밀값 REMINDER_CRON_SECRET과 같은 값
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');                              -- 선택. 없으면 아래 기본 주소
--   select vault.create_secret('<Publishable key>', 'publishable_key');                                    -- 선택. 게이트웨이용 apikey 헤더
-- reminder_cron_secret이 아직 없으면 예약은 돌지만 요청을 보내지 않는다(아래 "from vault.decrypted_secrets … where name = 'reminder_cron_secret'"이
-- 빈 결과) — 함수를 배포하기 전에 이 파일이 먼저 적용돼도 없는 함수(404)·게이트웨이(401)를 매일 두드리지 않는다. 값을 넣는 것이 켜기다.
-- publishable_key가 없으면 apikey 헤더를 아예 싣지 않는다(jsonb_strip_nulls — 빈 헤더를 보내지 않는다).

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- 같은 이름의 예약이 있으면 지우고 다시 만든다(여러 번 실행해도 하나만 남는다)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-send-reminders') then
    perform cron.unschedule('onmom-send-reminders');
  end if;
end;
$$;

-- 매일 11:00 UTC = 20:00 KST. 다른 시간대의 사용자까지 각자의 20시에 보내려면 '0 * * * *'(매시)로 바꾼다 — 함수가 시간대별로 거른다.
select cron.schedule(
  'onmom-send-reminders',
  '0 11 * * *',
  $job$
  select net.http_post(
    url := coalesce(
      (select decrypted_secret from vault.decrypted_secrets where name = 'project_url'),
      'https://movrwmoniopgetdmagon.supabase.co'
    ) || '/functions/v1/send-reminders',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-reminder-secret', cron_secret.decrypted_secret
    )),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 60000
  ) as request_id
  from vault.decrypted_secrets as cron_secret
  where cron_secret.name = 'reminder_cron_secret' and cron_secret.decrypted_secret <> '';
  $job$
);
