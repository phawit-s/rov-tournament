import type { Metadata } from "next";
import AuthGate from "@/components/auth/AuthGate";
import ChannelSettings from "@/components/channel/ChannelSettings";

export const metadata: Metadata = {
  title: "ช่องของฉัน — Steamer Hub",
  description: "ตั้งค่าพร้อมเพย์ แพ็กเกจสมาชิก และลิงก์ widget สำหรับสตรีม",
};

/**
 * ยังต้องมี AuthGate แม้จะอยู่หลังด่านของสตูดิโอแล้ว
 * เพราะทางเข้าด้วยรหัสผู้จัดในเครื่องไม่มีบัญชีผูกอยู่ — ChannelSettings ที่ไม่มี
 * ผู้ใช้จะเรนเดอร์ออกมาเป็นหน้าเปล่า ซึ่งดูเหมือนเว็บพัง ไม่ใช่ "ต้องล็อกอินก่อน"
 */
export default function StudioChannelPage() {
  return (
    <AuthGate description="ต้องล็อกอินก่อนถึงจะตั้งค่าช่องและรับการสนับสนุนได้">
      <ChannelSettings />
    </AuthGate>
  );
}
