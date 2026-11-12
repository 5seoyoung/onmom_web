-- 온맘 웹 — 관리자 보안 보강: 관리자 2단계 인증(aal2), 관리자 권한 이력(3년), CSV 내려받기 사유.
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0002(is_admin·admins)·0004(pg_cron)·0005(admin_audit)·0009(admin_log_users_export·정리 예약)가 있어야 한다 — 아래 0)이 확인한다.
-- 여러 번 실행해도 같은 결과(표·트리거·함수는 있으면 바꾸고, 채우기는 이미 있으면 건너뛰고, 같은 이름의 예약은 지우고 다시 만든다).
-- 파일 하나가 트랜잭션 하나다 — 중간에 실패하면 아무것도 바뀌지 않는다(지운 함수도 되살아난다).
--
-- 왜: 「개인정보의 안전성 확보조치 기준」(개인정보보호위원회 고시) — 법률 확인 전 개발 사전 검토의 보수적 해석(docs/dev/legal/LEGAL_PREREVIEW.md D-03·D-19).
--   제5조③ 접근 권한의 부여·변경·말소 내역을 기록하고 최소 3년 보관 → 1) 관리자 권한 이력
--   제6조② 정보통신망을 통해 외부에서 개인정보처리시스템에 접속할 때 안전한 인증수단(일회용 비밀번호 등) → 2) 관리자는 2단계 인증(aal2)
--   제8조② 접속기록 점검 — 내려받은 것이 발견되면 그 사유를 확인 → 3) CSV 내려받기 사유를 기록에 함께 남김
--   (제6조④ 일정 시간 무동작 시 접속 차단은 화면이 한다 — /admin/은 15분 동안 쓰지 않으면 로그아웃, src/features/admin/adminModel.ts ADMIN_IDLE_MINUTES)
--
-- 1) 관리자 권한 이력 — public.admin_role_history
--   public.admins에 넣거나(grant) 빼면(revoke) 트리거가 한 줄을 남긴다. SQL Editor에서 넣고 빼든, 계정이 지워져 관리자 줄이 함께 지워지든(on delete cascade)
--   같은 트리거가 남긴다. user_id는 auth.users를 참조하지 않는다 — 계정이 지워져도 이력은 남아야 한다(0005 admin_audit와 같은 이유).
--   db_role = 바꾼 DB 역할(SQL Editor는 postgres), by_user = 바꾼 사람의 로그인 계정 ID(SQL Editor·예약에는 없어 null).
--   이 파일을 처음 적용할 때 지금 관리자마다 'grant' 한 줄을 그 관리자의 등록 시각(admins.created_at)으로 채운다(이미 이력이 있으면 건너뜀).
--   보존 3년: 매일 04:10 KST(19:10 UTC) 3년 지난 줄을 지운다 — 관리자 접근 기록 정리(0009, 04:00 KST) 뒤.
--   표는 브라우저도 서버 함수의 비밀 키(service_role)도 읽거나 쓰지 못한다(RLS 켜고 정책 없음 + 권한 회수). SQL Editor에서만 본다:
--     select at, action, user_id, db_role, by_user from public.admin_role_history order by at desc;
--
-- 2) 관리자 2단계 인증 — is_admin()이 aal2 세션만 관리자로 본다
--   카카오 로그인만 한 세션은 aal1이다. 인증 앱(TOTP)의 6자리 코드를 확인한 세션만 aal2가 된다(Supabase Auth MFA — 토큰의 aal 클레임).
--   모든 관리자 함수(0002·0005·0009·0013의 조회·찾기·삭제·관리자 목록·내려받기 기록, 0011의 이용 통계)가 맨 앞에서 is_admin()을
--   확인하므로, 이 한 곳만 바꾸면 aal1 세션은 모두 42501로 거절된다.
--   화면은 2단계 인증 전에 "관리자 목록에 있는지"만 알아야 등록·코드 화면을 보일 수 있다 → admin_membership()(aal 무관, 자기 자신만, 데이터 없음).
--   인증 앱을 잃었을 때: 운영 안내서(docs/dev/RUNBOOK.md "관리자 인증 앱을 잃었을 때") — auth.mfa_factors의 그 사람 줄을 지우고 다시 등록한다.
--   Supabase Auth의 TOTP(앱 인증) 등록·확인이 켜져 있어야 한다(기본값 켜짐 — 대시보드 Authentication → Multi-Factor).
--
-- 3) CSV 내려받기 사유 — admin_log_users_export(p_rows, p_reason)
--   사유는 앞뒤 공백을 지운 뒤 1~200자여야 한다(아니면 22023). 이메일 모양은 표 제약(0005 admin_audit_reason_no_email)이 거절한다(23514).
--   인자가 하나인 옛 함수는 지운다 — 사유 없이 내려받는 길을 남기지 않는다. 옛 화면이 부르면 함수가 없다는 오류(PGRST202)를 받고 파일을 만들지 않는다
--   (기록을 남기지 못하면 파일을 만들지 않는 0009의 규칙 그대로).
--
-- 배포 순서: 이 파일과 웹(2단계 인증 화면)은 같은 커밋으로 나간다. 웹이 먼저 나가면 admin_membership()이 없어 옛 방식(is_admin)으로 들어가고,
--   이 파일이 먼저 적용되면 옛 화면은 aal1이라 "권한이 없어요"가 보인다 — 새 화면이 배포되면 풀린다(몇 분).

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron이 없습니다 — 0004_push_reminders.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.admins') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin·admins가 없습니다 — 0002_admin.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.admin_audit') is null then
    raise exception 'public.admin_audit이 없습니다 — 0005_admin_tools.sql을 먼저 적용하세요';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_audit' and column_name = 'subject_count'
  ) then
    raise exception 'public.admin_audit.subject_count가 없습니다 — 0009_admin_access_log.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 관리자 권한 이력 ------------------------------------------------------------------------------------

create table if not exists public.admin_role_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  at timestamptz not null default now(),
  db_role text not null default current_user,
  by_user uuid,
  constraint admin_role_history_action check (action in ('grant', 'revoke'))
);

comment on table public.admin_role_history is
  '온맘 웹 관리자 권한 이력(부여 grant·말소 revoke — 누구의·언제·어느 DB 역할·어느 로그인 계정이). 건강 기록·이메일 없음. 브라우저·서버 키 접근 없음 — SQL Editor에서만 본다. 3년 지나면 지운다(0014, 안전성 확보조치 기준 제5조③).';
comment on column public.admin_role_history.db_role is '바꾼 DB 역할(current_user) — SQL Editor는 postgres';
comment on column public.admin_role_history.by_user is '바꾼 사람의 로그인 계정 ID(auth.uid()) — SQL Editor·예약에는 없어 null';

create index if not exists admin_role_history_at_idx on public.admin_role_history (at);

revoke all on table public.admin_role_history from public, anon, authenticated, service_role;
alter table public.admin_role_history enable row level security;
-- 정책을 일부러 만들지 않는다 — 브라우저(anon·authenticated)는 한 행도 못 보고 못 쓴다. 줄은 아래 트리거(함수 주인 권한)만 쓴다.

-- 트리거 함수 — 관리자 줄이 생기면 grant, 지워지면 revoke. 함수 주인(postgres) 권한으로 쓴다(표에 정책이 없다).
-- user_id를 바꾸는 update는 이력으로 보면 말소 + 부여다 — 화면·운영 안내에는 update가 없지만 빠뜨리지 않게 함께 남긴다.
create or replace function public.log_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    insert into public.admin_role_history (user_id, action, by_user)
    values (old.user_id, 'revoke', (select auth.uid()));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.admin_role_history (user_id, action, by_user)
    values (new.user_id, 'grant', (select auth.uid()));
  end if;
  return null;
end;
$$;

comment on function public.log_admin_role_change() is
  'public.admins의 넣기·빼기를 admin_role_history에 남기는 트리거 함수(0014). 직접 부르지 않는다.';

revoke execute on function public.log_admin_role_change() from public, anon, authenticated, service_role;

drop trigger if exists admins_role_history on public.admins;
create trigger admins_role_history
  after insert or delete or update of user_id on public.admins
  for each row execute function public.log_admin_role_change();

-- 처음 적용할 때 지금 관리자의 부여 시각을 채운다 — 그 사람의 이력이 하나도 없을 때만(여러 번 실행해도 한 줄)
insert into public.admin_role_history (user_id, action, at, db_role, by_user)
select a.user_id, 'grant', a.created_at, 'backfill-0014', null
from public.admins a
where not exists (select 1 from public.admin_role_history h where h.user_id = a.user_id);

-- 3년 지난 이력 정리 — 예약(pg_cron, 함수 주인 postgres)만 부른다. 지운 수만 돌려준다.
create or replace function public.cleanup_admin_role_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.admin_role_history where at < now() - interval '3 years';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.cleanup_admin_role_history() is
  '관리자 권한 이력(admin_role_history) 중 3년 지난 줄 삭제(안전성 확보조치 기준 제5조③ — 최소 3년). pg_cron onmom-admin-role-history-cleanup만 부른다.';

revoke execute on function public.cleanup_admin_role_history() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-admin-role-history-cleanup') then
    perform cron.unschedule('onmom-admin-role-history-cleanup');
  end if;
end;
$$;

select cron.schedule(
  'onmom-admin-role-history-cleanup',
  '10 19 * * *',
  $job$ select public.cleanup_admin_role_history(); $job$
);

-- 2) 관리자 2단계 인증 -------------------------------------------------------------------------------------
-- 0002의 조건(게스트 아님·관리자 목록·지워지지 않은 계정)은 그대로, 세션이 aal2일 때만 참.
-- 이름·인자·결과가 같아 create or replace로 바꾼다 — 권한(authenticated만 실행)은 0002에서 준 그대로 남는다.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from public.admins a
      join auth.users u on u.id = a.user_id
      where a.user_id = (select auth.uid())
        and coalesce(u.is_anonymous, false) = false
        and u.deleted_at is null
    );
$$;

comment on function public.is_admin() is
  '지금 세션이 관리자인가 — 관리자 목록의 카카오 계정 + 2단계 인증(aal2) 세션일 때만 참(0014). 모든 관리자 함수가 맨 앞에서 확인한다.';

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 화면용 — 로그인한 내 계정이 관리자 목록에 있는가(aal 무관). 참이면 화면이 2단계 인증 등록·코드 입력을 보인다.
-- 데이터를 돌려주지 않고(참·거짓 하나), 자기 자신만 본다. 접근 기록은 남기지 않는다(is_admin과 같다 — 권한 확인일 뿐).
create or replace function public.admin_membership()
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

comment on function public.admin_membership() is
  '로그인한 내 계정이 관리자 목록에 있는가(2단계 인증 전 — 화면이 등록·코드 입력을 보일지 정한다). 데이터 없음, 자기 자신만(0014).';

revoke execute on function public.admin_membership() from public, anon;
grant execute on function public.admin_membership() to authenticated;

-- 3) CSV 내려받기 사유 ------------------------------------------------------------------------------------

drop function if exists public.admin_log_users_export(integer);

create or replace function public.admin_log_users_export(p_rows integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rows is null or p_rows < 0 or char_length(why) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  insert into public.admin_audit (actor, action, subject_count, reason)
  values ((select auth.uid()), 'export_users_csv', p_rows, why);
end;
$$;

comment on function public.admin_log_users_export(integer, text) is
  '관리자 CSV 내려받기를 admin_audit에 남긴다(행 수와 사유 — 사유 필수 1~200자, 0014). 화면이 파일을 만들기 전에 부르고, 실패하면 파일을 만들지 않는다.';

revoke execute on function public.admin_log_users_export(integer, text) from public, anon;
grant execute on function public.admin_log_users_export(integer, text) to authenticated;

-- 4) PostgREST 스키마 다시 읽기 — 새 함수(admin_membership)와 바뀐 인자(admin_log_users_export)를 바로 알게.

notify pgrst, 'reload schema';
