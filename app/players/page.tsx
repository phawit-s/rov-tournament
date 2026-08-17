import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";

export const metadata: Metadata = {
  title: "ผู้เล่น — Steamer Hub",
};

/** ที่อยู่เดิมก่อนงานของผู้จัดจะย้ายไปรวมกันที่ /studio/ — ลิงก์เก่ายังต้องเปิดได้ */
export default function PlayersRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/players/" label="ผู้เล่น" />
    </AppShell>
  );
}
