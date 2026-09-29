"use client";

// 설정 > 내 데이터 — 계정 ID(서버 계정이 있을 때) · 동의 내역(판·일시, 있는 값만) · 철회 방법 · [내 데이터 내려받기](JSON 파일).
// iOS에 없던 카드(웹 신규 — CPO 확인 필요). 근거: 웹 처리방침 초안 13절(열람·동의 철회), DEV_NOTES §8-7.
//
// 계정 ID = Supabase 세션의 사용자 id(auth.users.id, UUID). 이용자가 문의 이메일로 삭제를 요청할 때 관리자가 계정을 찾는 값이다
//   (supabase/migrations/0005_admin_tools.sql 머리 주석, /admin/의 "내 계정 ID"와 같은 값). 앱 계정 id("kakao-<회원번호>"·"guest-…")는
//   그 값이 아니어서 화면에 보이지 않는다. 이 브라우저에 저장된 세션에서 읽기만 한다(네트워크 요청 없음) — 설정 없는 빌드·세션 없음이면
//   행을 그리지 않는다. 내려받기 파일의 account.serverUserId도 같은 값.
// 내려받기는 스토어 스냅샷을 파일로 만들 뿐이다 — 네트워크 요청 없음, 로그 없음(건강 정보). 실패하면 문장으로 알린다.

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getSupabaseClient, hasStoredAuthSession } from "@/auth/client";
import { Card, SectionTitle } from "@/components/ui";
import { isSupabaseConfigured } from "@/config";
import type { UserProfile } from "@/domain/types";
import type { AppSnapshot } from "@/store/appStore";
import { buildDataExport, downloadTextFile, exportFileName, serializeDataExport } from "./dataExport";
import { DATA_RIGHTS_TEXT, accountIdRow, consentRows } from "./settingsView";

/**
 * 이 브라우저에 저장된 Supabase 세션의 사용자 id — 설정 없음·저장된 세션 없음·읽기 실패면 null(지어내지 않는다).
 * 앱 계정이 바뀌면(게스트 → 카카오 연결) 다시 읽는다. supabase-js 번들은 세션이 있을 때만 받는다(auth/client.ts).
 */
function useServerUserId(accountId: string | null): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured() || accountId === null || !hasStoredAuthSession()) return;
    let cancelled = false;
    void getSupabaseClient()
      .then(async (client) => {
        if (client === null || cancelled) return null;
        const { data } = await client.auth.getSession();
        return data.session?.user.id ?? null;
      })
      .then(
        (userId) => {
          if (!cancelled) setId(userId);
        },
        () => {
          if (!cancelled) setId(null);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  return accountId === null ? null : id;
}

export function DataRightsCard({ snapshot }: { snapshot: Pick<AppSnapshot, "state" | "account"> }) {
  const [failed, setFailed] = useState(false);
  const serverUserId = useServerUserId(snapshot.account?.id ?? null);
  const idRow = accountIdRow(serverUserId);
  const rows = consentRows(snapshot.state.profile as UserProfile);

  function exportData() {
    const now = new Date();
    const ok = downloadTextFile(
      exportFileName(now),
      serializeDataExport(buildDataExport(snapshot, now, serverUserId)),
      "application/json",
    );
    setFailed(!ok);
  }

  return (
    <Card as="section" aria-labelledby="settings-data" className="flex flex-col gap-3">
      <SectionTitle id="settings-data">{DATA_RIGHTS_TEXT.title}</SectionTitle>

      {/* 계정 ID — 서버 계정이 있을 때만. 통째로 선택되게(select-all) — 문의 메일에 붙여 넣기 쉽게(/admin/ "내 계정 ID"와 같다) */}
      {idRow !== null ? (
        <dl className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-base text-text-secondary">{idRow.label}</dt>
            <dd className="min-w-0 select-all break-all text-right font-mono text-[0.8125rem] font-semibold text-text-primary">{idRow.value}</dd>
          </div>
          <dd className="text-[0.8125rem] text-text-secondary">{DATA_RIGHTS_TEXT.accountIdHint}</dd>
        </dl>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold text-text-primary">{DATA_RIGHTS_TEXT.consentTitle}</p>
          <dl className="flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-base text-text-secondary">{row.label}</dt>
                <dd className="min-w-0 text-right text-[0.9375rem] font-semibold text-text-primary tabular-nums break-all">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[0.8125rem] text-text-secondary">{DATA_RIGHTS_TEXT.consentWithdraw}</p>
        </div>
      ) : null}

      <hr className="border-divider" />
      <button
        type="button"
        onClick={exportData}
        className="flex min-h-11 w-full flex-col items-start gap-0.5 py-1 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-primary-text">
          <Download aria-hidden className="size-4" strokeWidth={2.5} />
          {DATA_RIGHTS_TEXT.exportButton}
        </span>
        <span className="text-[0.8125rem] text-text-secondary">{DATA_RIGHTS_TEXT.exportHint}</span>
      </button>
      <div role="alert" className="empty:hidden">
        {failed ? <p className="text-[0.8125rem] font-semibold text-state-alert-text">{DATA_RIGHTS_TEXT.exportFailed}</p> : null}
      </div>
    </Card>
  );
}
