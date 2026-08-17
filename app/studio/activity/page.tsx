import type { Metadata } from "next";
import ActivityView from "@/components/ActivityView";

export const metadata: Metadata = {
  title: "ประวัติการทำงาน — Steamer Hub",
  description: "บันทึกกิจกรรมทั้งหมดที่เกิดขึ้นในเครื่องนี้",
};

export default function StudioActivityPage() {
  return <ActivityView />;
}
