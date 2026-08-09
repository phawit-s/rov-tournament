import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminGate from "@/components/auth/AdminGate";
import ActivityView from "@/components/ActivityView";

export const metadata: Metadata = {
  title: "ประวัติการทำงาน — Steamer Hub",
  description: "บันทึกกิจกรรมทั้งหมดที่เกิดขึ้นในเครื่องนี้",
};

export default function ActivityPage() {
  return (
    <AppShell wide>
      <AdminGate>
        <ActivityView />
      </AdminGate>
    </AppShell>
  );
}
