// 관리자 화면(/admin/) 보기 규칙 — 서버 응답 읽기, 숫자·날짜 표시, 30일 막대 눈금, 쪽 나누기. 순수 함수(adminModel.test.ts).
//
// 건강 기록은 여기 오지 않는다. 서버 함수(supabase/migrations/0002_admin.sql)가 집계와 계정 메타데이터
// (계정 ID, 가입·접속 시각, 게스트/카카오, 동의 판, 서버 기록 유무와 마지막 저장 시각)만 돌려준다. 이메일·닉네임도 받지 않는다.
// 화면 아래 안내(ADMIN_TEXT.privacyNote)는 이 목록과 같아야 한다 — 칸을 늘리거나 줄이면 함께 고친다.
// 날짜·시각은 한국 시간(Asia/Seoul)으로 보인다 — 서버가 "하루"를 한국 자정 기준으로 나누는 것과 맞춘다.

export const ADMIN_TEXT = {
  // 웹 신규 문구 — CPO 확인 필요 (관리자 화면 전체 — 메뉴에 링크하지 않는 운영자용 화면)
  title: "온맘 관리자",
  checking: "확인하고 있어요",
  forbiddenTitle: "권한이 없어요",
  forbiddenBody: "관리자로 등록된 카카오 계정으로 로그인해야 볼 수 있어요.",
  notConfiguredBody: "카카오 로그인(Supabase) 설정이 없는 빌드라 열 수 없어요.",
  myAccountId: "내 계정 ID",
  home: "홈으로",
  loadFailedTitle: "불러오지 못했어요",
  loadFailedBody: "잠시 후 다시 시도해주세요.",
  setupHint: "Supabase SQL Editor에서 supabase/migrations/0002_admin.sql을 실행했는지 확인해 주세요.",
  privacyNote: "건강 기록 내용은 이 화면에 나오지 않아요. 계정 ID, 가입·접속 시각, 계정 유형, 동의 버전, 기록 저장 여부와 마지막 저장일만 보여요.",
  refresh: "새로고침",
  kpiUsers: "전체 사용자",
  kpiKakao: "카카오",
  kpiConsent: "동의 완료",
  kpiActive: "최근 7일 활성",
  chartTitle: "최근 30일 신규 가입",
  chartSubtitle: "하루 단위 · 한국 시간",
  showTable: "표로 보기",
  colDay: "날짜",
  colNewUsers: "신규 가입",
  usersTitle: "사용자 목록",
  colId: "ID",
  colCreated: "가입일",
  colLastSignIn: "최근 접속",
  colKind: "유형",
  colConsent: "동의 버전",
  colState: "기록 저장",
  stateYes: "있음",
  stateNo: "없음",
  kindOther: "기타",
  empty: "사용자가 없어요",
  prev: "이전",
  none: "—",
  // 원문 그대로
  kpiGuests: "게스트", // 원문: AccountStore.swift:77
  kindGuest: "게스트", // 원문: AccountStore.swift:77
  retry: "다시 시도", // 원문: ExerciseView.swift:184
  next: "다음", // 원문: OnboardingFlowView.swift:68
  // 웹 신규 문구 — CPO 확인 필요 (카카오 계정 유형 — 원문 "카카오 사용자"(AccountStore.swift:78)를 표 칸에 맞게 줄임)
  kindKakao: "카카오",

  // ── 관리자 도구(supabase/migrations/0005_admin_tools.sql) — 모두 웹 신규 문구 — CPO 확인 필요 (운영자용 화면) ──
  // 동의 버전 분포
  consentVersionsTitle: "동의 버전 분포",
  consentVersionsSubtitle: "서버에 기록이 있는 사람 기준",
  consentNone: "없음",
  consentCurrentBadge: "현재 판",
  colUsers: "사용자",
  // 30일 막대의 게스트/카카오 나누기(범례·표 칸) — 값은 kindGuest·kindKakao
  chartSplitNote: "게스트·카카오로 나눠 보여요",
  // 계정 찾기(이용자의 삭제 요청 처리 — 이용자가 보낸 계정 ID로 찾는다)
  searchTitle: "계정 찾기",
  searchLabel: "계정 ID",
  searchHint: "이용자가 보낸 계정 ID(UUID 36자)를 붙여 넣어요. 건강 기록은 조회되지 않아요.",
  searchButton: "찾기",
  searchInvalid: "계정 ID 형식(UUID 36자)이 아니에요.",
  searchNotFound: "그 ID의 계정이 없어요.",
  searchFailed: "조회하지 못했어요. 잠시 후 다시 시도해주세요.",
  // 계정 삭제(요청 처리) — 관리자 도구 공통 설치 안내(toolsSetupHint)는 계정 찾기·관리자 목록·삭제가 같이 쓴다
  deleteUser: "계정 삭제",
  deleteTitle: "이 계정을 삭제할까요?",
  deleteMessage: "서버에 저장된 기록과 로그인 계정이 즉시 삭제되고 되돌릴 수 없어요. 확인을 위해 계정 ID 앞 8자리를 입력해 주세요.",
  deleteInputLabel: "계정 ID 앞 8자리",
  deleteReasonLabel: "사유(선택) — 감사 기록에 남아요. 이메일·건강 정보는 적지 마세요.",
  deleteReasonHasEmail: "사유에 이메일 주소가 있어요. 지우고 다시 시도해 주세요.",
  deleteMismatch: "입력한 글자가 계정 ID 앞 8자리와 달라요.",
  deleting: "삭제하고 있어요",
  deleteDone: "계정을 삭제했어요. 삭제 기록은 admin_audit 표에 남았어요.",
  deleteFailed: "계정을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.",
  deleteNotFound: "이미 없는 계정이에요.",
  deleteSelf: "내 계정은 여기서 지울 수 없어요. 설정 > 계정 삭제를 써 주세요.",
  deleteIsAdmin: "관리자 계정은 여기서 지울 수 없어요. 먼저 SQL Editor에서 관리자 목록(public.admins)에서 빼 주세요.",
  toolsSetupHint: "Supabase SQL Editor에서 supabase/migrations/0005_admin_tools.sql을 실행했는지 확인해 주세요.",
  // CSV 내려받기(메타데이터만)
  csvExport: "CSV 내려받기",
  csvExporting: "내려받는 중",
  csvFailed: "CSV를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
  csvNote: "표에 보이는 칸만(건강 기록·이메일·닉네임 없음), 최대 5,000명.",
  csvYes: "예",
  csvNo: "아니요",
  colAccountId: "계정 ID",
  colCurrentConsent: "현재 판 동의",
  colStateUpdated: "마지막 저장일",
  // 사용자 목록의 행 단추(계정 삭제)와 열 이름(화면 낭독기용)
  colActions: "작업",
  // 계정 찾기 결과가 방금 지운 계정이면
  searchDeleted: "이 계정은 삭제됐어요.",
  consentVersionsEmpty: "서버에 기록이 있는 사람이 없어요",
  colShare: "비율",
  cancel: "취소", // 원문: MoreView.swift:97
  // 관리자 목록
  adminsTitle: "관리자 목록",
  adminsHint: "관리자 추가·해제는 Supabase SQL Editor에서만 해요(supabase/migrations/0002_admin.sql 머리 주석). 게스트 계정은 넣어도 관리자가 아니에요.",
  adminsEmpty: "관리자가 없어요",
  colAddedAt: "등록일",
  me: "나",
} as const;

/** 한 쪽에 보이는 사용자 수. 서버에는 하나 더 달라고 해 다음 쪽이 있는지 안다. */
export const ADMIN_PAGE_SIZE = 20;
/** 서버 함수 admin_list_users가 한 번에 돌려주는 최대 수(SQL의 least(…, 100)) */
export const ADMIN_LIST_MAX = 100;

// ── 서버 응답 ──────────────────────────────────────────────────────────────

export interface DayCount {
  /** 한국 날짜 "YYYY-MM-DD" */
  day: string;
  users: number;
  /** 그날 가입한 게스트(익명)·카카오 수 — 0005_admin_tools.sql 뒤에만 온다(0002만 있으면 null) */
  anonymousUsers: number | null;
  kakaoUsers: number | null;
}

/** 동의 판별 사용자 수(user_states 기준) — version null = 판이 없는 행(예전 빌드의 동의) */
export interface ConsentVersionCount {
  version: string | null;
  users: number;
}

export interface AdminOverview {
  generatedAt: string | null;
  totals: {
    users: number;
    anonymousUsers: number;
    kakaoUsers: number;
    usersWithState: number;
    usersWithCurrentConsent: number;
  };
  /** 최근 7일 안에 로그인(last_sign_in_at)한 사람 */
  activeUsers7d: number;
  /** 최근 7일 안에 서버 기록이 바뀐 사람 */
  statesUpdated7d: number;
  /** 오래된 날 → 오늘, 30칸 */
  newUsersByDay: DayCount[];
  /** 동의 판 분포 — 0005_admin_tools.sql 뒤에만(0002만 있으면 null → 카드를 그리지 않는다) */
  consentVersions: ConsentVersionCount[] | null;
}

export interface AdminUserRow {
  id: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAnonymous: boolean;
  /** "kakao" | "anonymous" | 그 밖의 공급자 이름 */
  provider: string | null;
  hasState: boolean;
  consentVersion: string | null;
  stateUpdatedAt: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 0 이상의 정수(수) — Postgres bigint가 문자열로 올 수도 있어 숫자 문자열도 받는다. 아니면 null. */
export function parseCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,15}$/.test(v)) return Number(v);
  return null;
}

function parseIso(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v)) ? v : null;
}

function parseText(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** admin_overview(p_consent_version) 응답 → 화면 값. 모양이 다르면 null(없는 값을 0으로 꾸미지 않는다). */
export function parseOverview(data: unknown): AdminOverview | null {
  if (!isRecord(data) || !isRecord(data.totals)) return null;
  const t = data.totals;
  const users = parseCount(t.users);
  const anonymousUsers = parseCount(t.anonymous_users);
  const kakaoUsers = parseCount(t.kakao_users);
  const usersWithState = parseCount(t.users_with_state);
  const usersWithCurrentConsent = parseCount(t.users_with_current_consent);
  const activeUsers7d = parseCount(data.active_users_7d);
  const statesUpdated7d = parseCount(data.states_updated_7d);
  if (
    users === null ||
    anonymousUsers === null ||
    kakaoUsers === null ||
    usersWithState === null ||
    usersWithCurrentConsent === null ||
    activeUsers7d === null ||
    statesUpdated7d === null
  ) {
    return null;
  }

  const rawDays = data.new_users_by_day ?? [];
  if (!Array.isArray(rawDays)) return null;
  const newUsersByDay: DayCount[] = [];
  for (const d of rawDays) {
    if (!isRecord(d) || typeof d.day !== "string" || !DAY_RE.test(d.day)) return null;
    const n = parseCount(d.users);
    if (n === null) return null;
    // 게스트·카카오 나누기(0005) — 칸이 없으면(0002만 실행) null, 있는데 수가 아니면 모양 오류
    const anon = parseOptionalCount(d.anonymous_users);
    const kakao = parseOptionalCount(d.kakao_users);
    if (anon === undefined || kakao === undefined) return null;
    newUsersByDay.push({ day: d.day, users: n, anonymousUsers: anon, kakaoUsers: kakao });
  }
  newUsersByDay.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  // 동의 판 분포(0005) — 칸이 없으면 null(카드를 그리지 않는다). 있으면 한 항목이라도 모양이 다르면 전체 모양 오류.
  let consentVersions: ConsentVersionCount[] | null = null;
  if (data.consent_versions != null) {
    if (!Array.isArray(data.consent_versions)) return null;
    consentVersions = [];
    for (const v of data.consent_versions) {
      if (!isRecord(v)) return null;
      const count = parseCount(v.users);
      if (count === null) return null;
      if (v.version != null && typeof v.version !== "string") return null;
      consentVersions.push({ version: typeof v.version === "string" && v.version.length > 0 ? v.version : null, users: count });
    }
  }

  return {
    generatedAt: parseIso(data.generated_at),
    totals: { users, anonymousUsers, kakaoUsers, usersWithState, usersWithCurrentConsent },
    activeUsers7d,
    statesUpdated7d,
    newUsersByDay,
    consentVersions,
  };
}

/** 있어도 되고 없어도 되는 수 — 없으면(undefined·null) null, 있는데 수가 아니면 undefined(모양 오류 표시) */
function parseOptionalCount(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  const n = parseCount(v);
  return n === null ? undefined : n;
}

/** admin_list_admins 응답의 한 행 — 관리자 계정의 메타데이터만(0005) */
export interface AdminListRow {
  userId: string;
  addedAt: string;
  lastSignInAt: string | null;
  isMe: boolean;
}

/** admin_list_admins 응답 → 행들. 한 행이라도 모양이 다르면 null. */
export function parseAdminRows(data: unknown): AdminListRow[] | null {
  if (!Array.isArray(data)) return null;
  const rows: AdminListRow[] = [];
  for (const r of data) {
    if (!isRecord(r)) return null;
    const userId = parseText(r.user_id);
    const addedAt = parseIso(r.added_at);
    if (userId === null || addedAt === null) return null;
    rows.push({ userId, addedAt, lastSignInAt: parseIso(r.last_sign_in_at), isMe: r.is_me === true });
  }
  return rows;
}

/** admin_list_users 응답 → 행들. 한 행이라도 모양이 다르면 null(말없이 빼면 사용자가 사라져 보인다). */
export function parseUserRows(data: unknown): AdminUserRow[] | null {
  if (!Array.isArray(data)) return null;
  const rows: AdminUserRow[] = [];
  for (const r of data) {
    if (!isRecord(r)) return null;
    const id = parseText(r.id);
    const createdAt = parseIso(r.created_at);
    if (id === null || createdAt === null) return null;
    rows.push({
      id,
      createdAt,
      lastSignInAt: parseIso(r.last_sign_in_at),
      isAnonymous: r.is_anonymous === true,
      provider: parseText(r.provider),
      hasState: r.has_state === true,
      consentVersion: parseText(r.consent_version),
      stateUpdatedAt: parseIso(r.state_updated_at),
    });
  }
  return rows;
}

// ── 숫자·날짜 표시 ──────────────────────────────────────────────────────────

const COUNT_FORMAT = new Intl.NumberFormat("ko-KR");

/** 1284 → "1,284" */
export function formatCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

/** 1284 → "1,284명" */
export function formatPeople(n: number): string {
  return `${formatCount(n)}명`;
}

/** 전체 중 비율 "40%"(반올림). 전체가 0이면 null(0으로 나누지 않는다). */
export function sharePercent(part: number, total: number): string | null {
  if (!(total > 0)) return null;
  return `${Math.round((part / total) * 100)}%`;
}

const SEOUL_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoulParts(iso: string | null | undefined): Record<"year" | "month" | "day" | "hour" | "minute", string> | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const out: Record<string, string> = {};
  for (const p of SEOUL_PARTS.formatToParts(new Date(t))) out[p.type] = p.value;
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** 한국 날짜 "2026.09.28" — 없거나 읽을 수 없으면 "—" */
export function formatSeoulDate(iso: string | null | undefined): string {
  const p = seoulParts(iso);
  return p === null ? ADMIN_TEXT.none : `${p.year}.${p.month}.${p.day}`;
}

/** 한국 시각 "2026.09.28 14:05" — 없거나 읽을 수 없으면 "—" */
export function formatSeoulDateTime(iso: string | null | undefined): string {
  const p = seoulParts(iso);
  return p === null ? ADMIN_TEXT.none : `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

/** "2026-09-28" → 축 눈금 "9.28" */
export function dayTick(day: string): string {
  const m = DAY_RE.exec(day);
  return m === null ? day : `${Number(m[2])}.${Number(m[3])}`;
}

/** "2026-09-28" → "9월 28일" */
export function dayLong(day: string): string {
  const m = DAY_RE.exec(day);
  return m === null ? day : `${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 집계 시각 줄 — "2026.09.28 14:05 기준"(시각을 모르면 null) */
export function generatedAtLabel(iso: string | null): string | null {
  const s = formatSeoulDateTime(iso);
  // 웹 신규 문구 — CPO 확인 필요 (관리자 화면 집계 시각)
  return s === ADMIN_TEXT.none ? null : `${s} 기준`;
}

// ── 한눈에 보기(KPI) ─────────────────────────────────────────────────────────

export type KpiId = "users" | "guests" | "kakao" | "consent" | "active";

export interface KpiCard {
  id: KpiId;
  label: string;
  value: string;
  caption: string | null;
}

/** 다섯 칸 — 전체 사용자, 게스트, 카카오, 동의 완료(현재 판), 최근 7일 활성. */
export function kpiCards(o: AdminOverview, consentVersion: string): KpiCard[] {
  const { totals } = o;
  const share = (n: number) => {
    const p = sharePercent(n, totals.users);
    // 웹 신규 문구 — CPO 확인 필요 (관리자 KPI 보조 줄)
    return p === null ? null : `전체의 ${p}`;
  };
  return [
    // 웹 신규 문구 — CPO 확인 필요 (관리자 KPI 보조 줄 — 서버에 기록 행이 있는 사람 수)
    { id: "users", label: ADMIN_TEXT.kpiUsers, value: formatCount(totals.users), caption: `서버 기록 ${formatPeople(totals.usersWithState)}` },
    { id: "guests", label: ADMIN_TEXT.kpiGuests, value: formatCount(totals.anonymousUsers), caption: share(totals.anonymousUsers) },
    { id: "kakao", label: ADMIN_TEXT.kpiKakao, value: formatCount(totals.kakaoUsers), caption: share(totals.kakaoUsers) },
    // 웹 신규 문구 — CPO 확인 필요 (관리자 KPI 보조 줄 — 어느 동의 판을 셌는지)
    { id: "consent", label: ADMIN_TEXT.kpiConsent, value: formatCount(totals.usersWithCurrentConsent), caption: `${consentVersion} 기준` },
    {
      id: "active",
      label: ADMIN_TEXT.kpiActive,
      value: formatCount(o.activeUsers7d),
      // 웹 신규 문구 — CPO 확인 필요 (관리자 KPI 보조 줄 — "활성"이 로그인 기준임을 밝힘)
      caption: `로그인 기준 · 기록 갱신 ${formatPeople(o.statesUpdated7d)}`,
    },
  ];
}

// ── 30일 신규 가입 막대 ─────────────────────────────────────────────────────

export interface ChartScale {
  /** 세로축 꼭대기 값(눈금의 마지막) */
  max: number;
  /** 0부터 max까지 같은 간격의 눈금 */
  ticks: number[];
}

/**
 * 사람 수 세로축 — 1·2·5 × 10ⁿ 간격, 눈금 칸은 많아야 maxTicks, 간격은 1 이상(사람 수는 정수).
 * 가장 큰 값이 0이면 0~1(빈 막대를 크게 부풀리지 않는다).
 */
export function niceScale(maxValue: number, maxTicks = 4): ChartScale {
  const top = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
  if (top === 0) return { max: 1, ticks: [0, 1] };
  const raw = top / Math.max(1, maxTicks);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map((m) => m * magnitude).find((c) => c >= raw) ?? 10 * magnitude;
  step = Math.max(1, Math.round(step));
  const max = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

/** 쌓은 막대의 한 조각 — 게스트(아래)·카카오(위)·기타(맨 위, 둘 다 아닌 계정이 있을 때만) */
export interface ChartSegment {
  kind: AccountKind;
  users: number;
  /** 조각 높이 — 세로축 꼭대기 대비 % */
  heightPct: number;
}

export interface ChartBar {
  day: string;
  users: number;
  /** 막대 높이 — 세로축 꼭대기 대비 % (0~100) */
  heightPct: number;
  /** 가로축 눈금 글자(7일마다, 오늘 포함) — 없으면 null */
  tick: string | null;
  /** "9월 28일" — 알림·표·낭독용 */
  longLabel: string;
  /** 막대 끝에 값을 적는가 — 오늘과 가장 많은 날만(모든 막대에 숫자를 달지 않는다) */
  valueLabel: boolean;
  /** 게스트·카카오로 나눈 조각(0005 뒤, 모든 날에 값이 있을 때만) — 없으면 null(한 색 막대) */
  segments: ChartSegment[] | null;
}

/** 가장 많은 날의 값 글자는 오늘과 이만큼 떨어져 있을 때만 단다 — 좁은 폰에서 두 숫자가 겹치지 않게(값은 알림·표에 남는다). */
const PEAK_LABEL_MIN_GAP = 3;

/**
 * 게스트·카카오 나누기를 그릴 수 있는가 — 모든 날에 두 수가 있고 둘의 합이 그날 전체를 넘지 않을 때만(자료가 허락할 때만 나눈다).
 * 0002만 실행된 서버는 두 수가 없어 false → 한 색 막대.
 */
export function hasChartSplit(days: readonly DayCount[]): boolean {
  return days.length > 0 && days.every((d) => d.anonymousUsers !== null && d.kakaoUsers !== null && d.anonymousUsers + d.kakaoUsers <= d.users);
}

/**
 * 막대 배치 — 오늘(마지막 칸)부터 거꾸로 7일마다 눈금.
 * 값 글자는 오늘과 가장 많은 날(처음 나온 날)만 — 가장 많은 날이 오늘 바로 옆이면 오늘 것만.
 * 나누기가 가능하면 조각(게스트·카카오·기타 = 나머지)을 붙인다. 0인 조각은 빼서 빈 조각을 그리지 않는다.
 */
export function chartBars(days: readonly DayCount[], scale: ChartScale): ChartBar[] {
  const last = days.length - 1;
  const split = hasChartSplit(days);
  const pct = (n: number) => (scale.max > 0 ? Math.min(100, Math.max(0, (n / scale.max) * 100)) : 0);
  let peak = -1;
  days.forEach((d, i) => {
    if (d.users > 0 && (peak === -1 || d.users > days[peak].users)) peak = i;
  });
  if (peak !== -1 && peak !== last && last - peak < PEAK_LABEL_MIN_GAP) peak = -1;
  return days.map((d, i) => {
    let segments: ChartSegment[] | null = null;
    if (split) {
      const guest = d.anonymousUsers ?? 0;
      const kakao = d.kakaoUsers ?? 0;
      const other = d.users - guest - kakao;
      segments = (
        [
          { kind: "guest", users: guest },
          { kind: "kakao", users: kakao },
          { kind: "other", users: other },
        ] as const
      )
        .filter((s) => s.users > 0)
        .map((s) => ({ kind: s.kind, users: s.users, heightPct: pct(s.users) }));
    }
    return {
      day: d.day,
      users: d.users,
      heightPct: pct(d.users),
      tick: (last - i) % 7 === 0 ? dayTick(d.day) : null,
      longLabel: dayLong(d.day),
      valueLabel: i === last || i === peak,
      segments,
    };
  });
}

/** 범례·표에 쓰는 조각 종류 — 기타는 어느 날이든 기타 조각이 있을 때만 */
export function chartSegmentKinds(bars: readonly ChartBar[]): AccountKind[] {
  if (!bars.some((b) => b.segments !== null)) return [];
  const hasOther = bars.some((b) => b.segments?.some((s) => s.kind === "other") ?? false);
  return hasOther ? ["guest", "kakao", "other"] : ["guest", "kakao"];
}

/** 막대의 한 종류 값 — 조각이 없으면(0명) 0 */
export function segmentUsers(bar: Pick<ChartBar, "segments">, kind: AccountKind): number {
  return bar.segments?.find((s) => s.kind === kind)?.users ?? 0;
}

/** 그림 전체를 한 줄로 — 막대를 못 보는 사람에게 먼저 읽힌다(자세한 값은 표). */
export function chartSummary(days: readonly DayCount[]): string {
  if (days.length === 0) return "";
  const total = days.reduce((s, d) => s + d.users, 0);
  // 웹 신규 문구 — CPO 확인 필요 (관리자 막대그림 낭독 요약)
  const head = `최근 ${days.length}일 신규 가입 ${formatPeople(total)}.`;
  if (total === 0) return head;
  const peak = days.reduce((best, d) => (d.users > best.users ? d : best), days[0]);
  return `${head} 가장 많은 날 ${dayLong(peak.day)} ${formatPeople(peak.users)}.`;
}

/** 막대 하나를 가리킬 때의 알림 — "9월 28일 · 3명", 나눈 막대는 "9월 28일 · 3명 (게스트 2명 · 카카오 1명)" */
export function barReadout(bar: Pick<ChartBar, "longLabel" | "users"> & Partial<Pick<ChartBar, "segments">>): string {
  const head = `${bar.longLabel} · ${formatPeople(bar.users)}`;
  const segments = bar.segments ?? null;
  if (segments === null || segments.length === 0) return head;
  return `${head} (${segments.map((s) => `${ACCOUNT_KIND_LABEL[s.kind]} ${formatPeople(s.users)}`).join(" · ")})`;
}

// ── 사용자 목록 ─────────────────────────────────────────────────────────────

export type AccountKind = "guest" | "kakao" | "other";

/** 카카오 identity가 있으면 카카오(게스트가 카카오를 연결해도 같은 계정), 익명이면 게스트, 그 밖은 기타. */
export function accountKind(row: Pick<AdminUserRow, "provider" | "isAnonymous">): AccountKind {
  if (row.provider === "kakao") return "kakao";
  if (row.isAnonymous || row.provider === "anonymous") return "guest";
  return "other";
}

export const ACCOUNT_KIND_LABEL: Readonly<Record<AccountKind, string>> = {
  guest: ADMIN_TEXT.kindGuest,
  kakao: ADMIN_TEXT.kindKakao,
  other: ADMIN_TEXT.kindOther,
};

/** 계정 ID 앞 8자리 — 표에서 구분용(전체 ID는 title로) */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export interface UserRowView {
  id: string;
  shortId: string;
  created: string;
  lastSignIn: string;
  kind: AccountKind;
  kindLabel: string;
  consent: string;
  /** 동의 판이 지금 판인가(아니면 옛 판이거나 없음) */
  consentCurrent: boolean;
  hasState: boolean;
  stateLabel: string;
  /** 서버 기록이 마지막으로 바뀐 날(없으면 null) */
  stateUpdated: string | null;
}

export function userRowView(row: AdminUserRow, currentConsentVersion: string): UserRowView {
  const kind = accountKind(row);
  return {
    id: row.id,
    shortId: shortId(row.id),
    created: formatSeoulDate(row.createdAt),
    lastSignIn: formatSeoulDateTime(row.lastSignInAt),
    kind,
    kindLabel: ACCOUNT_KIND_LABEL[kind],
    consent: row.consentVersion ?? ADMIN_TEXT.none,
    consentCurrent: row.consentVersion !== null && row.consentVersion === currentConsentVersion,
    hasState: row.hasState,
    stateLabel: row.hasState ? ADMIN_TEXT.stateYes : ADMIN_TEXT.stateNo,
    stateUpdated: row.hasState && row.stateUpdatedAt !== null ? formatSeoulDate(row.stateUpdatedAt) : null,
  };
}

// ── 동의 버전 분포(0005) ─────────────────────────────────────────────────────

export interface ConsentVersionRow {
  key: string;
  /** 판 이름 — 판이 없는 행(예전 빌드의 동의)은 "없음" */
  label: string;
  users: number;
  usersLabel: string;
  /** 서버 기록이 있는 사람 중 비율 — 전체가 0이면 null */
  share: string | null;
  isCurrent: boolean;
}

/** 분포 행 — 현재 판 먼저, 그다음 판 이름 내림차순, 판 없음은 마지막. 비율은 서버 기록이 있는 사람(합계) 기준. */
export function consentVersionRows(counts: readonly ConsentVersionCount[], currentVersion: string): ConsentVersionRow[] {
  const total = counts.reduce((s, c) => s + c.users, 0);
  const sorted = [...counts].sort((a, b) => {
    if (a.version === currentVersion) return -1;
    if (b.version === currentVersion) return 1;
    if (a.version === null) return 1;
    if (b.version === null) return -1;
    return a.version < b.version ? 1 : a.version > b.version ? -1 : 0;
  });
  return sorted.map((c) => ({
    key: c.version ?? "__none__",
    label: c.version ?? ADMIN_TEXT.consentNone,
    users: c.users,
    usersLabel: formatPeople(c.users),
    share: sharePercent(c.users, total),
    isCurrent: c.version !== null && c.version === currentVersion,
  }));
}

// ── 계정 찾기 · 계정 삭제(0005) ──────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 입력한 계정 ID를 정리해 UUID(36자, 소문자)로 — 형식이 아니면 null. 서버에 보내기 전에 여기서 거른다(빈 요청·오류 창을 줄인다). */
export function normalizeUuid(input: string): string | null {
  const s = input.trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}

/** 삭제 확인 — 입력한 글자가 계정 ID 앞 8자리와 같은가(앞뒤 공백·대소문자는 무시) */
export function deleteConfirmMatches(input: string, targetId: string): boolean {
  return input.trim().toLowerCase() === shortId(targetId).toLowerCase();
}

/** 사유 — 앞뒤 공백을 지우고 500자까지(SQL의 제약과 같게). 비면 null. */
export const DELETE_REASON_MAX = 500;
export function normalizeDeleteReason(input: string): string | null {
  const s = input.trim().slice(0, DELETE_REASON_MAX);
  return s.length === 0 ? null : s;
}

/** 이메일 주소 모양 — SQL 제약(0005 admin_audit_reason_no_email)과 같은 패턴. 운영자가 요청 메일을 사유에 붙여 넣는 실수를 막는다. */
const EMAIL_LIKE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * 사유가 감사 기록에 들어가면 안 되는 내용이면 화면 문장, 아니면 null. 기계로 잡는 것은 이메일만 —
 * 건강 정보는 모양이 없어 안내 문구(deleteReasonLabel)로 막는다. 서버 제약이 같은 규칙으로 한 번 더 거절한다.
 */
export function deleteReasonProblem(reason: string | null): string | null {
  return reason !== null && EMAIL_LIKE_RE.test(reason) ? ADMIN_TEXT.deleteReasonHasEmail : null;
}

/**
 * admin_delete_user가 실패한 갈래 — forbidden·setupMissing·failed는 다른 함수와 같고(adminApi failureOf),
 * notFound(P0002)·self·isAdmin(P0001, 메시지로 나눔)은 삭제만의 거절이다(0005_admin_tools.sql 2)).
 */
export type DeleteFailure = "forbidden" | "setupMissing" | "failed" | "notFound" | "self" | "isAdmin";

/** 삭제 실패 → 화면 문장. forbidden은 화면이 권한 없음으로 내려가므로 여기 오지 않지만 안전하게 실패 문장으로. */
export function deleteFailureMessage(failure: DeleteFailure): string {
  switch (failure) {
    case "notFound":
      return ADMIN_TEXT.deleteNotFound;
    case "self":
      return ADMIN_TEXT.deleteSelf;
    case "isAdmin":
      return ADMIN_TEXT.deleteIsAdmin;
    case "setupMissing":
      return ADMIN_TEXT.toolsSetupHint;
    case "forbidden":
    case "failed":
      return ADMIN_TEXT.deleteFailed;
  }
}

// ── 관리자 목록(0005) ────────────────────────────────────────────────────────

export interface AdminRowView {
  id: string;
  shortId: string;
  added: string;
  lastSignIn: string;
  isMe: boolean;
}

export function adminRowView(row: AdminListRow): AdminRowView {
  return {
    id: row.userId,
    shortId: shortId(row.userId),
    added: formatSeoulDate(row.addedAt),
    lastSignIn: formatSeoulDateTime(row.lastSignInAt),
    isMe: row.isMe,
  };
}

// ── CSV 내려받기(메타데이터만) ───────────────────────────────────────────────
// 표에 보이는 칸만 — 건강 기록·이메일·닉네임은 서버 응답에 없어 여기 올 수 없다. 파일은 관리자의 기기로만 간다(요청 없음).

/** 한 번에 내려받는 최대 행 수 — 서버 함수를 100명씩 여러 번 불러 모은다(adminApi fetchAllUsers) */
export const CSV_MAX_ROWS = 5000;

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 따옴표는 두 번. 수식으로 읽힐 수 있는 첫 글자(=+-@)는 앞에 따옴표를 붙여 막는다. */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 사용자 메타데이터 표 → CSV(UTF-8 BOM, CRLF — 엑셀이 한글을 바로 읽게). 첫 줄은 칸 이름. */
export function usersCsv(rows: readonly AdminUserRow[], currentConsentVersion: string): string {
  const header = [
    ADMIN_TEXT.colAccountId,
    ADMIN_TEXT.colCreated,
    ADMIN_TEXT.colLastSignIn,
    ADMIN_TEXT.colKind,
    ADMIN_TEXT.colConsent,
    ADMIN_TEXT.colCurrentConsent,
    ADMIN_TEXT.colState,
    ADMIN_TEXT.colStateUpdated,
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const v = userRowView(r, currentConsentVersion);
    lines.push(
      [
        r.id,
        formatSeoulDateTime(r.createdAt),
        v.lastSignIn,
        v.kindLabel,
        r.consentVersion ?? "",
        v.consentCurrent ? ADMIN_TEXT.csvYes : ADMIN_TEXT.csvNo,
        v.stateLabel,
        v.stateUpdated ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "온맘-관리자-사용자-2026-09-28.csv" — 이 기기의 로컬 날짜 */
export function csvFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `온맘-관리자-사용자-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.csv`;
}

// ── 쪽 나누기 ───────────────────────────────────────────────────────────────

function pageIndex(page: number): number {
  return Number.isSafeInteger(page) && page > 0 ? page : 0;
}

/** admin_list_users 인자 — 한 쪽보다 하나 더 달라고 해 다음 쪽이 있는지 안다. */
export function usersPageArgs(page: number, pageSize: number = ADMIN_PAGE_SIZE): { p_limit: number; p_offset: number } {
  const size = Math.min(Math.max(1, Math.floor(pageSize)), ADMIN_LIST_MAX - 1);
  return { p_limit: size + 1, p_offset: pageIndex(page) * size };
}

/** 받은 행 → 이 쪽에 보일 행과 다음 쪽 유무 */
export function splitPage<T>(rows: readonly T[], pageSize: number = ADMIN_PAGE_SIZE): { rows: T[]; hasNext: boolean } {
  return { rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize };
}

/** "21–40 / 전체 45명" — 이 쪽에 행이 없으면 null. 전체 수를 모르면 범위만. */
export function pageLabel(page: number, pageSize: number, shown: number, total: number | null): string | null {
  if (shown <= 0) return null;
  const from = pageIndex(page) * pageSize + 1;
  const to = from + shown - 1;
  const range = `${formatCount(from)}–${formatCount(to)}`;
  // 웹 신규 문구 — CPO 확인 필요 (관리자 사용자 목록 쪽 표시)
  return total === null ? range : `${range} / 전체 ${formatPeople(total)}`;
}
