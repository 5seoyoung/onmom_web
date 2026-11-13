-- 온맘 웹 — 카카오 연결 해제 웹훅이 부르는 계정 삭제 함수(public.delete_user_by_kakao_id).
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0001(user_states·delete_my_account)이 있어야 한다 — 아래 0)이 확인한다. 여러 번 실행해도 같은 결과. 파일 하나가 트랜잭션 하나다.
--
-- 왜(법률 자체 검토 2026-11 L13·F4, 대표 결정 Q5 대기): 이용자가 카카오계정 설정·카카오톡 연결 서비스 관리·카카오계정 탈퇴로 온맘 연결을
--   먼저 끊으면 카카오가 연결 해제 웹훅을 보낸다(https://developers.kakao.com/docs/ko/kakaologin/callback). 그때 그 카카오 회원번호의
--   온맘 계정과 기록을 지운다 — 처리방침 5절에 넣을 문장: "카카오계정 설정에서 온맘 연결을 먼저 끊으면, 온맘은 카카오의 알림을 받아
--   그 계정과 기록을 삭제합니다."(웹훅을 켜는 날 7일 전 공지와 함께).
-- 이 함수는 Edge Function "account"(functions/account/handler.ts)가 웹훅의 Authorization: KakaoAK <어드민 키>를 확인한 뒤에만 서버 키로 부른다.
--   함수 비밀값 KAKAO_ADMIN_KEY가 없으면 웹훅은 401이라 이 함수는 불리지 않는다(꺼진 채로 배포).
--
-- 원칙
-- - 서버 키(service_role)만 부를 수 있다 — 브라우저(anon·authenticated)는 못 부른다. 다른 사람의 계정을 지우는 함수이기 때문이다.
-- - 카카오 identity(auth.identities provider='kakao')의 provider_id가 같은 계정만 지운다. 게스트(익명)·다른 공급자는 건드리지 않는다.
-- - 지우는 순서는 delete_my_account(0001)와 같다: user_states 행 → auth.users(세션·identity·ai_consents·llm_usage 등은 on delete cascade).
-- - 지운 계정 수만 돌려준다. 사용자 id·카카오 회원번호를 어디에도 남기지 않는다(함수 로그도 code만).
-- - 회원번호는 숫자(1~20자리)만 받는다 — 그 밖은 22023.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.user_states') is null or to_regprocedure('public.delete_my_account()') is null then
    raise exception 'public.user_states·delete_my_account가 없습니다 — 0001_user_states.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 카카오 회원번호로 계정 삭제 ----------------------------------------------------------------------------

create or replace function public.delete_user_by_kakao_id(p_kakao_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  targets uuid[];
  removed integer;
begin
  if p_kakao_id is null or p_kakao_id !~ '^[0-9]{1,20}$' then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct i.user_id), '{}')
    into targets
    from auth.identities i
   where i.provider = 'kakao'
     and i.provider_id = p_kakao_id;

  if cardinality(targets) = 0 then
    return 0;
  end if;

  delete from public.user_states where user_id = any (targets);
  delete from auth.users where id = any (targets); -- 세션·identity·동의·이용 기록도 함께 지워진다(on delete cascade)
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.delete_user_by_kakao_id(text) is
  '카카오 연결 해제 웹훅(Edge Function account)이 서버 키로만 부른다 — 그 카카오 회원번호의 온맘 계정과 기록을 지우고 지운 수를 돌려준다(0017).';

-- Supabase는 public 함수에 기본으로 실행 권한을 준다 — 모두 막고 서버 키에만 연다
revoke execute on function public.delete_user_by_kakao_id(text) from public, anon, authenticated;
grant execute on function public.delete_user_by_kakao_id(text) to service_role;

notify pgrst, 'reload schema';
