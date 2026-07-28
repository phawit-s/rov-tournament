import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import TournamentDetail from "@/components/tournament/TournamentDetail";

export const metadata: Metadata = {
  title: "รายละเอียดทัวร์นาเมนต์ — ROV Tournament Hub",
};

export default function TournamentPage() {
  return (
    <AppShell wide>
      <TournamentDetail />
    </AppShell>
  );
}
