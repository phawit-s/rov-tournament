import type { Metadata } from "next";
import WidgetBuilder from "@/components/widget/WidgetBuilder";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("ลิงก์สำหรับ OBS"),
  description: "ลิงก์ widget เพลงที่กำลังเล่น สำหรับวางเป็น Browser Source ใน OBS หรือ Streamlabs",
};

export default function StudioWidgetsPage() {
  return <WidgetBuilder />;
}
