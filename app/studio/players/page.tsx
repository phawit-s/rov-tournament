import type { Metadata } from "next";
import PlayersView from "@/components/tournament/PlayersView";

export const metadata: Metadata = {
  title: "ผู้เล่น — Steamer Hub",
  description: "ประวัติการแข่งขันของผู้เล่นแต่ละคน",
};

export default function StudioPlayersPage() {
  return <PlayersView />;
}
