import type { Metadata } from "next";
import ChannelSettings from "@/components/channel/ChannelSettings";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("ตั้งค่าช่อง"),
  description: "ชื่อช่อง ลิงก์ขอเพลง และกติกาการขอเพลงของช่องคุณ",
};

/* ด่านล็อกอิน/สิทธิ์อยู่ใน StudioShell (app/studio/layout.tsx) แล้ว */
export default function StudioChannelPage() {
  return <ChannelSettings />;
}
