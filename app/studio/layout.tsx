import StudioShell from "@/components/studio/StudioShell";

/**
 * ทุกหน้าใต้ /studio/ ใช้เปลือกเดียวกัน — แถบข้างกับด่านสิทธิ์อยู่ที่นี่ที่เดียว
 * หน้าลูกจึงเหลือแค่เนื้อหาของตัวเอง ไม่ต้องจำว่าต้องครอบอะไรบ้าง
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudioShell>{children}</StudioShell>;
}
