import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, Prompt } from "next/font/google";
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

export const metadata: Metadata = {
  title: "ROV TEAM RANDOMIZER — สุ่มทีมทัวร์นาเมนต์",
  description:
    "เว็บสุ่มแบ่งทีมสำหรับทัวร์นาเมนต์ RoV ใส่รายชื่อ กำหนดจำนวนคนต่อทีม แล้วกดสุ่มทีละคนพร้อมเอฟเฟกต์สุดมันส์",
  applicationName: "ROV Team Randomizer",
  openGraph: {
    title: "ROV TEAM RANDOMIZER",
    description:
      "สุ่มแบ่งทีมทัวร์นาเมนต์ RoV แบบยุติธรรม ตรวจสอบย้อนหลังได้ด้วย seed",
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
