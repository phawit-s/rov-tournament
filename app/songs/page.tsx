import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SongChannelDirectory from "@/components/song/SongChannelDirectory";

export const metadata: Metadata = {
  title: "ขอเพลง — Steamer Hub",
  description: "เลือกช่องที่เปิดรับขอเพลง แล้ววางลิงก์ YouTube ส่งเข้าคิวของช่องนั้น",
};

/**
 * สารบัญช่องที่เปิดรับขอเพลง — /songs/
 *
 * แยกจาก /song/ (เอกพจน์) ซึ่งเป็นหน้าขอเพลง "ของช่องใดช่องหนึ่ง" และต้องมี
 * #h=ชื่อช่อง ห้อยท้ายเสมอ · หน้านี้คือชั้นที่ขาดไปสำหรับคนที่ยังไม่มีลิงก์ของช่องไหน
 */
export default function SongsDirectoryPage() {
  return (
    <AppShell>
      <SongChannelDirectory />
    </AppShell>
  );
}
