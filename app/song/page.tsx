import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SongRequestView from "@/components/song/SongRequestView";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("ขอเพลง"),
  description: "วางลิงก์ YouTube แล้วส่งเข้าคิว เพลงจะขึ้นเล่นบนไลฟ์เอง",
};

/** หน้าขอเพลงของช่อง — /song/#h=ชื่อช่อง (ลิงก์นี้อยู่ใน QR บนไลฟ์ ห้ามเปลี่ยนที่อยู่) */
export default function SongRequestPage() {
  return (
    <AppShell>
      <SongRequestView />
    </AppShell>
  );
}
