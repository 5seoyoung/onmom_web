// [분석 시작] 한 번의 실행 — 저장 먼저, 그다음 저장된 값으로 분석(D10, 감사 #2, AnalyzeFlowView.swift:192-221).
// 운동 탭·홈이 저장된 산모수첩으로 같은 차단 판정을 하므로, 폼 값을 바로 분석에 넘기면
// 분석은 "금지"인데 운동 탭은 열어 두는 불일치가 생긴다. 그래서 반드시 저장소에서 다시 읽은 값을 쓴다.
// 화면(React)을 모른다 — 저장 action·저장 값 읽기·영상 조회·시각을 넘겨받아 테스트할 수 있게 했다.

import type { FetchVideosOptions, FetchVideosResult } from "@/api/video";
import { parseLocalDate } from "@/domain/date";
import type { MaternityRecord, UserProfile } from "@/domain/types";
import { fetchVideosWithRetry } from "@/features/exercise/videoLoad";
import { routeTag } from "@/rules/exercise";
import { runRecoveryAnalysis, type EngineOutput, type VideoFetchResult } from "@/rules/recovery";
import type { AppActions } from "@/store/appStore";
import {
  ANALYZE_TEXT,
  maternityPatchFromForm,
  profilePatchFromForm,
  videoFetchResultFrom,
  type AnalyzeFormValues,
} from "./analyzeModel";

export interface AnalyzeRunDeps {
  actions: Pick<AppActions, "updateProfile" | "updateMaternity">;
  /** 저장소의 현재 값(저장 직후 다시 읽는다) */
  readSaved: () => { profile: UserProfile; maternity: MaternityRecord };
  fetchVideos: (includeTag: string, opts?: FetchVideosOptions) => Promise<FetchVideosResult>;
  now: () => Date;
  signal?: AbortSignal;
  /** 영상 조회가 첫 실패 뒤 자동 재시도에 들어갔다(콜드스타트 — 화면이 "서버를 깨우는 중" 안내를 켠다) */
  onVideoRetry?: () => void;
}

export type AnalyzeRunOutcome = { ok: true; output: EngineOutput } | { ok: false; message: string };

export async function saveAndAnalyze(values: AnalyzeFormValues, deps: AnalyzeRunDeps): Promise<AnalyzeRunOutcome> {
  // 1) 확인·입력한 정보를 프로필·산모수첩에 반영(저장)
  deps.actions.updateProfile(profilePatchFromForm(values));
  deps.actions.updateMaternity(maternityPatchFromForm(values));

  // 2) 저장된 값을 다시 읽어 그 값으로만 분석한다
  const { profile, maternity } = deps.readSaved();
  // 분만 방식·출산일 중 하나라도 없으면 분석하지 않는다(영상 조회도 하지 않는다)
  if (profile.deliveryMethod === null || parseLocalDate(profile.deliveryDate) === null) {
    return { ok: false, message: ANALYZE_TEXT.errorNoDelivery };
  }

  // 영상 조회 — 잠든 서버(콜드스타트)를 위해 첫 실패 뒤 한 번 자동으로 다시 시도한다(features/exercise/videoLoad.ts, 05 §0)
  let videos: VideoFetchResult;
  try {
    videos = videoFetchResultFrom(
      await fetchVideosWithRetry(deps.fetchVideos, routeTag(profile.deliveryMethod), { signal: deps.signal, onRetry: deps.onVideoRetry }),
    );
  } catch {
    videos = { state: "failed" };
  }

  const output = runRecoveryAnalysis({ profile, maternity, videos }, deps.now());
  return output === null ? { ok: false, message: ANALYZE_TEXT.errorNoDelivery } : { ok: true, output };
}
