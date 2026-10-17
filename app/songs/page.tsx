import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("ช่องที่เปิดรับเพลง") };

/** สารบัญช่องย้ายไปเป็นหน้าแรกแล้ว — ลิงก์เก่ายังต้องเปิดได้ */
export default function SongsRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/" label="หน้าแรก" />
    </AppShell>
  );
}
