-- 온맘 웹 — 예약 작업·한도 손보기(2026-10 점검):
--   1) 매일 리마인더 예약을 매시 정각으로(어느 시간대든 그곳의 20시에) + 운영 프로젝트 주소를 파일에서 뺀다
--   2) AI 상담 이용 기록(llm_usage)을 매일 정리 — 처리방침의 "2일이 지나면 자동 삭제"를 AI 호출이 없어도 지킨다
--   3) 사용자 상태(user_states.state) 크기 상한 5MB → 1MB(남용 방지)
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0001(user_states)·0003(llm_usage)·0004(pg_cron·pg_net·예약 onmom-send-reminders)이 있어야 한다 — 아래 0)이 확인한다.
-- 여러 번 실행해도 같은 결과(함수는 새로 만들고, 같은 이름의 예약·제약은 지우고 다시 만든다).
-- 확장(create extension)은 부르지 않는다 — 이미 켜진 확장을 다시 부르면 Supabase에서 2BP01로 실패한다(0006 머리말). 있는지만 확인한다.
-- 비밀값·운영 주소는 이 파일에 없다 — 예약이 실행될 때 Vault에서 읽는다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron이 없습니다 — 0004_push_reminders.sql을 먼저 적용하세요';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net이 없습니다 — 0004_push_reminders.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.llm_usage') is null then
    raise exception 'public.llm_usage가 없습니다 — 0003_llm_usage.sql을 먼저 적용하세요';
  end if;
  if to_regclass('public.user_states') is null then
    raise exception 'public.user_states가 없습니다 — 0001_user_states.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 매일 리마인더 — 매시 정각, 주소는 Vault project_url에서만 ----------------------------------------------
-- 왜 매시: 0004는 매일 11:00 UTC(= 20:00 KST) 한 번만 불렀다. 함수는 행마다 "그 기기의 시간대에서 지금이 REMINDER_HOUR(20)시인가"를
--   보고 보내므로(supabase/functions/_shared/reminders.ts isDueNow) 서울·도쿄 밖의 기기(뉴욕은 그때 07시)는 한 번도 받지 못했다.
--   매시 부르면 어느 시간대든 하루에 한 번, 그곳의 20시 정각에 받는다(30분·45분 단위 시간대는 20:30·20:45). 서울 기기는 지금처럼 11:00 UTC.
--   REMINDER_HOUR는 기기 시간대의 시라 예약 시각과 따로 맞출 필요가 없다 — 예약의 분(0)만 REMINDER_MINUTE(0)과 같아야 한다
--   (src/features/pwa/sendReminders.test.ts가 이 파일의 예약과 함수 규칙을 묶어 확인한다).
--   함수는 부를 때마다 구독을 모두 읽는다 — 읽기가 하루 1번에서 24번이 된다(보내는 것은 그 시각이 20시인 기기뿐).
-- 왜 주소 기본값을 뺐나: 0004는 Vault에 project_url이 없으면 파일에 적힌 운영 프로젝트 주소로 보냈다. 이 파일들을 다른 프로젝트
--   (복제·시험용)에 적용하면 그 프로젝트의 reminder_cron_secret을 운영 함수로 보내게 된다. 이제 project_url이 없으면 요청을 만들지 않는다.
-- 요청을 만드는 조건 — 아래 둘이 Vault에 다 있을 때만. 하나라도 없으면 예약은 돌지만 아무것도 보내지 않는다(0004의 "켜기 전" 상태와 같다):
--   · reminder_cron_secret — 함수 비밀값 REMINDER_CRON_SECRET과 같은 값, 비어 있지 않음(0004와 같다)
--   · project_url — https://<ref>.supabase.co. 이제 필수다. https://로 시작해야 한다(비밀 헤더를 평문 http로 보내지 않게). 끝의 /는 떼고 붙인다.
--   publishable_key(선택)는 0004와 같다 — 있으면 apikey 헤더, 없으면 헤더를 싣지 않는다(jsonb_strip_nulls).
-- 사람이 한 번 넣는 값(docs/PWA_AND_REMINDERS.md §5):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');

-- 같은 이름의 예약이 있으면 지우고 다시 만든다(여러 번 실행해도 하나만 남는다)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-send-reminders') then
    perform cron.unschedule('onmom-send-reminders');
  end if;
end;
$$;

select cron.schedule(
  'onmom-send-reminders',
  '0 * * * *',
  $job$
  select net.http_post(
    url := rtrim(project_url.decrypted_secret, '/') || '/functions/v1/send-reminders',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-reminder-secret', cron_secret.decrypted_secret
    )),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 60000
  ) as request_id
  from vault.decrypted_secrets as cron_secret
  join vault.decrypted_secrets as project_url on project_url.name = 'project_url'
  where cron_secret.name = 'reminder_cron_secret' and cron_secret.decrypted_secret <> ''
    and project_url.decrypted_secret like 'https://%';
  $job$
);

-- 이미 켜 둔(Vault에 reminder_cron_secret이 있는) 프로젝트에 project_url이 없으면 이 파일을 적용한 때부터 리마인더가 멈춘다 —
-- 적용 기록(db push 출력)에 경고를 남긴다. 값은 읽지 않는다(이름이 있는지만). 확인하지 못해도(권한 등) 적용은 계속한다 — 안내일 뿐이다.
do $$
begin
  if to_regclass('vault.secrets') is not null then
    if exists (select 1 from vault.secrets where name = 'reminder_cron_secret')
      and not exists (select 1 from vault.secrets where name = 'project_url') then
      raise warning 'Vault에 project_url이 없어 매일 리마인더를 보내지 않습니다 — docs/PWA_AND_REMINDERS.md §5대로 project_url을 넣으세요';
    end if;
  end if;
exception
  when others then
    raise warning 'Vault의 project_url을 확인하지 못했습니다(SQLSTATE %) — docs/PWA_AND_REMINDERS.md §5를 확인하세요', sqlstate;
end;
$$;

-- 2) AI 상담 이용 기록 정리 — 매일 --------------------------------------------------------------------------
-- 왜: 0003의 llm_consume_quota는 AI 상담을 부를 때만 2일 지난 행을 지운다. 아무도 AI 상담을 쓰지 않으면 지난 행이 그대로 남아
--   처리방침·동의 문구의 "AI 상담 이용 시각은 … 2일이 지나면 자동으로 삭제"(src/features/privacy/dataItems.ts AI_USAGE_RETENTION_DAYS)를
--   지키지 못한다. 매일 한 번 같은 기준으로 지운다 — 늦어도 2일 + 하루 안에 지워진다(부를 때의 정리는 그대로 둔다).
-- 기준(2 days)은 0003의 정리 문장·AI_USAGE_RETENTION_DAYS와 같아야 한다(src/api/schedulesAndLimitsSql.test.ts가 비교한다).
-- SECURITY DEFINER: 표에는 정책이 없어(RLS) 함수 주인(postgres) 권한으로 지운다. search_path를 비워 이름 바꿔치기를 막는다(0006과 같다).
-- 권한: 브라우저(anon·authenticated)도 서버 함수(service_role)도 부를 수 없다 — 예약(pg_cron, 함수 주인 postgres)만 부른다.

create or replace function public.cleanup_llm_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.llm_usage where created_at < now() - interval '2 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.cleanup_llm_usage() is
  'AI 상담 이용 기록(llm_usage) 중 2일 지난 행 삭제(처리방침 보유 기간). pg_cron onmom-llm-usage-cleanup만 부른다.';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막는다(예약은 함수 주인 postgres로 돈다)
revoke execute on function public.cleanup_llm_usage() from public, anon, authenticated, service_role;

-- 매일 03:30 KST = 18:30 UTC(pg_cron은 UTC) — 게스트 정리(0006, 03:00 KST) 뒤
do $$
begin
  if exists (select 1 from cron.job where jobname = 'onmom-llm-usage-cleanup') then
    perform cron.unschedule('onmom-llm-usage-cleanup');
  end if;
end;
$$;

select cron.schedule(
  'onmom-llm-usage-cleanup',
  '30 18 * * *',
  $job$ select public.cleanup_llm_usage(); $job$
);

-- 3) 사용자 상태 크기 상한 5MB → 1MB ------------------------------------------------------------------------
-- 왜: 실제 행은 1KB 안팎이다(2026-10 약 840바이트 — 증상 기록 50건·기분 답 60건 상한을 다 채워도 수십 KB). 5MB는 로그인한 누구나
--   (익명 게스트 포함) 계정 하나로 쓸 수 있는 크기라 저장 공간·백업을 부풀리는 남용 여지가 컸다. 1MB면 기록장 글을 오래 써도 넉넉하다.
-- 어떻게: 0001이 만든 제약(이름 user_states_state_size)을 한 문장 안에서 지우고 같은 이름으로 다시 만든다 — 한 문장이라 제약이 없는
--   순간이 없다. 지우는 쪽은 if exists라 그 이름이 없는 표에서도 실패하지 않는다.
-- NOT VALID를 쓰지 않는 까닭: 다시 만들 때 기존 행을 모두 검사한다(표를 잠근 채 한 번 훑는다). 행은 사용자 수만큼이고 모두 1MB보다
--   훨씬 작아 금방 끝난다. 1MB를 넘는 행이 있으면 이 파일 전체가 적용되지 않고(파일 하나 = 트랜잭션 하나) 배포가 실패한다 — 그 행을
--   확인할 기회가 생긴다. NOT VALID로 두면 그런 행을 모른 채 남기고, 그 사용자의 다음 저장부터 거절된다.
-- 웹에는 따로 바이트 상한이 없다(증상 기록 50건·기분 답 60건만 자른다). 1MB를 넘는 저장은 check 위반(23514)으로 거절되고,
--   웹은 동기화 오류로 두고 다시 시도한다(기록은 브라우저에 남는다).
-- pg_column_size: 새로 쓰는 값은 압축 전 jsonb 크기, 이미 저장된(압축된) 값은 저장된 크기로 잰다 — 새 쓰기에 더 엄격하다.

alter table public.user_states
  drop constraint if exists user_states_state_size,
  add constraint user_states_state_size check (pg_column_size(state) <= 1024 * 1024);
