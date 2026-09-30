import type { Metadata } from "next";
import { AdminScreen } from "@/features/admin/AdminScreen";
import { ADMIN_TEXT } from "@/features/admin/adminModel";

// 관리자 화면(/admin/) — 메뉴에 링크하지 않는다. 집계·계정 메타데이터만(건강 기록 없음, features/admin).
// 권한은 화면이 Supabase is_admin()으로 확인하고, 데이터는 서버 함수가 막는다(supabase/migrations/0002_admin.sql).
// 정적 HTML에는 "확인하고 있어요"(설정 없는 빌드는 "권한이 없어요")만 있다 — 데이터는 브라우저에서 받는다.
// robots(검색 노출 막기)는 루트 레이아웃 값을 그대로 물려받는다 — 여기서 robots를 정하면 덮어쓰므로 두지 않는다.
// 제목("온맘 관리자")에 이미 이름이 있어 레이아웃의 제목 틀("%s · 온맘")을 건너뛴다(absolute).
export const metadata: Metadata = {
  title: { absolute: ADMIN_TEXT.title },
};

export default function Page() {
  return <AdminScreen />;
}
