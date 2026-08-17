import type { Metadata } from "next";
import AdminOnly from "@/components/studio/AdminOnly";
import RolesPanel from "@/components/studio/RolesPanel";

export const metadata: Metadata = {
  title: "สิทธิ์และคำขอ — Steamer Hub",
  description: "อนุมัติคำขอเป็นสตรีมเมอร์ และจัดการสิทธิ์ผู้ดูแลระบบ",
};

export default function StudioRolesPage() {
  return (
    <AdminOnly>
      <RolesPanel />
    </AdminOnly>
  );
}
