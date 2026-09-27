-- 온맘 웹 — 사용자별 앱 상태(건강 기록 포함) 저장. Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run.
-- 설명: docs/SUPABASE_SETUP.md
--
-- 한 계정 = 한 행. state에는 웹 앱 상태 JSON 전체(프로필·산모수첩·증상 기록·기분 답·기록장)가 들어간다 — 민감정보(건강).
-- 계정은 카카오 사용자와 게스트(Supabase 익명 사용자, signInAnonymously) 둘 다다. 익명 사용자도 로그인 역할은 authenticated이고
-- 토큰에 is_anonymous=true가 붙는다 — 아래 정책은 둘을 똑같이 "본인 행만"으로 다룬다(게스트 기록도 동의 뒤 서버에 저장하므로).
-- 게스트가 카카오를 연결(linkIdentity)하면 같은 사용자 id에 카카오가 붙으므로 행도 그대로 이어진다.
-- 행 수준 보안(RLS): 로그인한 본인(auth.uid() = user_id)만 자기 행을 읽고 쓴다. 공개 키(anon)로는 아무것도 못 본다.
-- updated_at은 서버가 매긴다 — 웹은 "내가 마지막으로 본 updated_at일 때만 바꾸기"로 다른 기기의 쓰기를 덮지 않는다.
-- 동의: 웹은 지금 판의 서버 저장 동의(src/domain/consent.ts) 뒤에만 행을 만들고 바꾼다. 동의의 판·시각은 state 안에도 있지만
--   consent_version·consent_accepted_at 칸에도 따로 쓴다 — 관리자가 건강 기록(state)을 열지 않고 동의 현황만 셀 수 있게
--   (supabase/migrations/0002_admin.sql). 쓰기 정책은 동의의 판이 비어 있는 쓰기를 거절한다(서버 쪽 안전장치).
-- 여러 번 실행해도 된다(있으면 건너뛰고, 함수·정책·트리거는 새로 만든다).

-- 1) 표 -----------------------------------------------------------------------

create table if not exists public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  -- 동의의 판(예: web-2026-09-28)·동의 시각 — 웹이 state의 profile.consentVersion·consentAcceptedAt을 그대로 옮겨 쓴다
  consent_version text,
  consent_accepted_at timestamptz,
  -- 상태는 JSON 객체여야 하고, 한 사람 몫으로 5MB를 넘지 않는다(잘못된·과한 쓰기 방지)
  constraint user_states_state_is_object check (jsonb_typeof(state) = 'object'),
  constraint user_states_state_size check (pg_column_size(state) <= 5 * 1024 * 1024),
  constraint user_states_schema_version_positive check (schema_version >= 1)
);

-- 표를 먼저 만든 적이 있으면(이 파일의 예전 판) 동의 칸을 더한다
alter table public.user_states add column if not exists consent_version text;
alter table public.user_states add column if not exists consent_accepted_at timestamptz;

alter table public.user_states drop constraint if exists user_states_consent_version_length;
alter table public.user_states add constraint user_states_consent_version_length
  check (consent_version is null or char_length(consent_version) between 1 and 64);

comment on table public.user_states is '온맘 웹 사용자별 앱 상태(건강 기록 포함 — 민감정보). 본인만 접근(RLS). 카카오·게스트(익명) 사용자 모두.';
comment on column public.user_states.consent_version is '사용자가 동의한 서버 저장 동의 문구의 판(웹 src/domain/consent.ts). 관리자 집계용 — state를 열지 않고 센다.';
comment on column public.user_states.consent_accepted_at is '그 동의를 받은 시각(브라우저 시각).';

-- 관리자 집계(최근 7일 기록 갱신 수·동의 판별 수)용 — 행 수는 사용자 수만큼이라 작지만 전체 훑기를 피한다
create index if not exists user_states_updated_at_idx on public.user_states (updated_at);
create index if not exists user_states_consent_version_idx on public.user_states (consent_version);

-- 2) 권한 — 로그인한 사용자(authenticated)만. 공개 키(anon)에는 아무 권한도 주지 않는다 ----------------
-- (2026-05-30 이후 새 프로젝트는 public 표에 권한을 자동으로 주지 않는다 — 여기서 명시한다)

revoke all on table public.user_states from public, anon, authenticated;
grant select, insert, update, delete on table public.user_states to authenticated;

-- 3) 행 수준 보안 --------------------------------------------------------------
-- 카카오 사용자와 게스트(익명 사용자)를 구분하지 않는다 — 둘 다 authenticated이고, 자기 행만 본다.
-- 만들기·바꾸기는 동의의 판이 있을 때만(consent_version is not null). 웹은 지금 판의 동의 전에는 쓰지 않으므로 평소에는 걸리지 않고,
-- 웹에 버그가 있거나 누가 API를 직접 불러도 동의 표시 없는 건강 기록이 서버에 쌓이지 않게 한다.

alter table public.user_states enable row level security;

drop policy if exists "user_states: 본인 행 읽기" on public.user_states;
create policy "user_states: 본인 행 읽기" on public.user_states
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_states: 본인 행 만들기" on public.user_states;
create policy "user_states: 본인 행 만들기" on public.user_states
  for insert to authenticated
  with check ((select auth.uid()) = user_id and consent_version is not null);

drop policy if exists "user_states: 본인 행 바꾸기" on public.user_states;
create policy "user_states: 본인 행 바꾸기" on public.user_states
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and consent_version is not null);

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
-- 게스트(익명 사용자)도 같다 — [이 기기에서 기록 지우기(계정 삭제)], 그리고 게스트가 연결하려던 카카오 계정이 이미 다른 온맘 계정이라
-- 그 계정으로 옮길 때 웹이 아직 유효한 게스트 세션으로 먼저 부른다(게스트의 서버 행·익명 계정을 남기지 않게).
-- 본인만 지울 수 있다 — 다른 사용자 id를 받는 함수는 두지 않는다.
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
