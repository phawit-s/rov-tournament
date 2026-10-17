import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import RedirectTo from "@/components/RedirectTo";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("ขอเพลง") };

/**
 * หน้าสนับสนุนช่องเดิม (/c/#h=ชื่อช่อง) — ระบบโดเนทถูกตัดออกแล้ว
 * QR ที่แปะบนไลฟ์ยังชี้มาที่นี่ จึงพาไปหน้าขอเพลงของช่องเดียวกันแทน (#h= ติดไปด้วย)
 */
export default function ChannelRedirectPage() {
  return (
    <AppShell>
      <RedirectTo href="/song/" label="หน้าขอเพลง" keepHash />
    </AppShell>
  );
}
