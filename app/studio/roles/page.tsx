import type { Metadata } from "next";
import { pageTitle } from "@/lib/brand";
import AdminOnly from "@/components/studio/AdminOnly";
import RolesPanel from "@/components/studio/RolesPanel";

export const metadata: Metadata = {
  title: pageTitle("สิทธิ์และคำขอ"),
  description: "อนุมัติคนที่ขอเปิดคิวเพลงให้ช่องของตัวเอง และจัดการสิทธิ์สตรีมเมอร์กับผู้ดูแลระบบ",
};

export default function StudioRolesPage() {
  return (
    <AdminOnly>
      <RolesPanel />
    </AdminOnly>
  );
}
