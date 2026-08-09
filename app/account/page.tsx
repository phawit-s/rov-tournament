import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import AccountView from "@/components/auth/AccountView";

export const metadata: Metadata = {
  title: "โปรไฟล์ — Steamer Hub",
  description: "แก้ชื่อในเกมและช่องทางติดต่อของบัญชีคุณ",
};

/**
 * หน้าโปรไฟล์ของตัวเอง — ผู้ใช้ทั่วไปต้องเข้าได้ จึงครอบแค่ AuthGate
 * ห้ามใส่ AdminGate เด็ดขาด ไม่งั้นคนสมัครแข่งจะแก้ชื่อในเกมตัวเองไม่ได้เลย
 */
export default function AccountPage() {
  return (
    <AppShell>
      <AuthGate
        title="โปรไฟล์ของคุณ"
        description="ล็อกอินก่อน แล้วค่อยแก้ชื่อในเกมกับช่องทางติดต่อได้"
      >
        <AccountView />
      </AuthGate>
    </AppShell>
  );
}
