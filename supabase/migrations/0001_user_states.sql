-- 온맘 웹 — 사용자별 앱 상태(건강 기록 포함) 저장. Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run.
-- 설명: docs/SUPABASE_SETUP.md
--
-- 한 계정 = 한 행. state에는 웹 앱 상태 JSON 전체(프로필·산모수첩·증상 기록·기분 답·기록장)가 들어간다 — 민감정보(건강).
-- 행 수준 보안(RLS): 로그인한 본인(auth.uid() = user_id)만 자기 행을 읽고 쓴다. 공개 키(anon)로는 아무것도 못 본다.
-- updated_at은 서버가 매긴다 — 웹은 "내가 마지막으로 본 updated_at일 때만 바꾸기"로 다른 기기의 쓰기를 덮지 않는다.

-- 1) 표 -----------------------------------------------------------------------

create table if not exists public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  -- 상태는 JSON 객체여야 하고, 한 사람 몫으로 5MB를 넘지 않는다(잘못된·과한 쓰기 방지)
  constraint user_states_state_is_object check (jsonb_typeof(state) = 'object'),
  constraint user_states_state_size check (pg_column_size(state) <= 5 * 1024 * 1024),
  constraint user_states_schema_version_positive check (schema_version >= 1)
);

comment on table public.user_states is '온맘 웹 사용자별 앱 상태(건강 기록 포함 — 민감정보). 본인만 접근(RLS).';

-- 2) 권한 — 로그인한 사용자(authenticated)만. 공개 키(anon)에는 아무 권한도 주지 않는다 ----------------
-- (2026-05-30 이후 새 프로젝트는 public 표에 권한을 자동으로 주지 않는다 — 여기서 명시한다)

revoke all on table public.user_states from public, anon, authenticated;
grant select, insert, update, delete on table public.user_states to authenticated;

-- 3) 행 수준 보안 --------------------------------------------------------------

alter table public.user_states enable row level security;

drop policy if exists "user_states: 본인 행 읽기" on public.user_states;
create policy "user_states: 본인 행 읽기" on public.user_states
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_states: 본인 행 만들기" on public.user_states;
create policy "user_states: 본인 행 만들기" on public.user_states
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_states: 본인 행 바꾸기" on public.user_states;
create policy "user_states: 본인 행 바꾸기" on public.user_states
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_states: 본인 행 지우기" on public.user_states;
create policy "user_states: 본인 행 지우기" on public.user_states
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 4) updated_at — 만들 때·바꿀 때마다 서버 시각으로(브라우저가 보낸 값은 무시) ------------------------

create or replace function public.user_states_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_states_set_updated_at on public.user_states;
create trigger user_states_set_updated_at
  before insert or update on public.user_states
  for each row execute function public.user_states_set_updated_at();

-- 5) 계정 삭제 — 로그인한 본인의 행과 로그인 계정(auth.users)을 지운다 ---------------------------------
-- 웹 [계정 삭제]가 부른다(supabase.rpc('delete_my_account')). 성공했을 때만 브라우저 데이터를 지운다.
-- SECURITY DEFINER: auth.users를 지우려면 만든 사람(postgres) 권한이 필요하다. search_path를 비워 이름 바꿔치기를 막는다.
-- 카카오 쪽 "연결 끊기"는 하지 않는다(카카오 Admin 키가 필요 — 사용자는 카카오 계정 설정에서 끊을 수 있다).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.user_states where user_id = uid;
  delete from auth.users where id = uid; -- 세션·identity도 함께 지워진다
end;
$$;

-- Supabase는 public 함수에 기본으로 anon 실행 권한을 준다 — 막고 로그인한 사용자에게만 연다.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
