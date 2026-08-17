import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";

export const metadata: Metadata = {
  title: "ช่องของฉัน — Steamer Hub",
};

/** ที่อยู่เดิมก่อนงานของผู้จัดจะย้ายไปรวมกันที่ /studio/ — ลิงก์เก่ายังต้องเปิดได้ */
export default function ChannelRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/studio/channel/" label="ช่องของฉัน" />
    </AppShell>
  );
}
