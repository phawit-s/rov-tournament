"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readLiveHashParam } from "@/lib/hash";

export type WidgetOptions = {
  /** ขยาย/ย่อทั้ง widget — 1 = ขนาดตามที่หน้าแจกลิงก์บอก */
  scale: number;
  /**
   * สีสำรองของช่อง "#rrggbb" — null = ไม่ได้ตั้ง (ใช้เทา)
   *
   * สีหลักของ widget มาจากปกเพลงเสมอ สีนี้ใช้แค่ตอนปกให้สีไม่ได้
   * (ยังไม่มีเพลง / รูปปกโหลดไม่ขึ้น) ลิงก์เก่าที่ใส่ ?accent= ไว้จึงยังมีผลอยู่
   */
  accent: string | null;
  /** โหมดพรีวิวในหน้าแจกลิงก์ — มีพื้นทึบ และโชว์คำอธิบายตอนยังไม่มีข้อมูล */
  solid: boolean;
};

/** รับเฉพาะโค้ดสีที่ถูกรูป ค่าขยะในลิงก์ต้องไม่ทำให้พื้นการ์ดหายไปทั้งใบ */
function parseAccent(raw: string | null): string | null {
  if (!raw) return null;
  const hex = raw.replace(/^#/, "").trim();
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .toLowerCase()
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return null;
}

/**
 * อ่านค่าตั้งของ widget จากลิงก์ เช่น ?accent=ddaf64&scale=1.2&solid=1
 *
 * ดู query ก่อน (รูปแบบที่หน้าแจกลิงก์สร้าง) ไม่เจอค่อยดูใน #hash
 * เพราะคนตั้งค่าพิมพ์ต่อท้ายลิงก์เองสลับกันไปมาเป็นเรื่องปกติ
 *
 * getSnapshot คืนสตริงดิบ ไม่ใช่ออบเจกต์ — ออบเจกต์ใหม่ทุกครั้งที่ถูกเรียก
 * React จะมองว่า store เปลี่ยนไม่หยุดแล้ววนเรนเดอร์ไม่จบ
 */
export function useWidgetOptions(): WidgetOptions {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // query ไม่มีวันมี # อยู่ข้างใน จึงต่อกันแล้วตัดกลับที่ # ตัวแรกได้แน่นอน
  const raw = useSyncExternalStore(
    subscribe,
    () => window.location.search + window.location.hash,
    () => "",
  );

  return useMemo(() => {
    const query = new URLSearchParams(raw.split("#")[0]);
    const read = (key: string) =>
      query.get(key) ?? (raw.includes("#") ? readLiveHashParam(key) : null);

    const scale = Number(read("scale"));
    return {
      scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
      accent: parseAccent(read("accent")),
      solid: read("solid") === "1",
    };
  }, [raw]);
}
