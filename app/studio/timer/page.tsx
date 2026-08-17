import type { Metadata } from "next";
import AuthGate from "@/components/auth/AuthGate";
import TimerConsole from "@/components/timer/TimerConsole";

export const metadata: Metadata = {
  title: "จับเวลาสด — Steamer Hub",
  description: "นาฬิกาถอยหลังบนสตรีม พร้อมวงล้อสุ่มบวก/ลบเวลา",
};

/**
 * คอนโซลจับเวลาสด — เปิดค้างไว้บนจอที่สองระหว่างไลฟ์
 * ทุกปุ่มมีผลกับ widget ใน OBS ทันที
 */
export default function StudioTimerPage() {
  return (
    <AuthGate
      title="จับเวลาสด"
      description="ล็อกอินด้วยบัญชีเจ้าของช่องเพื่อคุมนาฬิกาที่ขึ้นบนสตรีม"
    >
      <TimerConsole />
    </AuthGate>
  );
}
