import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import Randomizer from "@/components/Randomizer";

export const metadata: Metadata = {
  title: "สุ่มแบ่งทีม — Tourney Hub",
  description: "ใส่รายชื่อ กำหนดทีมละกี่คน แล้วจับสลากทีละคน",
};

export default function DrawPage() {
  return (
    <AppShell>
      <Randomizer />
    </AppShell>
  );
}
