"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * ทางเปลี่ยนสำหรับที่อยู่เก่า
 *
 * เว็บนี้ถูก export เป็นไฟล์นิ่งไปวางบน GitHub Pages จึงไม่มีเซิร์ฟเวอร์
 * ให้ตอบ 301 ได้ — ต้องเปลี่ยนหน้าจากในเบราว์เซอร์เอา
 * ใช้ replace ไม่ใช่ push เพื่อไม่ให้ปุ่มย้อนกลับเด้งกลับมาที่หน้านี้แล้ววนไม่จบ
 *
 * ยังพิมพ์ลิงก์ให้เห็นด้วย เผื่อ JavaScript ไม่ทำงาน — จะได้ไม่เจอหน้าว่างเปล่า
 */
export default function RedirectTo({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return (
    <div className="grid min-h-[50vh] place-items-center py-16 text-center">
      <div>
        <p className="slug">ย้ายที่อยู่แล้ว</p>
        <p className="mt-3 text-sm text-muted">
          หน้านี้ย้ายไปอยู่ในสตูดิโอแล้ว กำลังพาไปที่ใหม่…
        </p>
        <Link
          href={href}
          className="mt-4 inline-flex font-display text-sm text-iris hover:underline"
        >
          {label} →
        </Link>
      </div>
    </div>
  );
}
