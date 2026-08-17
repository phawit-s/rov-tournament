import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";

export const metadata: Metadata = {
  title: "หลังบ้าน — Steamer Hub",
};

/** ที่อยู่เดิมก่อนงานของผู้จัดจะย้ายไปรวมกันที่ /studio/ — ลิงก์เก่ายังต้องเปิดได้ */
export default function AdminRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/system/" label="หลังบ้าน" />
    </AppShell>
  );
}
