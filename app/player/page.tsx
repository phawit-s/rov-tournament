import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import StreamerGate from "@/components/studio/StreamerGate";
import SongPlayer from "@/components/song/SongPlayer";

export const metadata: Metadata = {
  title: "เล่นเพลงตามคิว — Steamer Hub",
  description: "หน้าเล่นเพลงของสตรีมเมอร์ ไล่ตามคิวที่คนดูขอเข้ามา",
};

/**
 * หน้านี้ตั้งใจให้เปิดในเบราว์เซอร์ปกติของสตรีมเมอร์ ไม่ใช่ใน OBS
 * เพราะต้องอาศัยคุกกี้ที่ล็อกอิน YouTube Premium อยู่แล้วเพื่อไม่ให้มีโฆษณาคั่น
 * แล้วค่อยดึงเสียงเข้า OBS ทาง Desktop Audio หรือจับหน้าต่างนี้เป็น Window Capture
 *
 * อยู่นอก /studio/ โดยตั้งใจ — เปิดค้างเป็นหน้าต่างแยกทั้งจอระหว่างไลฟ์
 * แถบข้างของสตูดิโอจึงมีแต่จะกินที่เปล่าๆ
 */
export default function PlayerPage() {
  return (
    <AppShell wide>
      <StreamerGate
        title="ตัวเล่นเพลงสำหรับสตรีมเมอร์"
        description="ต้องล็อกอินก่อน เพราะหน้านี้เป็นตัวที่สั่งเปลี่ยนเพลงในคิวจริง"
      >
        <SongPlayer />
      </StreamerGate>
    </AppShell>
  );
}
