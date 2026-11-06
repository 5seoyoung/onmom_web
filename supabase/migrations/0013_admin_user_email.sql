-- 온맘 웹 — 관리자 사용자 목록·계정 찾기에 로그인 이메일 칸을 더한다(public.admin_list_users · public.admin_find_user).
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0002·0005·0009가 있어야 한다 — 아래 0)이 확인한다. 여러 번 실행해도 같은 결과.
-- 파일 하나가 트랜잭션 하나다 — 중간에 실패하면 아무것도 바뀌지 않는다(지운 함수도 되살아난다).
--
-- 왜: 이용자가 메일로 삭제·문의를 보내면 운영자가 그 계정이 맞는지 확인하고 답할 수 있어야 한다(2026-11-06 대표 요청). 지금까지 관리 화면에는 계정 ID뿐이었다.
--   카카오계정(이메일)은 이미 처리방침 2절·동의 (a)의 수집 항목이고, 이용 목적의 "이용자 식별·요청 처리와 문의 응대"에 든다 — 새로 모으는 정보가 아니다.
--
-- 원칙
-- - 칸 하나만 더한다: auth.users.email. 게스트(익명)는 이메일이 없고, 카카오에서 이메일 제공에 동의하지 않은 사람도 없다 — 없으면 null(빈 글자도 null).
-- - 닉네임·프로필 사진·전화·건강 기록(state)은 여전히 돌려주지 않는다(raw_user_meta_data·identity_data를 읽지 않는다).
-- - 접근 기록은 0009와 같다: 부를 때마다 admin_audit에 한 줄. 기록에 이메일은 남기지 않는다(누가·언제·무엇을·몇 명만).
-- - CSV에는 넣지 않는다 — 이 함수가 돌려줘도 화면(adminModel usersCsv)이 파일에 쓰지 않는다. 내려받은 파일은 서버의 접근 통제를 벗어나기 때문이다.
-- - 이메일로 계정을 찾는 함수는 만들지 않는다(찾기는 계정 ID로만 — 0005).
--
-- 돌려주는 칸이 바뀌어 create or replace로는 못 고친다 — 지우고 다시 만든다. 지우면 권한도 사라지므로 아래에서 다시 준다.
-- 이 파일과 웹 배포의 순서는 상관없다: 옛 화면은 모르는 칸을 버리고(adminModel parseUserRows), 새 화면은 칸이 없으면 "-"를 보인다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin이 없습니다 — 0002_admin.sql을 먼저 적용하세요';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_audit' and column_name = 'list_offset'
  ) then
    raise exception 'public.admin_audit.list_offset이 없습니다 — 0009_admin_access_log.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 사용자 목록 — 0009와 같은 결과 + 이메일 ----------------------------------------------------------------

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
  state_updated_at timestamptz,
  email text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  shown integer;
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
    s.updated_at,
    nullif(u.email, '')::text
  from auth.users u
  left join public.user_states s on s.user_id = u.id
  where u.deleted_at is null
  order by u.created_at desc, u.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);

  get diagnostics shown = row_count;
  insert into public.admin_audit (actor, action, subject_count, list_offset)
  values ((select auth.uid()), 'list_users', shown, greatest(coalesce(p_offset, 0), 0));
end;
$$;

revoke execute on function public.admin_list_users(integer, integer) from public, anon;
grant execute on function public.admin_list_users(integer, integer) to authenticated;

-- 2) 계정 찾기 — 0009와 같은 결과 + 이메일 ------------------------------------------------------------------

drop function if exists public.admin_find_user(uuid);

create function public.admin_find_user(p_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_anonymous boolean,
  provider text,
  has_state boolean,
  consent_version text,
  state_updated_at timestamptz,
  email text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  shown integer;
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
    s.updated_at,
    nullif(u.email, '')::text
  from auth.users u
  left join public.user_states s on s.user_id = u.id
  where u.id = p_id and u.deleted_at is null;

  get diagnostics shown = row_count;
  insert into public.admin_audit (actor, action, target, subject_count)
  values ((select auth.uid()), 'find_user', p_id, shown);
end;
$$;

revoke execute on function public.admin_find_user(uuid) from public, anon;
grant execute on function public.admin_find_user(uuid) to authenticated;

-- 3) PostgREST 스키마 다시 읽기 — 바뀐 칸을 웹이 바로 받게(0009·0011과 같다). 알림은 이 트랜잭션이 끝날 때(commit) 간다.

notify pgrst, 'reload schema';
