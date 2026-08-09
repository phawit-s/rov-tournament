import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import WheelView from "@/components/wheel/WheelView";

export const metadata: Metadata = {
  title: "วงล้อสุ่ม — Steamer Hub",
  description: "ใส่ชื่อแล้วหมุนวงล้อ สุ่มผู้โชคดีแบบมีลุ้น",
};

export default function WheelPage() {
  return (
    <AppShell>
      <WheelView />
    </AppShell>
  );
}
