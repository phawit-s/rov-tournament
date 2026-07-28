import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import PlayersView from "@/components/tournament/PlayersView";

export const metadata: Metadata = {
  title: "ผู้เล่น — ROV Tournament Hub",
  description: "ประวัติการแข่งขันของผู้เล่นแต่ละคน",
};

export default function PlayersPage() {
  return (
    <AppShell wide>
      <PlayersView />
    </AppShell>
  );
}
