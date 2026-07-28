import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import TournamentsView from "@/components/tournament/TournamentsView";

export const metadata: Metadata = {
  title: "ทัวร์นาเมนต์ — ROV Tournament Hub",
  description: "สร้างทัวร์นาเมนต์ รับสมัครทีม จัดสายแข่ง และเก็บประวัติผลการแข่ง",
};

export default function TournamentsPage() {
  return (
    <AppShell wide>
      <TournamentsView />
    </AppShell>
  );
}
