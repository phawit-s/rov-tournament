import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
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
  themeColor: "#04040c",
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
    <html lang="th" className={`${chakra.variable} ${plexThai.variable}`}>
      <body className="scanlines antialiased">{children}</body>
    </html>
  );
}
