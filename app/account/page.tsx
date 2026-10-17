import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import AccountView from "@/components/auth/AccountView";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("โปรไฟล์"),
  description: "แก้ชื่อที่ขึ้นบนจอไลฟ์ตอนคุณขอเพลง",
};

/**
 * หน้าโปรไฟล์ของตัวเอง — ผู้ใช้ทั่วไปต้องเข้าได้ จึงครอบแค่ AuthGate
 * ห้ามครอบด้วยด่านสตรีมเมอร์หรือผู้ดูแลเด็ดขาด ไม่งั้นคนดูที่ล็อกอินไว้จะแก้ชื่อตัวเองไม่ได้เลย
 */
export default function AccountPage() {
  return (
    <AppShell>
      <AuthGate
        title="โปรไฟล์ของคุณ"
        description="ล็อกอินก่อน แล้วค่อยแก้ชื่อที่ขึ้นบนจอไลฟ์ตอนคุณขอเพลง"
      >
        <AccountView />
      </AuthGate>
    </AppShell>
  );
}
