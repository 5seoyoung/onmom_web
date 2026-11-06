import { useId } from "react";
import { Card, EvidenceChipList, SectionTitle } from "@/components/ui";
import { PhoneLinks } from "@/features/guide/PhoneLinks";
import { RECORD_WEB_TEXT, warningSignGroups } from "./recordView";

// "바로 병원에 가야 하는 신호" — 기록 결과 화면에 입력과 상관없이 늘 보이는 일반 안내(웹 추가, 법률 사전 검토 H5 D-17·4-2 ①).
// 결과가 개인에 대한 판정이 아니라 교육으로 읽히게 한다: 모두에게 같은 목록이고, 무엇을 체크했는지 표시하지 않는다.
// 등급 묶음 → 할 일 한 줄(안의 전화번호는 tel: 링크) → 신호 이름 + 출처 칩. 출처는 규칙의 "src:" 칩 그대로(지어내지 않는다).

export function WarningSignsCard() {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionTitle id={titleId}>{RECORD_WEB_TEXT.warningTitle}</SectionTitle>
        <p className="text-[0.8125rem] text-text-secondary">{RECORD_WEB_TEXT.warningIntro}</p>
      </div>
      {warningSignGroups().map((group) => (
        <div key={group.severity} className="flex flex-col gap-2 border-t border-divider pt-3">
          <h3 className="text-[0.9375rem] font-bold text-state-alert-text">{group.label}</h3>
          <p className="text-[0.8125rem] text-text-secondary">
            <PhoneLinks text={group.action} />
          </p>
          <ul className="flex flex-col gap-2">
            {group.signs.map((sign) => (
              <li key={sign.code} className="flex flex-col gap-1">
                <span className="text-[0.9375rem] text-text-primary">{sign.name}</span>
                <EvidenceChipList tokens={sign.sources} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
