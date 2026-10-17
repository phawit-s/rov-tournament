import type { Metadata } from "next";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("คิวและตัวเล่น"),
  description: "เล่นเพลงตามคิวที่คนดูขอเข้ามา จัดคิว ข้าม ลบ และตั้งเพลงสำรอง",
};

/**
 * หน้านี้ว่างโดยตั้งใจ — ตัวเล่นกับคิววางโดย StudioShell (components/studio/StudioPlayer.tsx)
 *
 * ถ้าตัวเล่นอยู่ในหน้านี้ พอสลับไปหน้าตั้งค่าหรือหน้า OBS ระหว่างไลฟ์ มันจะถูกถอดทิ้ง
 * แล้วเพลงหยุดกลางไลฟ์ · เปลือกจึงถือตัวเล่นไว้เอง และโชว์เต็มจอเฉพาะตอนอยู่หน้านี้
 * (หน้าคิวเดิม components/song/QueueManager.tsx ไม่มีใครใช้แล้ว — ตัวเล่นทำได้ครบกว่า)
 */
export default function StudioQueuePage() {
  return null;
}
