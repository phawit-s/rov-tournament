import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SongRequestView from "@/components/song/SongRequestView";

export const metadata: Metadata = {
  title: "ขอเพลง — Tourney Hub",
  description: "วางลิงก์ YouTube แล้วส่งเข้าคิว เพลงจะขึ้นเล่นบนไลฟ์เอง",
};

/**
 * หน้าขอเพลงของช่อง — /song/#h=ชื่อช่อง
 *
 * แยกออกจาก /c/ (หน้าสนับสนุน) เพราะสองเรื่องนี้คนละเจตนากัน
 * คนที่มาขอเพลงไม่ได้ตั้งใจจะโอนเงิน เอามารวมหน้าเดียวเลยอ่านไม่ออกว่าต้องทำอะไร
 */
export default function SongRequestPage() {
  return (
    <AppShell>
      <SongRequestView />
    </AppShell>
  );
}
