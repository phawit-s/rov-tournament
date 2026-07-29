import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import WidgetBuilder from "@/components/widget/WidgetBuilder";

export const metadata: Metadata = {
  title: "Widget สำหรับสตรีม — ROV Tournament Hub",
  description: "สร้างลิงก์ widget ใส่ OBS หรือ Streamlabs พื้นหลังโปร่งใส",
};

export default function WidgetsPage() {
  return (
    <AppShell wide>
      <WidgetBuilder />
    </AppShell>
  );
}
