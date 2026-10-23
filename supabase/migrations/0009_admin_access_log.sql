-- 온맘 웹 — 관리자 접근 기록: 관리자 읽기 함수(admin_overview·admin_list_users·admin_find_user·admin_list_admins)와 CSV 내려받기도
--   admin_audit에 한 줄씩 남기고, admin_audit은 2년이 지난 줄을 매일 지운다(pg_cron).
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0002(is_admin·admins·admin_list_users)·0004(pg_cron)·0005(admin_audit·관리자 도구 함수)가 있어야 한다 — 아래 0)이 확인한다.
-- 여러 번 실행해도 같은 결과(칸은 있으면 건너뛰고, 제약은 지우고 같은 이름으로 다시 만들고, 함수는 같은 이름·인자로 새로 만들고,
--   같은 이름의 예약은 지우고 다시 만든다). 확장(create extension)은 부르지 않는다 — 켜져 있는지만 확인한다(0006 머리말, 2BP01).
-- 파일 하나가 트랜잭션 하나다 — 중간에 실패하면 아무것도 바뀌지 않는다.
--
-- 왜: 개인정보의 안전성 확보조치 기준(개인정보보호위원회 고시) 제8조 — 개인정보취급자가 개인정보처리시스템에 접속해 한 일의 기록
--   (접속기록: 계정·접속 일시·접속지·처리한 정보주체·수행 업무)을 남기고 보관·점검한다. /admin/의 관리자가 개인정보취급자다.
--   0005까지는 계정 삭제(admin_delete_user)만 admin_audit에 남았고, 계정 메타데이터(계정 ID·가입·접속 시각·계정 유형·동의 판·
--   기록 저장 여부)를 보는 읽기 함수와 CSV 내려받기는 아무 흔적도 남기지 않았다.
--
-- 무엇을 남기나 — 관리자 함수를 한 번 부를 때마다 한 줄. 결과와 같은 트랜잭션이라 기록을 남기지 못하면 결과도 나가지 않는다.
--   actor(부른 관리자 계정 ID) · action · target(계정 하나를 다룰 때) · subject_count(결과에 담긴 계정 수) · list_offset(목록의 시작 위치)
--   · at(서버 시각 — 0005의 칸을 그대로 쓴다)
--     overview          집계 수치만(계정 하나하나의 정보 없음) — target·subject_count 없음
--     list_users        subject_count = 돌려준 행 수(화면은 다음 쪽이 있는지 보려고 한 쪽 + 1명을 받는다), list_offset = 실제 시작 위치.
--                       목록은 가입이 최신인 순이라 그때의 offset·행 수로 누구를 봤는지 되짚을 수 있다(검색 조건을 남기는 방식).
--     find_user         target = 찾은 계정 ID(없는 ID여도 — 무엇을 찾았는지가 기록이다), subject_count = 0 또는 1
--     list_admins       subject_count = 관리자 수
--     export_users_csv  CSV 파일은 브라우저가 만들어 서버가 볼 수 없다 — 화면이 파일을 만들기 직전에 admin_log_users_export로 남긴다
--                       (subject_count = 파일의 행 수). 남기지 못하면 화면은 파일을 만들지 않는다. 그 파일에 담을 목록을 받은 호출도
--                       그 앞의 list_users 줄들(100명씩)로 남는다.
--   남기지 않는 것: 건강 기록·이메일·닉네임·IP. 사유(reason)는 계정 삭제 때만 쓴다(0005, 이메일 모양은 표가 거절).
--   주의: 접속지(IP)는 기준이 말하는 접속기록 항목이지만 이 파일은 남기지 않는다 — 남길지, 어디서 읽을지(요청 헤더는 위조될 수 있다)는
--     CPO·법률 확인 뒤에 정한다. 권한이 없어 거절된 호출(42501)은 남지 않는다(오류와 함께 트랜잭션이 되돌아간다).
--
-- 함수는 같은 이름·인자·결과 칸으로 다시 만든다(지금 화면·열려 있던 옛 화면 모두 그대로 동작). 바뀌는 것은 둘:
--   1) 기록을 쓰므로 stable → volatile. stable 함수 안에서는 insert를 할 수 없고, PostgREST는 stable 함수를 읽기 전용 트랜잭션으로
--      부른다. 웹은 supabase.rpc(POST)로 부르므로 그대로 된다(volatile 함수는 GET으로 부를 수 없다 — 웹은 GET을 쓰지 않는다).
--      맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다 — 예전(stable) 정보로 읽기 전용 트랜잭션을 열지 않게.
--   2) 목록 함수는 결과를 넣은 뒤(return query) 행 수를 세어(get diagnostics) 한 줄을 남긴다.
--   결과 칸·계산은 0002·0005와 같다(src/features/admin/adminAccessLogSql.test.ts가 글자로 비교한다).
--
-- 보존 — 2년: 0005는 기간을 정하지 않아 지우지 않았다(CPO 결정 대기). 이 파일부터 at이 2년보다 오래된 줄을 매일 지운다.
--   기준 제8조 ①은 접속기록을 1년 이상, 5만 명 이상의 정보주체·고유식별정보·민감정보를 처리하는 시스템은 2년 이상 보관하라고 한다.
--   온맘은 건강 정보(민감정보)를 처리하므로 2년이 더 안전한 해석이다 — 법률 확인 전까지 2년으로 둔다(더 길게 정해지면 기간만 늘린다,
--   1년으로 줄이지 않는다). 계정 삭제 기록(delete_user)도 같은 표라 같이 2년이다. 숫자는 화면 안내(adminModel ADMIN_AUDIT_RETENTION_YEARS)와 같다.
--   기준 제8조 ②의 점검(월 1회 이상, 내려받기는 사유 확인)은 사람이 한다 — SQL Editor:
--     select at, actor, action, target, subject_count, list_offset from public.admin_audit order by at desc limit 200;
-- 권한: 표는 브라우저가 읽지도 쓰지도 못한다(0005 그대로 — RLS 켜고 정책 없음). 이번에 서버 함수의 비밀 키(service_role) 권한도 거둔다(아래 1).
--   줄은 관리자 함수(함수 주인 권한)만 쓰고, 정리 함수는 예약(pg_cron, 함수 주인 postgres)만 부른다. SQL Editor에서는 그대로 보인다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron이 없습니다 — 0004_push_reminders.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.admins') is null or to_regprocedure('public.is_admin()') is null
    or to_regprocedure('public.admin_list_users(integer, integer)') is null then
    raise exception 'public.is_admin·admins·admin_list_users가 없습니다 — 0002_admin.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.admin_audit') is null or to_regprocedure('public.admin_find_user(uuid)') is null
    or to_regprocedure('public.admin_list_admins()') is null then
    raise exception 'public.admin_audit·admin_find_user·admin_list_admins가 없습니다 — 0005_admin_tools.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 감사 기록 표 — 접근 기록 칸 두 개(둘 다 비울 수 있다 — 0005의 삭제 기록 줄은 비어 있다) ----------------------------
-- 칸을 더하는 것은 표를 다시 쓰지 않는다(기본값 없는 null 칸). 제약은 한 문장에서 지우고 다시 만든다 — 제약이 없는 순간이 없다.
-- 기존 줄은 새 칸이 모두 null이라 검사가 바로 끝난다.

alter table public.admin_audit
  add column if not exists subject_count integer,
  add column if not exists list_offset integer;

alter table public.admin_audit
  drop constraint if exists admin_audit_subject_count_nonnegative,
  add constraint admin_audit_subject_count_nonnegative check (subject_count is null or subject_count >= 0),
  drop constraint if exists admin_audit_list_offset_nonnegative,
  add constraint admin_audit_list_offset_nonnegative check (list_offset is null or list_offset >= 0);

comment on table public.admin_audit is
  '온맘 웹 관리자 행동·접근 기록(누가·언제·무엇을·어느 계정에·몇 명을·사유). 건강 기록·이메일 없음. 브라우저 접근 없음 — SQL Editor에서만 본다. 2년 지나면 지운다(0009).';
comment on column public.admin_audit.subject_count is '그 호출의 결과에 담긴 계정 수(list_users·find_user·list_admins·export_users_csv). 집계(overview)·삭제는 null.';
comment on column public.admin_audit.list_offset is 'list_users의 실제 시작 위치(가입 최신순) — subject_count와 함께 누구를 봤는지 되짚는다. 그 밖은 null.';

-- 브라우저(anon·authenticated)는 0005와 같다. 이번에 서버 함수의 비밀 키(service_role)도 거둔다 — Supabase는 public 표에 기본으로
-- service_role 권한을 주는데, 이 표를 쓰는 서버 함수(Edge Function)는 없다. 기록을 쓰는 것은 관리자 함수·정리 함수(함수 주인 postgres)뿐이라
-- 그대로 동작하고, 그 키가 새도 API로 기록을 고치거나 지우지 못한다(기준 제8조 ③ 접속기록 위·변조 방지). SQL Editor(postgres)는 그대로 본다.
revoke all on table public.admin_audit from public, anon, authenticated, service_role;
alter table public.admin_audit enable row level security;

-- 2) 한눈에 보기 — 0005와 같은 결과 + 접근 기록(집계만) ---------------------------------------------------------

create or replace function public.admin_overview(p_consent_version text)
returns json
language plpgsql
volatile
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
    'consent_versions', (
      select coalesce(json_agg(json_build_object('version', v.consent_version, 'users', v.n) order by v.consent_version desc nulls last), '[]'::json)
      from (
        select s.consent_version, count(*) as n
        from public.user_states s
        group by s.consent_version
      ) v
    ),
    'new_users_by_day', (
      select json_agg(json_build_object(
        'day', d.day,
        'users', coalesce(c.n, 0),
        'anonymous_users', coalesce(c.n_anon, 0),
        'kakao_users', coalesce(c.n_kakao, 0)
      ) order by d.day)
      from (
        select (seoul_today - g.k) as day
        from generate_series(0, 29) as g(k)
      ) d
      left join (
        select
          (u.created_at at time zone 'Asia/Seoul')::date as day,
          count(*) as n,
          count(*) filter (where coalesce(u.is_anonymous, false)) as n_anon,
          count(*) filter (
            where exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'kakao')
          ) as n_kakao
        from auth.users u
        where u.deleted_at is null
          and u.created_at >= ((seoul_today - 29)::timestamp at time zone 'Asia/Seoul')
        group by 1
      ) c on c.day = d.day
    )
  ) into result;

  insert into public.admin_audit (actor, action)
  values ((select auth.uid()), 'overview');

  return result;
end;
$$;

revoke execute on function public.admin_overview(text) from public, anon;
grant execute on function public.admin_overview(text) to authenticated;

-- 3) 사용자 목록 — 0002와 같은 결과 + 접근 기록(돌려준 행 수·시작 위치) ----------------------------------------------

create or replace function public.admin_list_users(p_limit integer, p_offset integer)
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
    s.updated_at
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

-- 4) 계정 찾기 — 0005와 같은 결과 + 접근 기록(찾은 ID — 없는 ID여도) ------------------------------------------------

create or replace function public.admin_find_user(p_id uuid)
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
    s.updated_at
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

-- 5) 관리자 목록 — 0005와 같은 결과 + 접근 기록(관리자 수) --------------------------------------------------------

create or replace function public.admin_list_admins()
returns table (
  user_id uuid,
  added_at timestamptz,
  last_sign_in_at timestamptz,
  is_me boolean
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
    a.user_id,
    a.created_at,
    u.last_sign_in_at,
    (a.user_id = (select auth.uid()))
  from public.admins a
  left join auth.users u on u.id = a.user_id
  order by a.created_at asc, a.user_id asc;

  get diagnostics shown = row_count;
  insert into public.admin_audit (actor, action, subject_count)
  values ((select auth.uid()), 'list_admins', shown);
end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

-- 6) CSV 내려받기 기록 — 화면(adminApi logUsersExport)이 파일을 만들기 직전에 부른다 ---------------------------------
-- 받는 것은 파일에 담을 행 수뿐이다(계정 ID 목록·파일 내용은 받지 않는다). 0 이상의 정수가 아니면 22023.

create or replace function public.admin_log_users_export(p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rows is null or p_rows < 0 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  insert into public.admin_audit (actor, action, subject_count)
  values ((select auth.uid()), 'export_users_csv', p_rows);
end;
$$;

comment on function public.admin_log_users_export(integer) is
  '관리자 CSV 내려받기를 admin_audit에 남긴다(행 수만). 화면이 파일을 만들기 전에 부르고, 실패하면 파일을 만들지 않는다.';

revoke execute on function public.admin_log_users_export(integer) from public, anon;
grant execute on function public.admin_log_users_export(integer) to authenticated;

-- 7) 감사 기록 정리 — 2년 지난 줄, 매일 04:00 KST = 19:00 UTC(pg_cron은 UTC) ---------------------------------------
-- 게스트 정리(0006, 03:00 KST)·AI 이용 기록 정리(0007, 03:30 KST) 뒤. 지운 수만 돌려주고 사용자 id는 어디에도 남기지 않는다.
-- SECURITY DEFINER: 표에는 정책이 없어(RLS) 함수 주인(postgres) 권한으로 지운다. search_path를 비워 이름 바꿔치기를 막는다(0006과 같다).
-- 권한: 브라우저(anon·authenticated)도 서버 함수(service_role)도 부를 수 없다 — 예약(pg_cron, 함수 주인 postgres)만 부른다.
-- 줄은 관리자 활동만큼이라 작다 — 한 번에 모두 지운다(0005의 admin_audit_at_idx가 at으로 찾는다).

create or replace function public.cleanup_admin_audit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.admin_audit where at < now() - interval '2 years';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.cleanup_admin_audit() is
  '관리자 행동·접근 기록(admin_audit) 중 2년 지난 줄 삭제(안전성 확보조치 기준 제8조 — 민감정보 처리 시스템의 접속기록 2년 이상). pg_cron onmom-admin-audit-cleanup만 부른다.';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막는다(예약은 함수 주인 postgres로 돈다)
revoke execute on function public.cleanup_admin_audit() from public, anon, authenticated, service_role;

-- 같은 이름의 예약이 있으면 지우고 다시 만든다(여러 번 실행해도 하나만 남는다)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-admin-audit-cleanup') then
    perform cron.unschedule('onmom-admin-audit-cleanup');
  end if;
end;
$$;

select cron.schedule(
  'onmom-admin-audit-cleanup',
  '0 19 * * *',
  $job$ select public.cleanup_admin_audit(); $job$
);

-- 8) PostgREST 스키마 다시 읽기 — 함수가 volatile이 된 것을 바로 알게(예전 stable 정보로 읽기 전용 트랜잭션을 열면 기록 insert가 실패한다).
-- Supabase는 DDL 뒤에 스스로도 다시 읽지만, 이 파일의 변경은 그것에 기대지 않는다. 알림은 이 트랜잭션이 끝날 때(commit) 간다.

notify pgrst, 'reload schema';
