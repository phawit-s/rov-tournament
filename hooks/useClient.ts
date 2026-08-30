"use client";

import { useCallback, useSyncExternalStore } from "react";
import { liveHash, readLiveHashParam } from "@/lib/hash";

const noopSubscribe = () => () => {};

/**
 * เวลาปัจจุบันที่ขยับเอง — ใช้กับของที่ต้องพลิกสถานะตามเวลา เช่น เปิด/ปิดรับสมัคร
 *
 * เรียก Date.now() ตรงๆ ตอน render ไม่ได้ กฎ react-hooks/purity ห้ามไว้
 * เพราะค่าจะเปลี่ยนทุกครั้งที่ React บังเอิญ re-render
 *
 * ต้องปัดค่าลงเป็นช่วงๆ ด้วย ไม่งั้น getSnapshot คืนค่าใหม่ทุกครั้งที่ถูกเรียก
 * React จะมองว่า store เปลี่ยนไม่หยุดแล้ววนซ้ำไม่จบ
 * คืน 0 ตอน render บนเซิร์ฟเวอร์ ให้ผลตรงกับตอน hydrate
 */
export function useNow(intervalMs = 30_000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );
  const snapshot = useCallback(
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** false ตอน render บนเซิร์ฟเวอร์และตอน hydrate, true หลังจากนั้น */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * อ่านพารามิเตอร์จาก URL แบบ reactive โดยไม่ setState ใน effect
 *
 * ดูใน hash ก่อน (#ch=... คือรูปแบบหลักของลิงก์แชร์กับ widget)
 * ถ้าไม่เจอค่อยตกไปดู query string (?ch=...) เพราะโปรแกรมที่ฝังหน้าเว็บ
 * บางตัว — เช่น web source ของ TikTok LIVE Studio — ตัดส่วน #hash ทิ้ง
 * ก่อนโหลดหน้า ทำให้ widget ไม่รู้ว่าต้องฟังช่องไหนแล้วขึ้นจอเปล่า
 */
export function useHashParam(name: string): string | null {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () =>
      readLiveHashParam(name) ?? new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

/**
 * แก้พารามิเตอร์ใน #hash โดยไม่ทับตัวอื่นที่อยู่ในนั้น
 *
 * หน้าเดียวใช้ hash หลายตัวพร้อมกันได้ — หน้าตั้งค่าช่องใช้ทั้ง #c= (ช่องไหน)
 * และ #tab= (ส่วนไหนของหน้า) ของเดิมเขียนทับทั้งก้อนด้วย
 * `window.location.hash = "tab=..."` ซึ่งลบรหัสช่องทิ้งทุกครั้งที่กดสลับส่วน
 * แล้วหน้าก็เด้งกลับไปช่องเริ่มต้นเงียบๆ
 *
 * ส่งค่า null หรือสตริงว่างเพื่อลบตัวนั้นออก
 * ตั้งใจไม่ใช้ URLSearchParams เพราะมันเข้ารหัสค่าใหม่ทั้งหมด — ลิงก์แชร์
 * (#s=<base64>) มีทั้ง + / = ซึ่งจะถูกแปลงจนอ่านกลับไม่ได้
 */
export function setHashParams(patch: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const raw = liveHash();
  const map = new Map<string, string>();
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") map.delete(key);
    else map.set(key, value);
  }
  const next = [...map].map(([k, v]) => `${k}=${v}`).join("&");
  // ปล่อยให้เบราว์เซอร์ยิง hashchange เอง ปุ่มย้อนกลับจะได้ยังทำงานตามปกติ
  window.location.hash = next;
}

/**
 * ธงเปิด/ปิดที่ติดมากับ URL เช่น ?replay=1
 *
 * รับทั้งใน query และใน hash เหมือน useHashParam เพราะ Browser Source
 * บางตัวส่งมาคนละที่กัน แล้วคนตั้งค่าก็พิมพ์สลับกันเป็นเรื่องปกติ
 */
export function useQueryFlag(name: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => {
      if (new URLSearchParams(window.location.search).get(name) === "1") return true;
      return readLiveHashParam(name) === "1";
    },
    () => false,
  );
}

/** ติดตาม media query โดยไม่ setState ใน effect */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
