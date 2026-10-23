-- 온맘 웹 — AI 답변 국외 이전 동의의 서버 기록(AI 상담을 공개하기 전 안전장치). 설명: docs/SUPABASE_FUNCTIONS.md
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
--
-- 왜: AI 상담·약물 체크의 국외 이전(Anthropic, 미국) 동의는 지금까지 브라우저(localStorage)에만 있었고, Edge Function chat은 로그인만
--   확인했다. 웹을 거치지 않고 함수를 직접 부르면 동의 없이 질문이 국외로 나갈 수 있었다. 이제 동의를 서버에 남기고 함수가 확인한다.
-- 1) public.ai_consents — 사용자당 한 행: 동의한 판(version)과 동의 시각(accepted_at). 질문·답·건강 정보는 없다.
--    웹이 [동의하고 계속하기] 뒤 서버 세션이 있을 때 쓴다(upsert — 같은 사용자는 판·시각만 바뀐다. src/features/chat/aiConsentRecord.ts).
--    함수 chat은 로그인 확인 뒤, 한도를 쓰거나 LLM을 부르기 전에 서버 키(service_role)로 "방금 확인한 사용자 id"의 행만 읽고,
--    판이 지금 판(supabase/functions/_shared/aiConsent.ts AI_CONSENT_VERSION)이 아니면 403 ai_consent_required로 끝낸다.
-- 권한: 로그인한 사용자(카카오·익명 게스트 = authenticated)가 본인 행만 읽고·만들고·바꾼다(RLS). 지우기는 두지 않는다 —
--   계정을 지우면(delete_my_account·게스트 자동 정리 → auth.users) on delete cascade로 함께 지워진다. 공개 키(anon)는 아무것도 못 한다.
-- 처리방침·동의 문구: "동의한 내용과 일시"(features/privacy/dataItems.ts SETTING_ITEMS, 보유 = 계정을 삭제할 때까지)에 든다.
-- 먼저 0003(llm_usage — AI 상담 이용 기록)이 있어야 한다 — 아래 0)이 확인한다.
-- 여러 번 실행해도 같은 결과(표는 있으면 건너뛰고, 제약·정책은 지우고 다시 만든다). 확장(create extension)은 부르지 않는다(0006 머리말).
-- 비밀값·운영 주소는 이 파일에 없다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.llm_usage') is null then
    raise exception 'public.llm_usage가 없습니다 — 0003_llm_usage.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) AI 국외 이전 동의 기록 --------------------------------------------------------------------------------

create table if not exists public.ai_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 동의한 판(예: web-2026-09-28.2) — 웹·함수가 같은 값(_shared/aiConsent.ts AI_CONSENT_VERSION)을 쓴다
  version text not null,
  -- 동의 시각 — 웹이 [동의하고 계속하기]를 누른 브라우저 시각을 보낸다(0001 consent_accepted_at과 같은 방식). 없으면 서버 시각.
  accepted_at timestamptz not null default now()
);

-- 판 글자 수(잘못된·과한 쓰기 방지) — 표를 먼저 만든 적이 있어도 같은 제약이 하나만 있게 지우고 다시 만든다
alter table public.ai_consents drop constraint if exists ai_consents_version_length;
alter table public.ai_consents add constraint ai_consents_version_length
  check (char_length(version) between 1 and 64);

comment on table public.ai_consents is
  '온맘 웹 AI 답변 국외 이전(Anthropic) 동의 기록 — 사용자당 한 행(판·동의 시각). 질문·답 없음. 본인 행만(RLS), 함수 chat은 service_role로 읽음.';
comment on column public.ai_consents.version is '동의한 AI 국외 이전 동의 글자의 판(supabase/functions/_shared/aiConsent.ts AI_CONSENT_VERSION).';
comment on column public.ai_consents.accepted_at is '그 동의를 받은 시각(브라우저 시각).';

-- 권한 — 로그인한 사용자는 읽기·만들기·바꾸기(upsert)만, 공개 키(anon)는 없음. 함수 chat(service_role)은 읽기만.
-- (2026-05-30 이후 새 프로젝트는 public 표에 권한을 자동으로 주지 않는다 — 0001처럼 여기서 명시한다)
revoke all on table public.ai_consents from public, anon, authenticated, service_role;
grant select, insert, update on table public.ai_consents to authenticated;
grant select on table public.ai_consents to service_role;

alter table public.ai_consents enable row level security;

drop policy if exists "ai_consents: 본인 행 읽기" on public.ai_consents;
create policy "ai_consents: 본인 행 읽기" on public.ai_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_consents: 본인 행 만들기" on public.ai_consents;
create policy "ai_consents: 본인 행 만들기" on public.ai_consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_consents: 본인 행 바꾸기" on public.ai_consents;
create policy "ai_consents: 본인 행 바꾸기" on public.ai_consents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
