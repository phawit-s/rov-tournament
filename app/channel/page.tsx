import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminGate from "@/components/auth/AdminGate";
import AuthGate from "@/components/auth/AuthGate";
import ChannelSettings from "@/components/channel/ChannelSettings";

export const metadata: Metadata = {
  title: "ช่องของคุณ — Steamer Hub",
  description: "ตั้งค่าพร้อมเพย์ แพ็กเกจสมาชิก และลิงก์ widget สำหรับสตรีม",
};

export default function ChannelPage() {
  return (
    <AppShell>
      <AdminGate>
        <AuthGate description="ต้องล็อกอินก่อนถึงจะตั้งค่าช่องและรับการสนับสนุนได้">
          <ChannelSettings />
        </AuthGate>
      </AdminGate>
    </AppShell>
  );
}
