-- 온맘 웹 — AI 상담을 켜기 위한 동의 기록 손보기: 두 동의 칸 + 서버 시각 + 본인 행 지우기(철회). 설명: docs/SUPABASE_FUNCTIONS.md
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
--
-- 왜: 0010의 ai_consents는 사용자당 판·동의 시각(브라우저 시각) 한 줄이고 지우기가 없었다(계정 삭제로만 지워짐). AI를 켜려면
--   ① 민감정보 처리와 국외 이전을 구분해 각각 동의받은 증빙(법 §23①1, §28의8①1 — 사전 검토 H3·H4, AI-4)
--   ② 브라우저가 바꿀 수 없는 서버 시각(AI-1) ③ 언제든 철회(법 §37① — AI-5)가 필요하다.
-- 무엇이 바뀌나
--   1) sensitive_agreed·transfer_agreed — 두 동의. 기본 false라 이미 있는 행(예전 판)은 동의가 없는 것으로 읽힌다(닫힌 쪽).
--      함수 chat은 지금 판이고 둘 다 true일 때만 답한다(supabase/functions/_shared/aiConsent.ts isCurrentAiConsent).
--   2) recorded_at — 서버 시각. 만들 때·바꿀 때마다 트리거가 적는다(0001 updated_at과 같다 — 브라우저가 보낸 값은 무시). accepted_at(브라우저 시각)은 그대로 둔다.
--   3) 지우기 — 로그인한 사용자가 본인 행만 지운다(RLS). 웹 설정 > 내 데이터의 철회(src/features/chat/aiConsentRecord.ts withdrawAiConsent).
--      행이 없으면 함수가 403 ai_consent_required로 막는다. 철회 기록은 따로 남기지 않는다(동의 기록 자체가 사라진다).
-- 권한: 0010 그대로에 지우기만 더한다 — authenticated는 본인 행 읽기·만들기·바꾸기·지우기, 공개 키(anon)는 없음, 함수(service_role)는 읽기만.
-- 처리방침·동의 문구: "동의한 내용과 일시"(features/privacy/dataItems.ts SETTING_ITEMS)에 든다. 질문·답·건강 정보는 이 표에 없다.
-- 먼저 0010(public.ai_consents)이 있어야 한다 — 아래 0)이 확인한다. 0011(관리자 통계)과는 서로 건드리는 것이 없다.
-- 여러 번 실행해도 같은 결과(칸은 있으면 건너뛰고, 정책·트리거는 지우고 다시 만들고, 함수는 새로 만든다). 확장(create extension)은 부르지 않는다(0006 머리말).
-- 비밀값·운영 주소는 이 파일에 없다. 파일 하나가 트랜잭션 하나다. 맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다(0009·0010과 같다).

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.ai_consents') is null then
    raise exception 'public.ai_consents가 없습니다 — 0010_ai_consents.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 두 동의 · 서버 시각 칸 ----------------------------------------------------------------------------------

alter table public.ai_consents add column if not exists sensitive_agreed boolean not null default false;
alter table public.ai_consents add column if not exists transfer_agreed boolean not null default false;
alter table public.ai_consents add column if not exists recorded_at timestamptz not null default now();

comment on table public.ai_consents is
  '온맘 웹 AI 답변 동의 기록 — 사용자당 한 행(판·동의 시각·서버 시각·민감정보 처리·국외 이전 두 동의). 질문·답 없음. 본인 행만(RLS — 지우면 철회), 함수 chat은 service_role로 읽음.';
comment on column public.ai_consents.version is '동의한 AI 답변 동의 글자의 판(supabase/functions/_shared/aiConsent.ts AI_CONSENT_VERSION).';
comment on column public.ai_consents.sensitive_agreed is 'AI 답변을 위한 민감정보(건강정보) 처리 동의.';
comment on column public.ai_consents.transfer_agreed is 'AI 답변을 위한 개인정보 국외 이전(Anthropic, 미국) 동의.';
comment on column public.ai_consents.recorded_at is '서버가 이 행을 만들거나 바꾼 시각 — 트리거가 적는다(브라우저가 보낸 값은 무시).';

-- 2) 서버 시각 — 만들 때·바꿀 때마다 서버 시각으로(브라우저가 보낸 값은 무시) ------------------------------------

create or replace function public.ai_consents_set_recorded_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recorded_at := now();
  return new;
end;
$$;

-- 트리거 함수는 직접 부를 일이 없다 — Supabase가 public 함수에 기본으로 주는 실행 권한을 거둔다(트리거는 권한 없이도 돈다)
revoke execute on function public.ai_consents_set_recorded_at() from public, anon, authenticated;

drop trigger if exists ai_consents_set_recorded_at on public.ai_consents;
create trigger ai_consents_set_recorded_at
  before insert or update on public.ai_consents
  for each row execute function public.ai_consents_set_recorded_at();

-- 3) 철회 — 본인 행 지우기 ------------------------------------------------------------------------------------

grant delete on table public.ai_consents to authenticated;

drop policy if exists "ai_consents: 본인 행 지우기" on public.ai_consents;
create policy "ai_consents: 본인 행 지우기" on public.ai_consents
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 4) PostgREST 스키마 다시 읽기 — 새 칸을 함수 chat과 웹이 바로 쓸 수 있게(0009·0010과 같다). 알림은 commit 때 간다.

notify pgrst, 'reload schema';
