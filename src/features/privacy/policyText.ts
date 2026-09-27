// 개인정보처리방침 원문 — iOS PrivacyPolicyView.swift를 글자 그대로 옮긴 것(원칙 5).
// iOS 방침이라 "이 기기", "Apple 지도", "iCloud" 등 웹과 맞지 않는 부분이 있다 — 웹용 개정은 CPO 결정 대기(08 §3 CPO 20).
// 문단 안 줄바꿈은 "\n", 빈 줄은 "\n\n"(Swift 여러 줄 문자열과 같음) — 화면은 white-space: pre-line으로 그린다.

export const PRIVACY_POLICY_NAV_TITLE = "개인정보처리방침"; // 원문: PrivacyPolicyView.swift:72
export const PRIVACY_POLICY_TITLE = "온맘 개인정보처리방침"; // 원문: PrivacyPolicyView.swift:21
export const PRIVACY_POLICY_EFFECTIVE = "시행일: 2026년 9월 7일"; // 원문: PrivacyPolicyView.swift:23
export const PRIVACY_POLICY_CLOSE = "닫기"; // 원문: PrivacyPolicyView.swift:77

// 웹 신규 문구 — CPO 확인 필요 (Swift에 없음: 위 방침이 iOS 기준임을 알린다)
export const PRIVACY_POLICY_WEB_NOTE = "이 방침은 iOS 앱 기준이에요. 웹에 맞게 개정할 예정이에요.";

export interface PolicySection {
  title: string;
  body: string;
}

// 원문: PrivacyPolicyView.swift:26-65
export const PRIVACY_POLICY_SECTIONS: readonly PolicySection[] = [
  {
    title: "1. 수집하는 정보",
    body: "온맘은 다음 정보를 처리합니다.\n• 계정 정보: Apple 또는 카카오 로그인 시 제공되는 식별자와 이름(닉네임). 게스트로 시작하면 기기 안에서만 쓰이는 임의 식별자가 만들어집니다.\n• 건강 정보(민감정보): 출산일, 분만 방식, 증상 기록(오로·발열·통증 등), 기분 살피기 답변(네·글쎄요·아니요), 산모수첩 확인 항목, 체중 등 이용자가 직접 입력한 정보.\n• 기록장 글: 이용자가 작성한 글과 메모(이 기기에만 저장되며 서버로 전송되지 않습니다).",
  },
  {
    title: "2. 저장 위치와 보유 기간",
    body: "모든 계정 정보와 건강 정보는 이용자의 기기에만 저장되며, 온맘은 별도의 회원 데이터베이스를 운영하지 않습니다. 앱을 삭제하거나 설정 > 계정 삭제를 실행하면 모든 정보가 즉시 파기됩니다. 이용자가 iCloud 백업을 켜 두었다면 본인의 iCloud 백업에도 포함되지만, 온맘은 이 백업에 접근할 수 없습니다.",
  },
  {
    title: "3. 기기 밖으로 전송되는 정보",
    body: "다음 기능을 사용할 때에만 해당 내용이 기기 밖으로 전송됩니다.\n\n• 운동 영상 추천: 분만 방식(자연분만·제왕절개)이 영상 목록 조회를 위해 온맘 서버로 전송됩니다. 회복 주차 계산과 운동 잠금 판단은 기기 안에서만 이뤄집니다.\n• 가까운 산부인과 찾기: 이용자가 입력한 동네 주소가 위치 검색을 위해 Apple 지도 서비스로 전송됩니다. 기기의 위치 권한은 사용하지 않습니다.\n• AI 상담·약물 확인: 현재 버전은 AI 서버에 연결되어 있지 않아 질문 내용이 전송되지 않으며, 앱에 담긴 안내로만 답변합니다. 서버가 연결되면 질문 내용과 프로필 요약(산후 주차, 분만 방식, 수유 여부)이 답변 생성을 위해 전송되며, 이 방침을 먼저 갱신합니다.\n\n증상 기록, 기분 살피기 답변, 산모수첩 확인 항목, 체중, 기록장 글은 어떤 경우에도 전송되지 않습니다.",
  },
  {
    title: "4. 처리 위탁 및 제3자 제공",
    body: "• Render(미국): 운동 영상 서버 호스팅\n• Apple: 로그인 인증, 지도 검색 (각 사의 개인정보처리방침이 적용됩니다)\n• 카카오: 카카오 로그인을 사용하는 경우에만 인증 목적으로 처리됩니다\n\n위 목적 외에 개인정보를 제3자에게 제공하거나 판매하지 않습니다.",
  },
  {
    title: "5. 이용자의 권리",
    body: "이용자는 언제든지 앱 안에서 자신의 정보를 열람·수정할 수 있고, 설정 > 계정 삭제로 계정과 모든 데이터를 즉시 삭제할 수 있습니다.",
  },
  {
    title: "6. 의료 관련 고지",
    body: "온맘은 의료기기가 아니며, 제공되는 정보는 참고용입니다. 진단·치료에 관한 판단은 반드시 의료진과 상담하세요.",
  },
  {
    title: "7. 문의처",
    body: "개인정보 관련 문의: inmani1555@gmail.com",
  },
];
