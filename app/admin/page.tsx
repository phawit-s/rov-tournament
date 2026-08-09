import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminGate from "@/components/auth/AdminGate";
import Backoffice from "@/components/admin/Backoffice";

export const metadata: Metadata = {
  title: "หลังบ้าน — Steamer Hub",
  description: "ดูผู้ใช้ ช่อง ทัวร์ และจัดการสิทธิ์ผู้ดูแล",
};

/**
 * หลังบ้าน — /admin/
 *
 * AdminGate เป็นด่านแรก (ล็อกอินด้วยอีเมล/รหัสผ่าน หรือ Google)
 * ส่วนตัว Backoffice เช็คซ้ำอีกชั้นว่าเป็นผู้ดูแลที่ Firestore ยืนยันแล้วจริง
 * เพราะรหัสผู้จัดในเครื่องปลดได้แค่เครื่องมือที่ทำงานในเบราว์เซอร์
 * ไม่ได้ทำให้อ่านรายชื่อผู้ใช้บนคลาวด์ได้
 */
export default function AdminPage() {
  return (
    <AppShell wide>
      <AdminGate>
        <Backoffice />
      </AdminGate>
    </AppShell>
  );
}
