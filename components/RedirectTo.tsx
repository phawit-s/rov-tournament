"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * ทางเปลี่ยนสำหรับที่อยู่เก่า
 *
 * เว็บเป็นไฟล์นิ่งบน GitHub Pages ไม่มีเซิร์ฟเวอร์ให้ตอบ 301 — เปลี่ยนหน้าจากในเบราว์เซอร์
 * ใช้ replace ไม่ใช่ push ไม่งั้นปุ่มย้อนกลับเด้งกลับมาที่นี่แล้ววนไม่จบ
 * `keepHash` = พา #h=... ติดไปด้วย (ลิงก์ QR เก่าของช่องอยู่ในรูปนั้น)
 * ยังพิมพ์ลิงก์ให้เห็นด้วย เผื่อ JavaScript ไม่ทำงาน
 */
export default function RedirectTo({
  href,
  label,
  keepHash = false,
}: {
  href: string;
  label: string;
  keepHash?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    router.replace(keepHash ? `${href}${window.location.hash}` : href);
  }, [router, href, keepHash]);

  return (
    <div className="py-16">
      <p className="text-muted">ที่อยู่นี้ย้ายแล้ว กำลังพาไปหน้าใหม่</p>
      <Link href={href} className="mt-3 inline-block font-medium underline">
        ไปที่{label}
      </Link>
    </div>
  );
}
