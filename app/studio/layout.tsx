import StudioShell from "@/components/studio/StudioShell";

/** ทุกหน้าใต้ /studio/ ใช้เปลือกเดียวกัน — เมนูกับด่านสิทธิ์อยู่ที่นี่ที่เดียว */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
