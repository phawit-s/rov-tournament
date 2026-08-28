import type { Metadata } from "next";
import TournamentDetail from "@/components/tournament/TournamentDetail";

export const metadata: Metadata = {
  title: "จัดการทัวร์ — Steamer Hub",
  description: "รับสมัคร สุ่มแบ่งทีม จัดสายแข่ง กรอกผล และคิดเงินรางวัล",
};

/**
 * หน้าทัวร์ "ในสตูดิโอ" — เนื้อหาเดียวกับ /tournament/ แต่อยู่ในเปลือกหลังบ้าน
 *
 * ของเดิมกดทัวร์จากหน้ารายการในสตูดิโอแล้วเด้งออกไปหน้าสาธารณะ: แถบข้างหาย
 * เมนูบนกลายเป็นเมนูของคนดู และทางกลับมีทางเดียวคือลิงก์เล็กๆ บนโปสเตอร์
 * ทั้งที่คนที่กดเข้ามาจากหลังบ้านกำลังจะ "ทำงานกับทัวร์นี้" ไม่ได้มาดูโปสเตอร์
 *
 * /tournament/ ยังอยู่เหมือนเดิมสำหรับลิงก์ที่แชร์ออกไป — คนดูไม่ควรเห็นแถบข้าง
 * ของหลังบ้าน และไม่ต้องมีสิทธิ์อะไรถึงจะเปิดได้
 */
export default function StudioTournamentPage() {
  return <TournamentDetail />;
}
