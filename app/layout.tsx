import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, Prompt } from "next/font/google";
import { BRAND } from "@/lib/brand";
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
        {/* ตั้งธีมก่อนเบราว์เซอร์วาดหน้าจอ ไม่งั้นจะเห็นจอกระพริบตอนโหลด */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
