-- 온맘 웹 — AI 상담(Edge Function "chat")의 사용 한도. Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run해도 되고,
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다.
-- 설명: docs/SUPABASE_FUNCTIONS.md
--
-- 무엇을 남기나: "누가(사용자 id) 언제 AI에 한 번 물었다"만. 질문·답·컨텍스트는 어디에도 저장하지 않는다.
-- 왜: 한 사람이 1시간에 보낼 수 있는 횟수(기본 30)와 서비스 전체의 하루 상한(기본 500 — 익명 계정을 여럿 만들어 비용을 키우는 것을 막는다)을 센다.
-- 보관: 한도 계산에 필요한 하루치만 쓰고, 2일이 지난 행은 함수가 부를 때마다 지운다. 계정을 지우면(delete_my_account) 함께 지워진다.
-- 권한: 브라우저(anon·authenticated)는 표도 함수도 쓸 수 없다. Edge Function이 service_role로만 부른다.
-- 여러 번 실행해도 된다(있으면 건너뛰고, 함수는 새로 만든다).

-- 1) 표 — 브라우저에서는 읽지도 쓰지도 못한다 ---------------------------------------------------------

create table if not exists public.llm_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.llm_usage is '온맘 웹 AI 상담 호출 기록(사용자 id·시각만 — 질문·답 없음). 한도 계산용, 2일 뒤 삭제. 브라우저 접근 없음.';

create index if not exists llm_usage_user_created_idx on public.llm_usage (user_id, created_at);
create index if not exists llm_usage_created_idx on public.llm_usage (created_at);

revoke all on table public.llm_usage from public, anon, authenticated;
alter table public.llm_usage enable row level security;
-- 정책을 일부러 만들지 않는다 — RLS가 켜져 있고 정책이 없으면 브라우저(anon·authenticated)는 한 행도 못 보고 못 쓴다.

-- 2) 한도 확인 + 한 번 기록 -------------------------------------------------------------------------
-- Edge Function chat이 LLM을 부르기 직전에 부른다(supabase/functions/chat/index.ts).
-- 돌려주는 값: 'ok'(기록함 — 불러도 된다) | 'user_limit'(이 사용자가 창 안에서 한도를 다 씀) | 'global_limit'(서비스 전체 하루 상한)
-- 같은 사용자의 동시 요청이 함께 한도를 넘지 않게 사용자별 잠금(트랜잭션이 끝나면 풀린다)으로 줄 세운다.
-- SECURITY DEFINER: 표에 service_role 권한을 따로 주지 않고 이 함수로만 쓰게 한다. search_path를 비워 이름 바꿔치기를 막는다.

create or replace function public.llm_consume_quota(
  p_user_id uuid,
  p_user_limit integer,
  p_window_seconds integer,
  p_global_daily_limit integer
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
    or p_global_daily_limit is null or p_global_daily_limit < 1 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('onmom.llm_usage:' || p_user_id::text, 0));

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
  where created_at > now() - interval '1 day';
  if total >= p_global_daily_limit then
    return 'global_limit';
  end if;

  insert into public.llm_usage (user_id) values (p_user_id);
  return 'ok';
end;
$$;

comment on function public.llm_consume_quota(uuid, integer, integer, integer) is
  'AI 상담 한도 확인 + 한 번 기록. Edge Function chat(service_role)만 부른다.';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막고 service_role에게만 연다.
revoke execute on function public.llm_consume_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.llm_consume_quota(uuid, integer, integer, integer) to service_role;
