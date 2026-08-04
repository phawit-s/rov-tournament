import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, Prompt } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunk-recovery";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const prompt = Prompt({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-prompt",
  display: "swap",
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-thai",
  display: "swap",
});

// ชื่อแบรนด์ต้องเป็นชุดเดียวทั้งเว็บ ไม่งั้นแท็บ/ลิงก์แชร์/หน้าปกเรียกคนละชื่อ
export const metadata: Metadata = {
  title: `${BRAND} — สุ่มทีม จัดสาย และกราฟิกสำหรับสตรีม`,
  description:
    "ชุดเครื่องมือจัดทัวร์นาเมนต์ครบในหน้าเดียว ใช้ได้กับทุกเกม — สุ่มแบ่งทีม จัดสายแข่ง วงล้อสุ่ม และ widget สำหรับ OBS",
  applicationName: BRAND,
  openGraph: {
    title: BRAND,
    description:
      "สุ่มแบ่งทีมแบบยุติธรรม ตรวจสอบย้อนหลังได้ด้วย seed พร้อมสายแข่งและกราฟิกสำหรับสตรีม",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      data-theme="dark"
      className={`${prompt.variable} ${plexThai.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          ตั้งธีมก่อนเบราว์เซอร์วาดหน้าจอ ไม่งั้นจะเห็นจอกระพริบตอนโหลด
          ต้องเป็น <script> ธรรมดาใน <head> เพราะต้องรันตอนแปลง HTML
          next/script strategy="beforeInteractive" การันตีแค่ว่ามาก่อนโค้ดของ Next
          ไม่ได้การันตีว่ามาก่อนการวาดจอ จึงยังกันจอกระพริบไม่ได้
          (React จะเตือนใน dev ว่าสคริปต์ไม่ทำงานตอนเรนเดอร์ฝั่งไคลเอนต์ — ถูกแล้ว
           เพราะธีมถูกตั้งไปตั้งแต่โหลดครั้งแรก หลังจากนั้น themeStore ดูแลต่อ)
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />

        {/*
          ต้องอยู่ใน <head> แบบฝังในหน้าเลย ห้ามแยกเป็นไฟล์
          เพราะหน้าที่ของมันคือกู้กรณี "ไฟล์โหลดไม่ได้" — ถ้าตัวมันเองอยู่ในไฟล์แยก
          ก็จะโหลดไม่ได้ไปพร้อมกัน แล้วไม่มีใครกู้
        */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
