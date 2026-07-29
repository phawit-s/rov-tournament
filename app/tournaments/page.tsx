import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import TournamentsView from "@/components/tournament/TournamentsView";

export const metadata: Metadata = {
  title: "ทัวร์นาเมนต์ — ROV Tournament Hub",
  description: "สร้างทัวร์นาเมนต์ รับสมัครทีม จัดสายแข่ง และเก็บประวัติผลการแข่ง",
};

export default function TournamentsPage() {
  return (
    <AppShell wide>
      <AuthGate description="ต้องล็อกอินก่อนถึงจะสร้างและจัดการทัวร์นาเมนต์ได้ · ถ้าจะดูทัวร์ที่มีคนแชร์มา เปิดจากลิงก์ได้เลยไม่ต้องล็อกอิน">
        <TournamentsView />
      </AuthGate>
    </AppShell>
  );
}
