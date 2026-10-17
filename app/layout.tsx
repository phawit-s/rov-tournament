import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunk-recovery";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

/* ฟอนต์เดียวทั้งเว็บ — ไทยไม่มีหัว อ่านง่ายบนจอมือถือ (ดู docs/DESIGN.md) */
const anuphan = Anuphan({
  subsets: ["latin", "thai"],
  variable: "--font-anuphan",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND} — ขอเพลงให้ไลฟ์ที่คุณดูอยู่`,
  description:
    "วางลิงก์ YouTube แล้วเพลงจะเข้าคิวบนไลฟ์ สตรีมเมอร์เปิดตามคิวและโชว์เพลงที่กำลังเล่นบนจอได้",
  applicationName: BRAND,
  openGraph: {
    title: BRAND,
    description: "วางลิงก์ YouTube แล้วเพลงจะเข้าคิวบนไลฟ์",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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
    <html lang="th" data-theme="light" className={anuphan.variable} suppressHydrationWarning>
      <head>
        {/*
          ตั้งธีมก่อนเบราว์เซอร์วาดหน้าจอ ไม่งั้นจะเห็นจอกระพริบตอนโหลด
          ต้องเป็น <script> ธรรมดาใน <head> — next/script การันตีแค่ว่ามาก่อนโค้ดของ Next
          ไม่ได้การันตีว่ามาก่อนการวาดจอ
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/*
          ฝังในหน้าเลย ห้ามแยกไฟล์ — หน้าที่ของมันคือกู้กรณี "ไฟล์โหลดไม่ได้"
          ถ้าตัวมันเองอยู่ในไฟล์แยกก็จะโหลดไม่ได้ไปพร้อมกัน
        */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
