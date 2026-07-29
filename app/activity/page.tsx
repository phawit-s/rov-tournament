import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import ActivityView from "@/components/ActivityView";

export const metadata: Metadata = {
  title: "ประวัติการทำงาน — Tourney Hub",
  description: "บันทึกกิจกรรมทั้งหมดที่เกิดขึ้นในเครื่องนี้",
};

export default function ActivityPage() {
  return (
    <AppShell wide>
      <ActivityView />
    </AppShell>
  );
}
