-- 온맘 웹 — 관리자 도구(/admin/ 확장): 계정 삭제 요청 처리 + 감사 기록, 관리자 목록, 계정 찾기, 집계 확장.
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run해도 되고, 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다.
-- 먼저 0001_user_states.sql·0002_admin.sql(is_admin·admins)이 있어야 한다 — 아래 0)이 확인한다. 여러 번 실행해도 같은 결과.
--
-- 원칙(개인정보 최소화 — 0002와 같다)
-- - 관리자는 집계와 계정 메타데이터(계정 ID, 가입·접속 시각, 게스트/카카오, 동의 판, 서버 기록 유무와 마지막 저장 시각)만 본다.
-- - 건강 기록(user_states.state)·이메일·닉네임·프로필 사진(raw_user_meta_data)은 어떤 함수도 읽거나 돌려주지 않는다.
-- - 모든 함수는 SECURITY DEFINER + search_path '' + 맨 앞에서 is_admin() 확인(아니면 42501). 공개 키(anon)로는 부를 수 없다.
-- - 관리자가 한 삭제는 admin_audit에 남는다(누가·언제·어느 계정·사유). 이 표는 브라우저에서 읽거나 쓸 수 없다(RLS 켜고 정책 없음).
--
-- 운영자 안내 — 관리자 추가·해제(0002와 같다. 웹에는 관리자를 넣는 화면이 없다 — 일부러):
--   1) 그 사람이 웹에서 카카오로 로그인한 뒤 /admin/을 연다 → "권한이 없어요" 아래 "내 계정 ID"를 복사(또는 대시보드 Authentication → Users의 UID)
--   2) SQL Editor:  insert into public.admins (user_id) values ('<계정 ID>');
--      해제:        delete from public.admins where user_id = '<계정 ID>';
--   게스트(익명) 계정은 목록에 넣어도 관리자가 아니다. /admin/의 "관리자 목록" 카드에서 지금 누가 관리자인지 볼 수 있다(admin_list_admins).
--
-- 운영자 안내 — 이용자의 삭제 요청 처리(개인정보처리방침 13절 "그 밖의 요구는 문의처로"):
--   1) 이용자가 문의 이메일로 계정 ID를 보내 준다 — 설정 > 내 데이터 카드의 "계정 ID" 행(UUID 36자. 내려받기 파일에는 account.serverUserId).
--      주의: 내려받기 파일의 account.id("kakao-<카카오 회원번호>"·"guest-<…>")는 앱 계정 id라 아래 함수가 받지 않는다 —
--      카카오 회원번호로는 찾을 수 없다(identity 표를 관리자 경로로 끌어오지 않기로 함). 설정 없는 빌드·세션 없는 브라우저에는
--      계정 ID 행이 없다 — 그 사람은 서버에 계정이 없으므로 서버에서 처리할 것도 없다.
--   2) /admin/ → "계정 찾기"에 UUID를 넣어 메타데이터로 그 계정임을 확인 → [계정 삭제] → 계정 ID 앞 8자리를 입력해 확정(사유 선택 입력).
--   3) admin_delete_user가 user_states 행과 auth.users 행(세션·identity 포함)을 지우고 admin_audit에 한 줄을 남긴다.
--      카카오 쪽 "연결 끊기"는 하지 않는다(카카오 Admin 키 필요 — 이용자가 카카오계정 설정에서 끊을 수 있다, 방침 5절).
--   내 계정(로그인한 관리자 자신)과 다른 관리자는 여기서 지울 수 없다 — 자기 계정은 설정 > 계정 삭제, 관리자는 먼저 admins에서 뺀다.
--   사유(선택)에는 이메일·건강 정보를 적지 않는다(화면 안내와 같다). 이메일 모양이 있으면 화면이 먼저 막고(deleteReasonProblem),
--   표 제약(admin_audit_reason_no_email)도 거절한다 — 요청 메일 본문을 그대로 붙여 넣지 않는다. "이용자 요청(문의 메일 2026-09-28)"처럼 적는다.
--
-- 운영자 안내 — admin_audit 보존:
--   지금은 지우지 않는다(감사 기록 — 보존 기간은 CPO 결정 사항, 개인정보처리방침 5절 보유 기간에 함께 적는다).
--   기간(N개월)이 정해지면 SQL Editor에서   delete from public.admin_audit where at < now() - interval 'N months';
--   를 실행하거나, pg_cron 확장을 켜고 같은 문장을 매일 돌린다. 이 표에는 건강 기록·이메일이 없고 계정 ID(UUID)·행동·사유·시각만 있다.

-- 0) 먼저 실행해야 하는 것 확인 ------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) or not exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admins'
  ) then
    raise exception '먼저 supabase/migrations/0002_admin.sql(is_admin·admins)을 실행하세요.';
  end if;
end;
$$;

-- 1) 감사 기록 — 관리자가 한 일. 브라우저에서는 읽지도 쓰지도 못한다 -----------------------------------
-- actor·target은 auth.users를 참조하지 않는다(계정이 지워져도 기록은 남아야 한다). 건강 기록·이메일은 넣지 않는다.

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  target uuid,
  reason text,
  at timestamptz not null default now(),
  constraint admin_audit_action_length check (char_length(action) between 1 and 64),
  constraint admin_audit_reason_length check (reason is null or char_length(reason) <= 500),
  -- 사유에 이메일 주소가 들어가지 않게(운영자가 요청 메일을 붙여 넣는 실수). 화면(adminModel deleteReasonProblem)이 같은 패턴으로 먼저 막는다.
  constraint admin_audit_reason_no_email check (reason is null or reason !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}')
);

-- 표가 이미 있던 서버(이 제약이 없는 0005 초판)에도 같은 제약을 건다 — 여러 번 실행해도 같은 결과
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_audit_reason_no_email') then
    alter table public.admin_audit
      add constraint admin_audit_reason_no_email check (reason is null or reason !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}');
  end if;
end;
$$;

comment on table public.admin_audit is '온맘 웹 관리자 행동 기록(누가·언제·무엇을·어느 계정에·사유). 건강 기록·이메일 없음. 브라우저 접근 없음 — SQL Editor에서만 본다. 보존 기간은 머리 주석.';

create index if not exists admin_audit_at_idx on public.admin_audit (at);

revoke all on table public.admin_audit from public, anon, authenticated;
alter table public.admin_audit enable row level security;
-- 정책을 일부러 만들지 않는다 — RLS가 켜져 있고 정책이 없으면 브라우저(anon·authenticated)는 한 행도 못 보고 못 쓴다.

-- 2) 계정 삭제(관리자) — 이용자의 삭제 요청 처리 -----------------------------------------------------
-- 본인(delete_my_account)과 달리 대상 id를 받는다. 그래서 더 엄격하다:
--   is_admin() 아님 → 42501 / 대상 없음 → 22023 / 내 계정 → P0001 'onmom: cannot delete own account'(설정 > 계정 삭제를 쓴다)
--   다른 관리자 → P0001 'onmom: target is admin'(먼저 admins에서 뺀다) / 없는 계정 → P0002 'onmom: user not found'
-- 감사 기록을 먼저 남기고 지운다(같은 트랜잭션 — 삭제가 실패하면 기록도 남지 않는다).

create or replace function public.admin_delete_user(p_target uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_target = actor_id then
    raise exception 'onmom: cannot delete own account' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.admins a where a.user_id = p_target) then
    raise exception 'onmom: target is admin' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target and u.deleted_at is null) then
    raise exception 'onmom: user not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit (actor, action, target, reason)
  values (actor_id, 'delete_user', p_target, nullif(left(trim(coalesce(p_reason, '')), 500), ''));

  delete from public.user_states where user_id = p_target;
  delete from auth.users where id = p_target; -- 세션·identity도 함께 지워진다
end;
$$;

comment on function public.admin_delete_user(uuid, text) is
  '관리자가 이용자의 삭제 요청을 처리한다 — user_states 행 + auth.users 행 삭제, admin_audit에 기록. 내 계정·다른 관리자는 거절.';

revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- 3) 관리자 목록 — 계정 ID·등록일·최근 접속·나인지(메타데이터만) ---------------------------------------

drop function if exists public.admin_list_admins();

create function public.admin_list_admins()
returns table (
  user_id uuid,
  added_at timestamptz,
  last_sign_in_at timestamptz,
  is_me boolean
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
    a.user_id,
    a.created_at,
    u.last_sign_in_at,
    (a.user_id = (select auth.uid()))
  from public.admins a
  left join auth.users u on u.id = a.user_id
  order by a.created_at asc, a.user_id asc;
end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

-- 4) 계정 찾기 — 계정 ID(UUID) 하나의 메타데이터(admin_list_users와 같은 칸). 없으면 빈 결과 ------------------

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
  where u.id = p_id and u.deleted_at is null;
end;
$$;

revoke execute on function public.admin_find_user(uuid) from public, anon;
grant execute on function public.admin_find_user(uuid) to authenticated;

-- 5) 한눈에 보기 확장 — 0002의 admin_overview를 같은 이름·인자로 바꾼다(화면은 예전 칸을 그대로 읽고 새 칸은 있을 때만 쓴다) ------
-- 더한 것: consent_versions(동의 판별 사용자 수 — 판이 없는 행은 version null), new_users_by_day의 날마다 anonymous_users·kakao_users.
-- 나머지 칸·계산은 0002와 같다(한국 날짜 30일, 현재 판 동의 = 인자로 받은 판 + 수락 시각).

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

  return result;
end;
$$;

revoke execute on function public.admin_overview(text) from public, anon;
grant execute on function public.admin_overview(text) to authenticated;
