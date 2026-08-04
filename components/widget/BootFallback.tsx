"use client";

import { useEffect } from "react";

/**
 * ถอดป้ายสำรอง "widget โหลดไม่ขึ้น" ทิ้งเมื่อโค้ดฝั่งเบราว์เซอร์ทำงานแล้ว
 *
 * ป้ายนั้นฝังอยู่ใน HTML ของ layout เพื่อให้รอดกรณีที่โค้ดไม่ทำงานเลย
 * (ไฟล์หายหลัง deploy / ส่วนขยายบล็อก / เบราว์เซอร์เก่า) — ดูเหตุผลเต็มที่นั่น
 *
 * ต้องอยู่ใน layout ไม่ใช่ใน WidgetShell เพราะบางสถานะ widget ตั้งใจไม่เรนเดอร์
 * อะไรเลย (แถบยาวตอนคิวว่าง return null) ถ้าไปผูกกับ WidgetShell ป้ายจะเด้งขึ้น
 * ทั้งที่ทุกอย่างทำงานปกติ — กลายเป็นเตือนผิดในสถานะที่พบบ่อยที่สุด
 */
export default function BootFallback() {
  useEffect(() => {
    document.getElementById("widget-boot-fallback")?.remove();
  }, []);
  return null;
}
