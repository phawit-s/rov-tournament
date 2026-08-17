import type { Metadata } from "next";
import WidgetBuilder from "@/components/widget/WidgetBuilder";

export const metadata: Metadata = {
  title: "Widget สำหรับสตรีม — Steamer Hub",
  description: "สร้างลิงก์ widget ใส่ OBS หรือ Streamlabs พื้นหลังโปร่งใส",
};

export default function StudioWidgetsPage() {
  return <WidgetBuilder />;
}
