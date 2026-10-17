import type { Metadata } from "next";
import StudioHome from "@/components/studio/StudioHome";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("สตูดิโอ"),
  description: "เพลงที่กำลังเล่น เปิดปิดรับเพลง และลิงก์ให้คนดูของช่องคุณ",
};

export default function StudioPage() {
  return <StudioHome />;
}
