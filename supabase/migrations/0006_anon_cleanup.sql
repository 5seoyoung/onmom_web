-- 온맘 웹 — 서버에 기록을 저장한 적 없는 오래된 게스트(익명) 계정 자동 정리. 매일 03:00 KST(= 18:00 UTC) pg_cron.
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
--
-- 왜: [게스트로 시작]은 동의 전에 Supabase 익명 계정(계정 ID·가입 시각·Auth 접속 기록)을 만든다(src/auth/session.ts). 동의하지 않고
--   떠나거나 브라우저 데이터를 지운 게스트는 그 계정을 다시 열 수도, 스스로 지울 수도 없다. 쓰이지 않는 계정 정보를 남겨 두지 않는다
--   (개인정보 최소화 — 처리방침 초안 5절 "서버에 기록을 한 번도 저장하지 않은 게스트 계정은 만든 지 30일이 지나면 자동으로 삭제").
-- 지우는 것: 아래를 모두 만족하는 auth.users 행 — 지우면 Supabase가 세션·토큰을, 우리 표는 on delete cascade로 함께 지운다
--   (push_subscriptions·llm_usage — user_states는 조건상 없다).
--   · 익명 사용자(is_anonymous)
--   · 만든 지 30일이 지남(created_at)
--   · public.user_states 행이 없음 = 서버에 기록을 한 번도 저장하지 않음(웹은 지금 판의 동의 뒤에만 행을 만든다 — 0001)
--   · 익명 말고 다른 로그인 수단(auth.identities)이 없음 = 카카오를 연결하지 않음. 카카오 이메일이 확인되지 않으면 연결 뒤에도
--     is_anonymous가 true로 남을 수 있어(src/auth/kakaoAccount.ts) 이 조건으로 따로 지킨다.
-- 지우지 않는 것: 기록을 저장한 게스트(동의함 — 계정을 삭제할 때까지 보관, 방침 5절), 카카오 계정, 30일이 안 된 게스트.
-- 한 번에 최대 1000명(오래된 순) — 밀린 것은 다음 날 이어서. 지운 수만 돌려주고, 사용자 id·이메일·IP는 어디에도 남기지 않는다.
-- 권한: 브라우저(anon·authenticated)와 서버 함수(service_role) 모두 부를 수 없다 — 예약(pg_cron, 함수 주인 postgres)만 부른다.
-- 여러 번 실행해도 같은 결과(함수는 새로 만들고, 같은 이름의 예약은 지우고 다시 만든다).

-- 1) 정리 함수 ------------------------------------------------------------------------------------------
-- SECURITY DEFINER: auth.users를 지울 수 있는 주인(postgres) 권한으로 돈다(0001 delete_my_account와 같은 방식). search_path를 비워
-- 이름 바꿔치기를 막고, 모든 이름을 스키마까지 적는다.

create or replace function public.cleanup_stale_anonymous_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  with stale as (
    select u.id
    from auth.users u
    where u.is_anonymous is true
      and u.created_at < now() - interval '30 days'
      and not exists (select 1 from public.user_states s where s.user_id = u.id)
      and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'anonymous')
    order by u.created_at
    limit 1000
  )
  delete from auth.users d
  using stale
  where d.id = stale.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.cleanup_stale_anonymous_users() is
  '서버에 기록을 저장하지 않은(user_states 없음) 30일 지난 익명 사용자 삭제(카카오 연결 제외, 한 번에 1000명). pg_cron onmom-anon-cleanup만 부른다.';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막는다(예약은 함수 주인 postgres로 돈다)
revoke execute on function public.cleanup_stale_anonymous_users() from public, anon, authenticated, service_role;

-- 2) 매일 예약 — 03:00 KST = 18:00 UTC(pg_cron은 UTC) -------------------------------------------------------

-- pg_cron은 0004_push_reminders.sql이 이미 켠다. 여기서 create extension을 다시 부르면 Supabase가 확장 권한을 다시 매기다
-- "dependent privileges exist(2BP01)"로 실패한다(2026-09-30 db push에서 확인) — 켜져 있는지만 확인한다.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron이 없습니다 — 0004_push_reminders.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 같은 이름의 예약이 있으면 지우고 다시 만든다(여러 번 실행해도 하나만 남는다)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-anon-cleanup') then
    perform cron.unschedule('onmom-anon-cleanup');
  end if;
end;
$$;

select cron.schedule(
  'onmom-anon-cleanup',
  '0 18 * * *',
  $job$ select public.cleanup_stale_anonymous_users(); $job$
);
