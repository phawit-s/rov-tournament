import type { Metadata } from "next";
import AdminOnly from "@/components/studio/AdminOnly";
import Backoffice from "@/components/admin/Backoffice";

export const metadata: Metadata = {
  title: "ทั้งระบบ — Steamer Hub",
  description: "ดูผู้ใช้ ช่อง และทัวร์ทั้งหมดบนคลาวด์",
};

export default function StudioSystemPage() {
  return (
    <AdminOnly>
      <Backoffice />
    </AdminOnly>
  );
}
