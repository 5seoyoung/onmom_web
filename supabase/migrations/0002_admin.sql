-- 온맘 웹 — 관리자 화면(/admin/)용 집계. Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run.
-- 먼저 0001_user_states.sql(동의 칸 consent_version·consent_accepted_at 포함)을 실행해야 한다 — 아래 0)이 확인한다.
-- 설명: docs/SUPABASE_SETUP.md
--
-- 원칙(개인정보 최소화)
-- - 관리자는 집계와 계정 메타데이터(계정 ID, 가입·접속 시각, 게스트/카카오, 동의 판, 서버 기록 유무와 마지막 저장 시각)만 본다.
--   마지막 저장 시각(state_updated_at)은 기록 "내용"이 아니라 언제 저장했는지뿐이다. 화면 안내 문구도 이 목록과 같다.
-- - 건강 기록(user_states.state)·이메일·닉네임·프로필 사진(raw_user_meta_data)은 어떤 함수도 읽거나 돌려주지 않는다.
-- - 관리자 목록(public.admins)은 브라우저에서 읽거나 쓸 수 없다(RLS 켜고 정책 없음). 관리자 지정은 SQL Editor에서만.
-- - 함수는 SECURITY DEFINER(auth.users를 읽으려면 만든 사람 권한이 필요) + search_path ''(이름 바꿔치기 방지),
--   맨 앞에서 is_admin()을 확인하고 아니면 오류를 낸다. 공개 키(anon)로는 부를 수 없다.
--
-- 관리자 지정(소유자 한 번):
--   1) 웹에서 카카오로 로그인한 뒤 /admin/을 연다 → "권한이 없어요" 아래 "내 계정 ID"를 복사
--      (또는 대시보드 Authentication → Users에서 그 사용자의 UID)
--   2) SQL Editor에서:  insert into public.admins (user_id) values ('<내 계정 ID>');
--   해제:              delete from public.admins where user_id = '<내 계정 ID>';
--   게스트(익명) 계정은 목록에 넣어도 관리자로 보지 않는다.

-- 0) 먼저 실행해야 하는 것 확인 ------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_states' and column_name = 'consent_version'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_states' and column_name = 'consent_accepted_at'
  ) then
    raise exception '먼저 supabase/migrations/0001_user_states.sql(동의 칸 consent_version·consent_accepted_at 포함)을 실행하세요.';
  end if;
end;
$$;

-- 1) 관리자 목록 — 브라우저에서는 읽지도 쓰지도 못한다 -----------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is '온맘 웹 관리자 계정. SQL Editor에서만 넣고 뺀다(브라우저 정책 없음).';

revoke all on table public.admins from public, anon, authenticated;
alter table public.admins enable row level security;
-- 정책을 일부러 만들지 않는다 — RLS가 켜져 있고 정책이 없으면 브라우저(anon·authenticated)는 한 행도 못 본다.

-- 2) 지금 로그인한 사람이 관리자인가 --------------------------------------------------------------
-- 게스트(익명 로그인)는 목록에 있어도 관리자가 아니다 — 토큰의 is_anonymous와 auth.users 둘 다 본다.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.admins a
      join auth.users u on u.id = a.user_id
      where a.user_id = (select auth.uid())
        and coalesce(u.is_anonymous, false) = false
        and u.deleted_at is null
    );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 3) 한눈에 보기 — 전체 수·게스트·카카오·서버 기록·현재 판 동의·최근 7일·최근 30일 가입 ------------------
-- p_consent_version: 웹의 현재 동의 판(src/domain/consent.ts CURRENT_CONSENT_VERSION). 판을 올려도 이 SQL은 그대로다.
-- "하루"는 한국 시간(Asia/Seoul) 자정 기준. 최근 7일 활성 = 그 기간에 로그인(last_sign_in_at)한 사람 —
--   로그인이 이어져(토큰 갱신) 다시 로그인하지 않은 사람은 세지 않는다. 그래서 기록 갱신 수(states_updated_7d)를 함께 준다.

create or replace function public.admin_overview(p_consent_version text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  seoul_today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select json_build_object(
    'generated_at', now(),
    'consent_version', p_consent_version,
    'totals', json_build_object(
      'users', (select count(*) from auth.users u where u.deleted_at is null),
      'anonymous_users', (
        select count(*) from auth.users u where u.deleted_at is null and coalesce(u.is_anonymous, false)
      ),
      'kakao_users', (
        select count(*) from auth.users u
        where u.deleted_at is null
          and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'kakao')
      ),
      'users_with_state', (select count(*) from public.user_states s),
      'users_with_current_consent', (
        select count(*) from public.user_states s
        where p_consent_version is not null
          and s.consent_version = p_consent_version
          and s.consent_accepted_at is not null
      )
    ),
    'active_users_7d', (
      select count(*) from auth.users u
      where u.deleted_at is null and u.last_sign_in_at >= now() - interval '7 days'
    ),
    'states_updated_7d', (
      select count(*) from public.user_states s where s.updated_at >= now() - interval '7 days'
    ),
    'new_users_by_day', (
      select json_agg(json_build_object('day', d.day, 'users', coalesce(c.n, 0)) order by d.day)
      from (
        select (seoul_today - g.k) as day
        from generate_series(0, 29) as g(k)
      ) d
      left join (
        select (u.created_at at time zone 'Asia/Seoul')::date as day, count(*) as n
        from auth.users u
        where u.deleted_at is null
          and u.created_at >= ((seoul_today - 29)::timestamp at time zone 'Asia/Seoul')
        group by 1
      ) c on c.day = d.day
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_overview(text) from public, anon;
grant execute on function public.admin_overview(text) to authenticated;

-- 4) 사용자 목록 — 계정 메타데이터만(건강 기록·이메일·닉네임 없음) ------------------------------------
-- provider: 카카오 identity가 있으면 'kakao'(게스트가 카카오를 연결해도 같은 계정이다), 게스트면 'anonymous',
--   그 밖에는 raw_app_meta_data의 provider. 최신 가입부터, 한 번에 최대 100명.

drop function if exists public.admin_list_users(integer, integer);

create function public.admin_list_users(p_limit integer, p_offset integer)
returns table (
  id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_anonymous boolean,
  provider text,
  has_state boolean,
  consent_version text,
  state_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.created_at,
    u.last_sign_in_at,
    coalesce(u.is_anonymous, false),
    case
      when exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'kakao') then 'kakao'
      when coalesce(u.is_anonymous, false) then 'anonymous'
      else coalesce(u.raw_app_meta_data ->> 'provider', 'unknown')
    end::text,
    (s.user_id is not null),
    s.consent_version::text,
    s.updated_at
  from auth.users u
  left join public.user_states s on s.user_id = u.id
  where u.deleted_at is null
  order by u.created_at desc, u.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_users(integer, integer) from public, anon;
grant execute on function public.admin_list_users(integer, integer) to authenticated;
