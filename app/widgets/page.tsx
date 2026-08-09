import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminGate from "@/components/auth/AdminGate";
import WidgetBuilder from "@/components/widget/WidgetBuilder";

export const metadata: Metadata = {
  title: "Widget สำหรับสตรีม — Steamer Hub",
  description: "สร้างลิงก์ widget ใส่ OBS หรือ Streamlabs พื้นหลังโปร่งใส",
};

export default function WidgetsPage() {
  return (
    <AppShell wide>
      <AdminGate>
        <WidgetBuilder />
      </AdminGate>
    </AppShell>
  );
}
