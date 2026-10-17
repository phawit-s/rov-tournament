import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("ตั้งค่าช่อง") };

/** ที่อยู่เดิมก่อนงานของสตรีมเมอร์จะย้ายไปรวมที่ /studio/ — ลิงก์เก่ายังต้องเปิดได้ */
export default function ChannelRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/channel/" label="ตั้งค่าช่อง" />
    </AppShell>
  );
}
