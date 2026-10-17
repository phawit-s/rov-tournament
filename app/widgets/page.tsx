import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("ลิงก์สำหรับ OBS") };

/** ที่อยู่เดิมของหน้าสร้างลิงก์ widget — ย้ายไปอยู่ในสตูดิโอ */
export default function WidgetsRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/widgets/" label="ลิงก์สำหรับ OBS" />
    </AppShell>
  );
}
