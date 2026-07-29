import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AdminGate from "@/components/auth/AdminGate";
import PlayersView from "@/components/tournament/PlayersView";

export const metadata: Metadata = {
  title: "ผู้เล่น — Tourney Hub",
  description: "ประวัติการแข่งขันของผู้เล่นแต่ละคน",
};

export default function PlayersPage() {
  return (
    <AppShell wide>
      <AdminGate>
        <PlayersView />
      </AdminGate>
    </AppShell>
  );
}
