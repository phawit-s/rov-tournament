import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SupportPage from "@/components/support/SupportPage";

export const metadata: Metadata = {
  title: "สนับสนุน — ROV Tournament Hub",
  description: "โอนแล้วแนบสลิป ชื่อจะขึ้นหน้าจอสตรีม",
};

export default function DonatePage() {
  return (
    <AppShell>
      <SupportPage mode="tip" />
    </AppShell>
  );
}
