import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SupportPage from "@/components/support/SupportPage";

export const metadata: Metadata = {
  title: "สมัครสมาชิก — ROV Tournament Hub",
  description: "สมัครสมาชิกรายเดือน รับป้ายและสิทธิพิเศษ",
};

export default function MemberPage() {
  return (
    <AppShell>
      <SupportPage mode="member" />
    </AppShell>
  );
}
