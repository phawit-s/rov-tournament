import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";

export const metadata: Metadata = {
  title: "ทัวร์นาเมนต์ — Steamer Hub",
};

/** ที่อยู่เดิมก่อนงานของผู้จัดจะย้ายไปรวมกันที่ /studio/ — ลิงก์เก่ายังต้องเปิดได้ */
export default function TournamentsRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/tournaments/" label="ทัวร์นาเมนต์" />
    </AppShell>
  );
}
