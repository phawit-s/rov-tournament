import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import ChannelSupport from "@/components/channel/ChannelSupport";

export const metadata: Metadata = {
  title: "สนับสนุนช่อง — Tourney Hub",
  description: "โอนแล้วแนบสลิป ชื่อจะขึ้นหน้าจอสตรีม",
};

export default function ChannelSupportPage() {
  return (
    <AppShell>
      <ChannelSupport />
    </AppShell>
  );
}
