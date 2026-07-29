import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import ChannelSettings from "@/components/channel/ChannelSettings";

export const metadata: Metadata = {
  title: "ช่องของคุณ — Tourney Hub",
  description: "ตั้งค่าพร้อมเพย์ แพ็กเกจสมาชิก และลิงก์ widget สำหรับสตรีม",
};

export default function ChannelPage() {
  return (
    <AppShell>
      <AuthGate description="ต้องล็อกอินก่อนถึงจะตั้งค่าช่องและรับการสนับสนุนได้">
        <ChannelSettings />
      </AuthGate>
    </AppShell>
  );
}
