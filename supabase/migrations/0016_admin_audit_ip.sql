-- 온맘 웹 — 관리자 접근 기록(public.admin_audit)에 접속지(IP)를 더한다.
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0005(admin_audit)가 있어야 한다 — 아래 0)이 확인한다. 여러 번 실행해도 같은 결과. 파일 하나가 트랜잭션 하나다.
--
-- 왜: 개인정보의 안전성 확보조치 기준(개인정보보호위원회 고시) 제2조 제3호 — 접속기록은 "식별자, 접속일시, 접속지 정보, 처리한 정보주체
--   정보, 수행업무 등"이다. 0009는 접속지를 CPO·법률 확인 뒤로 미뤄 남기지 않았다. 2026-11-12 법률 자체 검토(LEGAL_SELF_REVIEW_2026-11 F3)가
--   남기라고 정했다 — 관리자(개인정보취급자)의 정보이지 이용자의 정보가 아니다.
--
-- 어떻게: 관리자 함수마다 고치지 않고, admin_audit에 줄이 들어갈 때(before insert) 트리거가 그 요청의 머리글에서 접속지를 읽어 채운다 —
--   0005·0009·0011·0013·0014의 모든 관리자 함수(조회·찾기·통계·CSV·삭제)가 같은 표에 쓰므로 한 곳으로 모두 덮인다.
--   읽는 머리글: cf-connecting-ip(Supabase 앞단의 Cloudflare가 접속한 주소로 덮어쓴다 — 브라우저가 보낸 값이 아니다. 2026-11-13 API 게이트웨이
--   로그에서 이 머리글이 오는 것을 확인했다). IP 모양이 아니면 버린다(지어내지 않는다).
--   SQL Editor·예약 작업처럼 HTTP 요청이 아닌 곳에서는 머리글이 없어 null이다. 부르는 쪽이 칸을 채워 보내도 트리거가 덮어쓴다.
-- 보존: 줄과 같이 2년(0009 cleanup_admin_audit). 이용자 정보가 아니므로 처리방침 5절의 관리자 기록 항목에 "접속지(IP)"를 더한다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.admin_audit') is null then
    raise exception 'public.admin_audit이 없습니다 — 0005_admin_tools.sql을 먼저 적용하세요';
  end if;
end;
$$;

-- 1) 칸 — 기본값 없는 null 칸이라 표를 다시 쓰지 않는다. IP 모양(45자 이하)만 들어간다 --------------------------------

alter table public.admin_audit add column if not exists ip text;

alter table public.admin_audit
  drop constraint if exists admin_audit_ip_length,
  add constraint admin_audit_ip_length check (ip is null or char_length(ip) <= 45);

comment on column public.admin_audit.ip is
  '관리자가 접속한 곳의 IP(요청 머리글 cf-connecting-ip — 0016 트리거가 채움). SQL Editor·예약은 null. 2년 보관(0009).';

-- 2) 트리거 — 줄이 들어갈 때 요청 머리글에서 접속지를 채운다 ------------------------------------------------------------
-- SECURITY DEFINER가 아니다(머리글은 그 요청의 설정값이라 권한이 필요 없다). search_path를 비워 이름 바꿔치기를 막는다.

create or replace function public.admin_audit_set_ip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  headers jsonb;
  raw text;
begin
  new.ip := null;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  raw := nullif(trim(headers ->> 'cf-connecting-ip'), '');
  if raw is not null then
    begin
      new.ip := host(raw::inet);
    exception when others then
      new.ip := null;
    end;
  end if;
  return new;
end;
$$;

comment on function public.admin_audit_set_ip() is
  'admin_audit 줄의 접속지(IP)를 요청 머리글 cf-connecting-ip에서 채우는 트리거 함수(0016). 직접 부르지 않는다.';

revoke execute on function public.admin_audit_set_ip() from public, anon, authenticated, service_role;

drop trigger if exists admin_audit_ip on public.admin_audit;
create trigger admin_audit_ip
  before insert on public.admin_audit
  for each row execute function public.admin_audit_set_ip();
