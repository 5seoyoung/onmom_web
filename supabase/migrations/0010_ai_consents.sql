-- 온맘 웹 — AI 상담을 공개하기 전 안전장치: AI 답변 국외 이전 동의의 서버 기록 + 한도 손보기. 설명: docs/SUPABASE_FUNCTIONS.md
--   1) public.ai_consents(동의 기록 — 함수 chat이 확인) 2) llm_consume_quota 다섯 인자판(게스트 한도·전체 1시간 상한) 3) llm_refund_quota(돌려주기)
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
--
-- 왜(1): AI 상담·약물 체크의 국외 이전(Anthropic, 미국) 동의는 지금까지 브라우저(localStorage)에만 있었고, Edge Function chat은 로그인만
--   확인했다. 웹을 거치지 않고 함수를 직접 부르면 동의 없이 질문이 국외로 나갈 수 있었다. 이제 동의를 서버에 남기고 함수가 확인한다.
-- 1) public.ai_consents — 사용자당 한 행: 동의한 판(version)과 동의 시각(accepted_at). 질문·답·건강 정보는 없다.
--    웹이 [동의하고 계속하기] 뒤 서버 세션이 있을 때 쓴다(upsert — 같은 사용자는 판·시각만 바뀐다. src/features/chat/aiConsentRecord.ts).
--    함수 chat은 로그인 확인 뒤, 한도를 쓰거나 LLM을 부르기 전에 서버 키(service_role)로 "방금 확인한 사용자 id"의 행만 읽고,
--    판이 지금 판(supabase/functions/_shared/aiConsent.ts AI_CONSENT_VERSION)이 아니면 403 ai_consent_required로 끝낸다.
-- 권한: 로그인한 사용자(카카오·익명 게스트 = authenticated)가 본인 행만 읽고·만들고·바꾼다(RLS). 지우기는 두지 않는다 —
--   계정을 지우면(delete_my_account·게스트 자동 정리 → auth.users) on delete cascade로 함께 지워진다. 공개 키(anon)는 아무것도 못 한다.
-- 처리방침·동의 문구: "동의한 내용과 일시"(features/privacy/dataItems.ts SETTING_ITEMS, 보유 = 계정을 삭제할 때까지)에 든다.
--   2)·3)은 새 정보를 모으지 않는다 — llm_usage(사용자 id·시각, 2일 보관)를 그대로 쓴다.
-- 먼저 0003(llm_usage — AI 상담 이용 기록)이 있어야 한다 — 아래 0)이 확인한다.
-- 번호: 0009(관리자 접근 기록)가 이미 운영에 적용돼 있어 그 뒤 번호다(db push는 마지막으로 적용한 번호보다 앞선 새 파일을 거절한다).
--   0008은 쓰지 않는다. 0009와는 서로 건드리는 것이 없다.
-- 여러 번 실행해도 같은 결과(표는 있으면 건너뛰고, 제약·정책은 지우고 다시 만들고, 함수는 새로 만든다). 확장(create extension)은
-- 부르지 않는다(0006 머리말). 이미 있는 행·함수(0003 llm_consume_quota 넷 인자)는 바꾸지 않는다. 비밀값·운영 주소는 이 파일에 없다.
-- 파일 하나가 트랜잭션 하나다 — 중간에 실패하면 아무것도 바뀌지 않는다. 맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다(0009와 같다).

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.llm_usage') is null then
    raise exception 'public.llm_usage가 없습니다 — 0003_llm_usage.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) AI 국외 이전 동의 기록 --------------------------------------------------------------------------------

create table if not exists public.ai_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 동의한 판(예: web-2026-09-28.2) — 웹·함수가 같은 값(_shared/aiConsent.ts AI_CONSENT_VERSION)을 쓴다
  version text not null,
  -- 동의 시각 — 웹이 [동의하고 계속하기]를 누른 브라우저 시각을 보낸다(0001 consent_accepted_at과 같은 방식). 없으면 서버 시각.
  accepted_at timestamptz not null default now()
);

-- 판 글자 수(잘못된·과한 쓰기 방지) — 표를 먼저 만든 적이 있어도 같은 제약이 하나만 있게 지우고 다시 만든다
alter table public.ai_consents drop constraint if exists ai_consents_version_length;
alter table public.ai_consents add constraint ai_consents_version_length
  check (char_length(version) between 1 and 64);

comment on table public.ai_consents is
  '온맘 웹 AI 답변 국외 이전(Anthropic) 동의 기록 — 사용자당 한 행(판·동의 시각). 질문·답 없음. 본인 행만(RLS), 함수 chat은 service_role로 읽음.';
comment on column public.ai_consents.version is '동의한 AI 국외 이전 동의 글자의 판(supabase/functions/_shared/aiConsent.ts AI_CONSENT_VERSION).';
comment on column public.ai_consents.accepted_at is '그 동의를 받은 시각(브라우저 시각).';

-- 권한 — 로그인한 사용자는 읽기·만들기·바꾸기(upsert)만, 공개 키(anon)는 없음. 함수 chat(service_role)은 읽기만.
-- (2026-05-30 이후 새 프로젝트는 public 표에 권한을 자동으로 주지 않는다 — 0001처럼 여기서 명시한다)
revoke all on table public.ai_consents from public, anon, authenticated, service_role;
grant select, insert, update on table public.ai_consents to authenticated;
grant select on table public.ai_consents to service_role;

alter table public.ai_consents enable row level security;

drop policy if exists "ai_consents: 본인 행 읽기" on public.ai_consents;
create policy "ai_consents: 본인 행 읽기" on public.ai_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_consents: 본인 행 만들기" on public.ai_consents;
create policy "ai_consents: 본인 행 만들기" on public.ai_consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_consents: 본인 행 바꾸기" on public.ai_consents;
create policy "ai_consents: 본인 행 바꾸기" on public.ai_consents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2) AI 상담 한도 — 게스트 한도·전체 1시간 상한 ----------------------------------------------------------------
-- 왜: 0003은 모든 사용자에게 같은 1시간 한도(기본 30)와 전체 하루 상한(기본 500)만 두었다. 익명 게스트는 버튼 한 번으로 새로 만들 수
--   있어 같은 한도면 남용이 쉽고, 하루 상한은 한두 시간 만에 다 쓰일 수 있었다.
-- 무엇이 바뀌나: 같은 이름에 인자를 하나 더 받는 함수(전체 1시간 상한 p_global_hourly_limit)를 새로 만든다. 게스트 한도는 함수 chat이
--   p_user_limit에 게스트 값(CHAT_GUEST_HOURLY_LIMIT, 기본 5)을 넣어 고른다 — 이 함수는 그대로 "그 사용자의 1시간 한도"로 센다.
--   순서: 사용자별 잠금 → 전체 잠금 → 2일 지난 행 삭제 → 사용자 1시간 → 전체 1시간 → 전체 24시간 → 한 줄 기록.
--   전체 상한은 서로 다른 사용자의 동시 요청이 함께 넘지 않게 전체 잠금(트랜잭션이 끝나면 풀린다)으로 줄 세운다. 잠금은 늘 사용자 → 전체
--   순서로만 잡으므로(아래 3)의 돌려주기는 사용자 잠금만) 서로 기다리다 멈추지 않는다.
-- 0003의 인자 넷짜리 함수는 지우지 않는다: 이 파일이 적용된 뒤 새 함수 코드가 배포되기 전까지(워크플로의 db push → 함수 배포 사이)
--   예전 함수 코드가 그것을 부른다. 새 코드는 다섯 인자짜리만 부른다. 둘 다 service_role만 부를 수 있다.
-- 돌려주는 값은 0003과 같다: 'ok' | 'user_limit' | 'global_limit'(전체 1시간·하루 상한 모두 — 함수는 503 busy).

create or replace function public.llm_consume_quota(
  p_user_id uuid,
  p_user_limit integer,
  p_window_seconds integer,
  p_global_daily_limit integer,
  p_global_hourly_limit integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  total integer;
begin
  if p_user_id is null
    or p_user_limit is null or p_user_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
    or p_global_daily_limit is null or p_global_daily_limit < 1
    or p_global_hourly_limit is null or p_global_hourly_limit < 1 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  -- 같은 사용자의 동시 요청(0003·아래 돌려주기와 같은 키) → 서비스 전체(전체 상한) 순서로 잠근다
  perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:' || p_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:global', 0));

  -- 오래된 기록 정리(개인정보 최소화) — 한도 계산에는 하루치만 필요하다
  delete from public.llm_usage where created_at < now() - interval '2 days';

  select count(*) into used
  from public.llm_usage
  where user_id = p_user_id
    and created_at > now() - make_interval(secs => p_window_seconds);
  if used >= p_user_limit then
    return 'user_limit';
  end if;

  select count(*) into total
  from public.llm_usage
  where created_at > now() - interval '1 hour';
  if total >= p_global_hourly_limit then
    return 'global_limit';
  end if;

  select count(*) into total
  from public.llm_usage
  where created_at > now() - interval '1 day';
  if total >= p_global_daily_limit then
    return 'global_limit';
  end if;

  insert into public.llm_usage (user_id) values (p_user_id);
  return 'ok';
end;
$$;

comment on function public.llm_consume_quota(uuid, integer, integer, integer, integer) is
  'AI 상담 한도 확인 + 한 번 기록(사용자 1시간·전체 1시간·전체 하루). Edge Function chat(service_role)만 부른다.';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막고 service_role에게만 연다.
revoke execute on function public.llm_consume_quota(uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.llm_consume_quota(uuid, integer, integer, integer, integer) to service_role;

-- 3) 한도 돌려주기 — LLM이 답을 만들지 않은 실패 -----------------------------------------------------------------
-- 왜: 한도는 LLM을 부르기 직전에 쓴다(2). Anthropic 연결 실패·혼잡(429·5xx)·키/모델 문제처럼 답을 만들지 않은(비용이 들지 않은)
--   실패까지 세면, 이용자는 받지 못한 답으로 한도를 잃는다. 함수 chat이 그런 실패일 때만 부른다(_shared/chat.ts CHAT_REFUNDABLE_LLM_ERRORS).
--   시간 초과·요청 거절·알 수 없는 오류·거절 답·잘린 답에는 부르지 않는다(답을 만들었을 수 있다 — 비용).
-- 무엇을 지우나: 그 사용자의 가장 최근 기록 한 줄(10분 안 — LLM 호출은 길어야 1분 남짓). 기록에는 사용자 id·시각만 있어 어느 줄을
--   지워도 같은 한 번이다. 한 번 부르면 많아야 한 줄. 같은 사용자의 한도 확인(2)과 같은 잠금으로 줄 세운다.
-- 돌려주는 값: 지웠으면 true, 지울 줄이 없으면 false. 사용자 id·시각은 어디에도 남기지 않는다.

create or replace function public.llm_refund_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund_id bigint;
begin
  if p_user_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:' || p_user_id::text, 0));

  select u.id into refund_id
  from public.llm_usage u
  where u.user_id = p_user_id
    and u.created_at > now() - interval '10 minutes'
  order by u.created_at desc, u.id desc
  limit 1;
  if refund_id is null then
    return false;
  end if;

  delete from public.llm_usage where id = refund_id;
  return true;
end;
$$;

comment on function public.llm_refund_quota(uuid) is
  'AI 상담 한도 한 번 돌려주기(그 사용자의 10분 안 가장 최근 기록 한 줄 삭제) — LLM이 답을 만들지 않은 실패에만. Edge Function chat(service_role)만 부른다.';

revoke execute on function public.llm_refund_quota(uuid) from public, anon, authenticated;
grant execute on function public.llm_refund_quota(uuid) to service_role;

-- 4) PostgREST 스키마 다시 읽기 — 새 표(ai_consents)·새 함수(llm_consume_quota 다섯 인자·llm_refund_quota)를 함수 chat과 웹이 바로
--   부를 수 있게. Supabase는 DDL 뒤에 스스로도 다시 읽지만, 이 파일의 변경은 그것에 기대지 않는다(0009와 같다). 알림은 commit 때 간다.

notify pgrst, 'reload schema';
