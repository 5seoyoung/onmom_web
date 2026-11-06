-- 온맘 웹 — 관리자 이용 통계(익명 집계만): /admin/ "이용 통계(집계)" 카드가 부르는 public.admin_usage_stats(p_days).
-- 보통은 GitHub Actions "Supabase" 워크플로(supabase db push)가 적용한다. 대시보드 SQL Editor에 통째로 붙여 넣어도 된다.
-- 먼저 0001(user_states 동의 칸)·0002(is_admin·admins)·0005(admin_audit)·0009(admin_audit.subject_count)가 있어야 한다 — 아래 0)이 확인한다.
-- 여러 번 실행해도 같은 결과(함수는 같은 이름·인자로 새로 만든다). 표·칸·예약·확장은 만들거나 바꾸지 않는다(create extension 없음).
-- 파일 하나가 트랜잭션 하나다 — 중간에 실패하면 아무것도 바뀌지 않는다. 맨 끝에서 PostgREST에 스키마를 다시 읽으라고 알린다(0009와 같다).
--
-- 왜: 서비스를 고치려면 얼마나·어떻게 쓰이는지(증상 기록·기분 답·기록장 글, 재방문)와 누가 쓰는지(산후 주차·분만 방식·목표)를 알아야 한다.
--   그런데 개인정보처리방침·동의는 "운영자는 개인의 건강 기록을 보지 않는다"고 약속한다(외부 법률 검토 없음 — 이 약속이 기준이다).
--   그래서 이 함수는 건강 기록(user_states.state)을 서버 안에서만 읽어 익명 집계로 바꾸고, 사람 하나하나의 값은 어디에도 내보내지 않는다.
--   처리방침·동의 문구의 "서비스 개선 통계" 목적은 그 파일들(features/privacy·onboarding)이 따로 더한다 — 이 파일은 그 문구를 고치지 않는다.
--
-- 누구를 세나: 통계 목적에 동의한 사람 = user_states.consent_version이 'web-2026-11-06' 이상인 행. "서비스 개선 통계" 목적은 그 판의 동의 문구부터
--   있으므로 그보다 옛 판(web-2026-09-28 등)에 동의한 사람은 건강 기록을 서버에 저장하는 데는 동의했어도 통계에는 넣지 않는다. 판이 없는 행도 넣지 않는다.
--   판 이름은 web-YYYY-MM-DD라 글자 비교로 시간 순서가 맞다 — 데이터베이스의 정렬 규칙에 기대지 않게 글자 그대로(collate "C") 견준다.
--   이 기준은 계정 수(totals)·건강 기록 집계·k = 5·접근 기록의 사람 수 모두에 같다. 웹이 그 판을 내고 이용자가 다시 동의하기 전까지 이 수는 0이다.
--   관리자 계정(public.admins)은 뺀다 — 보는 사람이 자기 기록을 빼고 계산해 남은 4명을 좁히지 못하게(k를 한 명 깎지 않게), 그리고 운영자의
--   시험 기록이 통계에 섞이지 않게. 그래서 이 수는 한눈에 보기(admin_overview)의 "서버 기록"·"동의 완료" 수보다 적을 수 있다.
--
-- 원칙(익명 집계 — k-익명성, k = 5)
-- - 돌려주는 것은 사람 수·기록 수(와 그 날짜·칸 이름)뿐이다. 계정 ID·생년월일·출산일·자유 글(기록장 제목·본문·댓글·작성자 이름·내 동네)·
--   기록 하나하나·사람별 값은 돌려주지 않는다. 사람별로 펼쳐 보는 길(drill-down)도, 그런 인자도 없다(인자는 기간 하나).
-- - 규칙 C(전체): 통계 목적에 동의한 사람이 5명 미만이면 건강 기록을 아예 열지 않는다 — 건강 기록에서 나오는 모든 칸(daily·adoption·return_rate·
--   distributions)이 null이고 suppressed = true다. 계정 수(totals — 표의 칸에서 센다, admin_overview와 같은 수준)만 보인다.
-- - 규칙 A(이용 수 — daily·adoption·return_rate): 한 칸에 기여한 서로 다른 사람이 1~4명이면 null. 0명이면 0(기여한 사람이 없다).
-- - 규칙 B(분포 — 산후 주차·분만 방식·목표·기분 답·병원 안내 비율): 한 칸에 든 서로 다른 사람이 5명 미만이면(0명 포함 — "모두가 한 칸에
--   있다"도 그 사람들의 건강 정보다) 그 칸은 null. 그리고 숨긴 칸을 뺄셈(합계 − 보이는 칸)으로 되살리지 못하게, 숨긴 칸이 하나뿐이거나
--   숨긴 칸을 합쳐도 5명이 안 되면 보이는 칸 중 가장 작은 칸(기록·사람 수가 가장 적은 칸, 같으면 뒤쪽 칸)을 하나 더 숨긴다(보완 숨김).
--   보이는 칸은 5명 이상이므로 한 번 더 숨기면 늘 충분하다. 모든 칸이 숨겨지면 그 분포 전체가 null.
--   예외: 답이 비어 있다는 칸(unknown — 출산일 없음·미설정)은 5명 미만이면 숨기지만, 그 칸만 숨겨졌을 때는 다른 칸을 더 숨기지 않는다. 건강 정보가
--   아니라 답이 없다는 뜻이라 뺄셈으로 알아내도 드러나는 것이 없고, 온보딩을 마친 사람은 거의 다 답해 이 칸이 늘 0에 가깝다 — 이 칸 때문에 매번
--   둘째로 큰 칸까지 숨기면 분만 방식·목표 분포는 한 칸밖에 보이지 않는다. 다른 칸이 함께 숨겨지면 앞의 규칙이 그대로다("모두가 한 칸에 있다"도 숨는다).
-- - 기록 분포(기분 답·병원 안내)는 수 대신 반올림한 비율(%)만 준다. 기간의 기록 합계나 칸의 수를 주면 날짜별 칸의 합과 빼서 숨긴 날의 값을
--   되살릴 수 있다(합계 848 − 보이는 날 합계 847 = 숨긴 날 1건). 비율만 주면 합계가 나가지 않고, 기간끼리·날마다 값을 빼 보기도 어려워진다.
-- - 병원 안내: 증상 기록에 남은 결과(redFlagCode — rules/record.ts buildSymptomRecord가 즉시 병원 신호의 코드를 남긴다)가 비어 있지 않은
--   글자이면 병원 안내가 나온 기록으로 센다. 오늘의 코드 목록을 적지 않는다 — 규칙(RULES_VERSION)이 새 경고 신호를 더해도 그대로 센다.
-- - 기분 답: yes·unsure·no(화면 "네·글쎄요·아니요"). 모르는 값은 앱(rules/mood.ts normalizeMoodAnswer)처럼 unsure로 센다.
-- - 하루 = 한국 시간(Asia/Seoul) 자정 기준(0002와 같다). 기간 = 오늘 포함 최근 p_days일(7~90으로 맞춘다, 없으면 30).
-- - 기록 시각은 상태 JSON의 date(ISO 8601 — 웹은 toISOString으로 쓴다). 못 읽는 값(형식이 다르거나 없는 날짜 2026-02-31 등)은 세지 않는다 —
--   한 사람의 손상된 기록 때문에 함수 전체가 실패하지 않게, 날짜로 바꾸기 전에 날짜 부분이 실제 날짜인지·시각 부분의 모양이 맞는지 먼저 본다
--   (아래 period_events). 출산일("YYYY-MM-DD")도 모양과 그 달의 날 수를 먼저 본다.
-- - 남는 위험(운영 규칙): 7·30·90일은 겹치는 기간이고 날마다 값이 바뀐다. 기간끼리·날마다 숫자를 빼 보거나 사용자 목록(마지막 저장일)과
--   맞춰 보면 작은 무리를 좁힐 수 있다 — k = 5는 최소 기준이지 완전한 보장이 아니다. 그렇게 특정인을 추론하지 않는다(접근 기록이 남는다).
--
-- 돌려주는 JSON(jsonb) — 수는 모두 0 이상의 정수, 날짜는 "YYYY-MM-DD"(한국 날짜):
--   { "generated_at": 시각, "days": 7~90, "period": { "from": 첫날, "to": 오늘 }, "k": 5, "suppressed": 참/거짓,
--     "totals": { "consented_users": 통계 목적에 동의한 사람(관리자 제외), "active_users": 그중 기간 안에 서버 기록이 바뀐 사람(updated_at) },
--     "daily": [ { "day", "symptom_records", "mood_answers", "journal_posts" } × days ]                    -- 규칙 A, 오래된 날 → 오늘
--     "adoption": { "symptom_records", "mood_answers", "journal_posts" }                                   -- 규칙 A, 기간 안에 1건 이상 남긴 사람 수
--     "return_rate": { "recording_users", "returning_users" }                                             -- 규칙 A, 기록한 사람 · 서로 다른 이틀 이상 기록한 사람
--     "distributions": {                                                                                  -- 규칙 B, 사람 분포는 { "total", "counts" }, 기록 분포는 { "percents" }(0~100 정수), 모두 숨기면 null
--       "postpartum_weeks": 통계에 동의한 사람 기준·오늘 기준 { weeks_0_1, weeks_2_5, weeks_6_11, weeks_12_plus, unknown(출산일 없음) },
--       "delivery_method": 통계에 동의한 사람 기준 { vaginal, cesarean, unknown },  "goal": 통계에 동의한 사람 기준 { homemaker, returning_to_work, unknown },
--       "mood_answers": 기간 안 답 기준 { yes, unsure, no },  "red_flag": 기간 안 증상 기록 기준 { red_flag, other } } }
--   suppressed = true이면 daily·adoption·return_rate·distributions는 모두 null이다.
--
-- 접근 기록(0009와 같다): 부를 때마다 admin_audit에 한 줄 — actor(부른 관리자) · action 'usage_stats' · subject_count(집계에 든 사람 수 =
--   통계 목적에 동의한 사람, 관리자 제외). 결과와 같은 트랜잭션이라 기록을 남기지 못하면 결과도 나가지 않는다. 기간(p_days)은 남기지 않는다(칸이 없다).
--   권한이 없어 거절된 호출(42501)은 남지 않는다(오류와 함께 되돌아간다).
-- 권한: SECURITY DEFINER(모든 사람의 행을 읽으려면 함수 주인 권한이 필요) + search_path ''(이름 바꿔치기 방지), 맨 앞에서 is_admin()을 확인하고
--   아니면 42501. 공개 키(anon)로는 부를 수 없다. 기록을 쓰므로 volatile — 웹은 supabase.rpc(POST)로 부른다(0009 머리말).
-- 성능: user_states를 한 번 읽고 사람마다 상태 JSON을 한 번만 풀며(base), 기록 시각은 기록마다 한 번만 바꾼다(period_events).
--   사람마다 증상 기록 최대 50건·기분 답 최대 60건(domain/types.ts). 로컬 시험(Postgres 17, 5,000명이 모두 최대치 + 기록장 글 10개)에서
--   7일은 약 1초, 90일은 약 3초 — Supabase의 로그인 사용자 요청 제한(8초) 안이다. 사람이 크게 늘면 이 수치를 다시 잰다.

-- 0) 먼저 있어야 하는 것 확인 ------------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.user_states') is null or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_states' and column_name = 'consent_version'
  ) then
    raise exception 'public.user_states(동의 칸 consent_version)가 없습니다 — 0001_user_states.sql을 먼저 적용하세요';
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

-- 1) 이용 통계 ---------------------------------------------------------------------------------------------
-- 순서: 관리자 확인 → 계정 수(표의 칸만 — 건강 기록을 열지 않는다) → 5명 이상일 때만 건강 기록 집계(규칙 A·B) → 접근 기록 → 결과.
-- 집계 단계(아래 with …)의 결과는 사람 하나의 값이 아니라 칸의 수다. 사람별 행(base·raw_events·period_events·per_user·user_masks)은
--   함수 안에서만 쓰이고 결과에는 그 수만 들어간다. 날짜 글자는 모양을 먼저 본 뒤에만 날짜로 바꾼다(case는 앞 조건부터 차례로 본다).

create or replace function public.admin_usage_stats(p_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 숨김 기준 — 화면(adminModel USAGE_K)과 같아야 한다(adminUsageStatsSql.test.ts)
  k_min constant integer := 5;
  -- 통계에 드는 동의 판의 시작 — "서비스 개선 통계" 목적이 들어간 판. 화면(adminModel USAGE_CONSENT_FROM)과 같아야 한다(adminUsageStatsSql.test.ts)
  stats_consent_from constant text := 'web-2026-11-06';
  -- 기간(일) — 7~90, 없으면 30(화면 clampUsageDays와 같은 규칙)
  window_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  seoul_today date := (now() at time zone 'Asia/Seoul')::date;
  first_day date;
  consented integer;
  active integer;
  stats jsonb;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  first_day := seoul_today - (window_days - 1);

  -- 계정 수 — 동의 칸·수정 시각만 본다(건강 기록 state를 열지 않는다). 통계 목적의 판부터, 관리자 계정은 뺀다(머리말).
  select
    count(*),
    count(*) filter (where s.updated_at >= (first_day::timestamp at time zone 'Asia/Seoul'))
  into consented, active
  from public.user_states s
  where s.consent_version collate "C" >= stats_consent_from
    and not exists (select 1 from public.admins a where a.user_id = s.user_id);

  result := jsonb_build_object(
    'generated_at', now(),
    'days', window_days,
    'period', jsonb_build_object('from', first_day, 'to', seoul_today),
    'k', k_min,
    'suppressed', consented < k_min,
    'totals', jsonb_build_object('consented_users', consented, 'active_users', active),
    'daily', null,
    'adoption', null,
    'return_rate', null,
    'distributions', null
  );

  -- 규칙 C — 통계 목적에 동의한 사람이 5명 미만이면 건강 기록을 읽지 않고 위의 null을 그대로 돌려준다
  if consented >= k_min then
    with base as materialized (
      -- 집계에 드는 사람(통계 목적에 동의함 · 관리자 아님 — 위 계정 수와 같은 조건)마다 필요한 조각만 꺼낸다 — 함수 밖으로 나가지 않는다.
      -- 배열이 아니면 빈 배열(손상된 JSON에도 실패하지 않게). 기록장 글은 시각만 남긴다(제목·본문·댓글·작성자 이름은 읽지 않는다).
      select s.user_id,
        case when jsonb_typeof(x.doc -> 'symptomHistory') = 'array' then x.doc -> 'symptomHistory' else '[]'::jsonb end as symptoms,
        case when jsonb_typeof(x.doc -> 'moodChecks') = 'array' then x.doc -> 'moodChecks' else '[]'::jsonb end as moods,
        case when jsonb_typeof(x.doc -> 'communityPosts') = 'array' then array(
          select p.item ->> 'date' from jsonb_array_elements(x.doc -> 'communityPosts') as p(item) where jsonb_typeof(p.item) = 'object'
        ) else array[]::text[] end as post_dates,
        x.doc -> 'profile' ->> 'deliveryDate' as delivery_date,
        x.doc -> 'profile' ->> 'deliveryMethod' as delivery_method,
        x.doc -> 'profile' ->> 'goal' as goal
      from public.user_states s
      -- 상태 JSON을 사람마다 한 번만 푼다(offset 0 — 이 하위 질의를 펼치면 위 칸마다 큰 JSON을 다시 푼다. 5천 명에서 8초를 넘겼다)
      cross join lateral (select s.state || '{}'::jsonb as doc offset 0) x
      where s.consent_version collate "C" >= stats_consent_from
        and not exists (select 1 from public.admins a where a.user_id = s.user_id)
    ),
    raw_events as (
      -- 기록 하나 = 한 줄(누가·무엇을·언제) — 객체가 아닌 원소는 건너뛴다
      select b.user_id, 'symptom'::text as kind, e.item ->> 'date' as at_text,
        coalesce(jsonb_typeof(e.item -> 'redFlagCode') = 'string' and (e.item ->> 'redFlagCode') <> '', false) as red_flag,
        null::text as answer
      from base b
      cross join lateral jsonb_array_elements(b.symptoms) as e(item)
      where jsonb_typeof(e.item) = 'object'
      union all
      select b.user_id, 'mood'::text, e.item ->> 'date', false,
        case when (e.item ->> 'answer') in ('yes', 'unsure', 'no') then e.item ->> 'answer' else 'unsure' end
      from base b
      cross join lateral jsonb_array_elements(b.moods) as e(item)
      where jsonb_typeof(e.item) = 'object'
      union all
      select b.user_id, 'journal'::text, p.at_text, false, null::text
      from base b
      cross join lateral unnest(b.post_dates) as p(at_text)
    ),
    period_events as materialized (
      -- 기록 시각 → 한국 날짜. 기간 밖(미래 포함)·못 읽는 시각은 뺀다(세지 않는다). 시각 글자를 날짜로 바꾸다 실패하는 일이 없게:
      -- ① 앞 10자(YYYY-MM-DD)가 기간 앞뒤로 하루씩 넓힌 실제 날짜 목록(w)에 있어야 한다 — 없는 날짜(2026-02-31)·다른 모양·기간 밖이 여기서 빠진다.
      -- ② 웹이 쓰는 모양(toISOString — UTC "Z", 24자): 한국 날짜 = 그 UTC 날짜 + (UTC 15시부터는 하루). 한국은 서머타임이 없다(+9시간).
      -- ③ 그 밖의 ISO 8601(시간대 표기 등)은 시각 부분의 모양을 본 뒤에만 timestamptz로 바꾼다.
      -- 바꾸기는 기록마다 한 번(offset 0 — 아래 where가 이 계산 안으로 밀려 들어가 두 번 계산하지 않게).
      select r.user_id, r.kind, r.red_flag, r.answer, p.day
      from raw_events r
      join (
        select first_day + g.i as d, to_char(first_day + g.i, 'YYYY-MM-DD') as ymd
        from generate_series(-1, window_days) as g(i)
      ) w on w.ymd = left(r.at_text, 10)
      cross join lateral (
        select
          case
            when length(r.at_text) = 24 and substr(r.at_text, 11, 1) = 'T' and right(r.at_text, 1) = 'Z'
              and translate(substr(r.at_text, 12, 2), '0123456789', '') = '' and substr(r.at_text, 12, 2) <= '23'
              then w.d + case when substr(r.at_text, 12, 2) >= '15' then 1 else 0 end
            when substr(r.at_text, 11) ~ '^T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])$'
              then (r.at_text::timestamptz at time zone 'Asia/Seoul')::date
          end as day
        offset 0
      ) p
      where p.day between first_day and seoul_today
    ),
    daily as (
      -- 날마다 종류별 기록 수(n)와 그날 기록한 서로 다른 사람 수(u) — 기록이 없는 날도 한 줄
      select d.day,
        count(pe.user_id) filter (where pe.kind = 'symptom') as symptom_n,
        count(distinct pe.user_id) filter (where pe.kind = 'symptom') as symptom_u,
        count(pe.user_id) filter (where pe.kind = 'mood') as mood_n,
        count(distinct pe.user_id) filter (where pe.kind = 'mood') as mood_u,
        count(pe.user_id) filter (where pe.kind = 'journal') as journal_n,
        count(distinct pe.user_id) filter (where pe.kind = 'journal') as journal_u
      from (select first_day + g.i as day from generate_series(0, window_days - 1) as g(i)) d
      left join period_events pe on pe.day = d.day
      group by d.day
    ),
    per_user as (
      -- 사람마다 기간 안에 무엇을 썼는지와 기록한 날 수 — 아래 activity의 수로만 쓴다
      select pe.user_id,
        bool_or(pe.kind = 'symptom') as has_symptom,
        bool_or(pe.kind = 'mood') as has_mood,
        bool_or(pe.kind = 'journal') as has_journal,
        count(distinct pe.day) as active_days
      from period_events pe
      group by pe.user_id
    ),
    activity as (
      select
        count(*) filter (where pu.has_symptom) as symptom_users,
        count(*) filter (where pu.has_mood) as mood_users,
        count(*) filter (where pu.has_journal) as journal_users,
        count(*) as recording_users,
        count(*) filter (where pu.active_days >= 2) as returning_users
      from per_user pu
    ),
    dist_keys (dist, bucket, key) as (
      -- 분포의 칸 — 순서(bucket)는 화면(adminModel USAGE_DISTRIBUTIONS)과 같아야 한다(adminUsageStatsSql.test.ts)
      values
        ('postpartum_weeks', 1, 'weeks_0_1'), ('postpartum_weeks', 2, 'weeks_2_5'), ('postpartum_weeks', 3, 'weeks_6_11'),
        ('postpartum_weeks', 4, 'weeks_12_plus'), ('postpartum_weeks', 5, 'unknown'),
        ('delivery_method', 1, 'vaginal'), ('delivery_method', 2, 'cesarean'), ('delivery_method', 3, 'unknown'),
        ('goal', 1, 'homemaker'), ('goal', 2, 'returning_to_work'), ('goal', 3, 'unknown'),
        ('mood_answers', 1, 'yes'), ('mood_answers', 2, 'unsure'), ('mood_answers', 3, 'no'),
        ('red_flag', 1, 'red_flag'), ('red_flag', 2, 'other')
    ),
    dist_items as (
      -- 분포에 세는 것 하나 = 한 줄(어느 분포·누구·어느 칸). 프로필 분포는 사람마다 한 줄, 기분 답·병원 안내는 기록마다 한 줄.
      -- 산후 주차: 오늘(한국 날짜)까지의 출산일 차이 ÷ 7(앱 domain/date.ts weekFromDayCount와 같다). 출산일이 없거나 못 읽거나
      --   내일보다 뒤(한국보다 시간이 빠른 곳의 오늘까지는 0주)면 unknown.
      select 'postpartum_weeks'::text as dist, b.user_id,
        case
          when dd.delivered is null or dd.delivered > seoul_today + 1 then 5
          when greatest(seoul_today - dd.delivered, 0) / 7 <= 1 then 1
          when (seoul_today - dd.delivered) / 7 <= 5 then 2
          when (seoul_today - dd.delivered) / 7 <= 11 then 3
          else 4
        end as bucket
      from base b
      cross join lateral (
        select
          case
            when b.delivery_date is null or b.delivery_date !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              then null
            when substr(b.delivery_date, 9, 2)::integer > extract(day from (
                make_date(substr(b.delivery_date, 1, 4)::integer, substr(b.delivery_date, 6, 2)::integer, 1) + interval '1 month - 1 day'
              ))::integer
              then null
            else b.delivery_date::date
          end as delivered
      ) dd
      union all
      select 'delivery_method'::text, b.user_id,
        case b.delivery_method when 'vaginal' then 1 when 'cesarean' then 2 else 3 end
      from base b
      union all
      select 'goal'::text, b.user_id,
        case b.goal when 'homemaker' then 1 when 'returningToWork' then 2 else 3 end
      from base b
      union all
      select 'mood_answers'::text, pe.user_id,
        case pe.answer when 'yes' then 1 when 'unsure' then 2 else 3 end
      from period_events pe
      where pe.kind = 'mood'
      union all
      select 'red_flag'::text, pe.user_id, case when pe.red_flag then 1 else 2 end
      from period_events pe
      where pe.kind = 'symptom'
    ),
    buckets as (
      -- 칸마다 센 수(n — 사람 또는 기록)와 그 칸에 든 서로 다른 사람 수(u). 빈 칸도 한 줄(n = u = 0).
      select k.dist, k.bucket, k.key, count(i.user_id) as n, count(distinct i.user_id) as u
      from dist_keys k
      left join dist_items i on i.dist = k.dist and i.bucket = k.bucket
      group by k.dist, k.bucket, k.key
    ),
    user_masks as (
      -- 사람마다 그 분포에서 든 칸들(비트) — 숨긴 칸 여럿에 든 서로 다른 사람 수를 셀 때만 쓴다
      select i.dist, i.user_id, bit_or(1 << (i.bucket - 1)) as mask
      from dist_items i
      group by i.dist, i.user_id
    ),
    first_hidden as (
      -- 규칙 B ①: 5명 미만(0명 포함)인 칸. real_hidden_n은 그중 답이 비어 있다는 칸(unknown)을 뺀 수 — 지킬 건강 정보가 있는 칸
      select b.dist,
        bit_or(case when b.u < k_min then 1 << (b.bucket - 1) else 0 end) as mask,
        count(*) filter (where b.u < k_min) as hidden_n,
        count(*) filter (where b.u < k_min and b.key <> 'unknown') as real_hidden_n,
        (1 << (count(*)::integer)) - 1 as all_mask
      from buckets b
      group by b.dist
    ),
    hidden_users as (
      -- 숨긴 칸들에 든 서로 다른 사람 수
      select f.dist, count(m.user_id) as users
      from first_hidden f
      left join user_masks m on m.dist = f.dist and (m.mask & f.mask) <> 0
      group by f.dist
    ),
    extra_hidden as (
      -- 규칙 B ②: 지킬 칸이 숨겨졌고 숨긴 칸이 하나뿐이거나 합쳐도 5명 미만이면, 보이는 칸 중 가장 작은 칸(같으면 뒤쪽 칸)을 하나 더 숨긴다
      select distinct on (b.dist) b.dist, 1 << (b.bucket - 1) as mask
      from buckets b
      join first_hidden f on f.dist = b.dist
      join hidden_users h on h.dist = b.dist
      where f.real_hidden_n > 0
        and (f.hidden_n = 1 or h.users < k_min)
        and (f.mask & (1 << (b.bucket - 1))) = 0
      order by b.dist, b.n, b.bucket desc
    ),
    final_hidden as (
      select f.dist, f.mask | coalesce(x.mask, 0) as mask, f.all_mask
      from first_hidden f
      left join extra_hidden x on x.dist = f.dist
    ),
    dist_json as (
      -- 분포 하나 — 숨긴 칸은 null, 모든 칸이 숨겨지면 분포 전체가 null.
      -- 사람 분포는 { total, counts }. 기록 분포(기분 답·병원 안내)는 { percents }만 — 합계·칸의 수를 내보내지 않는다(머리말).
      select b.dist,
        case
          when fh.mask = fh.all_mask then null
          when b.dist in ('mood_answers', 'red_flag') then jsonb_build_object(
            'percents', jsonb_object_agg(
              b.key,
              case when (fh.mask & (1 << (b.bucket - 1))) <> 0 then null else round(100.0 * b.n / nullif(b.dist_n, 0))::integer end
            )
          )
          else jsonb_build_object(
            'total', sum(b.n),
            'counts', jsonb_object_agg(b.key, case when (fh.mask & (1 << (b.bucket - 1))) <> 0 then null else b.n end)
          )
        end as value
      from (select x.dist, x.bucket, x.key, x.n, sum(x.n) over (partition by x.dist) as dist_n from buckets x) b
      join final_hidden fh on fh.dist = b.dist
      group by b.dist, fh.mask, fh.all_mask
    )
    select jsonb_build_object(
      -- 규칙 A — 기여한 사람 0명이면 0, 1~4명이면 null
      'daily', (
        select jsonb_agg(jsonb_build_object(
          'day', d.day,
          'symptom_records', case when d.symptom_u = 0 then 0 when d.symptom_u < k_min then null else d.symptom_n end,
          'mood_answers', case when d.mood_u = 0 then 0 when d.mood_u < k_min then null else d.mood_n end,
          'journal_posts', case when d.journal_u = 0 then 0 when d.journal_u < k_min then null else d.journal_n end
        ) order by d.day)
        from daily d
      ),
      'adoption', (
        select jsonb_build_object(
          'symptom_records', case when a.symptom_users = 0 then 0 when a.symptom_users < k_min then null else a.symptom_users end,
          'mood_answers', case when a.mood_users = 0 then 0 when a.mood_users < k_min then null else a.mood_users end,
          'journal_posts', case when a.journal_users = 0 then 0 when a.journal_users < k_min then null else a.journal_users end
        )
        from activity a
      ),
      'return_rate', (
        select jsonb_build_object(
          'recording_users', case when a.recording_users = 0 then 0 when a.recording_users < k_min then null else a.recording_users end,
          'returning_users', case when a.returning_users = 0 then 0 when a.returning_users < k_min then null else a.returning_users end
        )
        from activity a
      ),
      -- 규칙 B
      'distributions', (select jsonb_object_agg(dj.dist, dj.value) from dist_json dj)
    )
    into stats;

    result := result || stats;
  end if;

  insert into public.admin_audit (actor, action, subject_count)
  values ((select auth.uid()), 'usage_stats', consented);

  return result;
end;
$$;

comment on function public.admin_usage_stats(integer) is
  '관리자 이용 통계 — 통계 목적에 동의한 사용자(동의 판 web-2026-11-06 이상, 관리자 제외)의 익명 집계만(k = 5: 5명 미만 칸·분포는 null, 그 사람이 5명 미만이면 건강 기록 집계 전체 null). 계정 ID·자유 글·사람별 값 없음. 부를 때마다 admin_audit에 usage_stats 한 줄.';

revoke execute on function public.admin_usage_stats(integer) from public, anon;
grant execute on function public.admin_usage_stats(integer) to authenticated;

-- 2) PostgREST 스키마 다시 읽기 — 새 함수를 웹이 바로 부를 수 있게(0009·0010과 같다). 알림은 이 트랜잭션이 끝날 때(commit) 간다.

notify pgrst, 'reload schema';
