"use client";

import { useCallback, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

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
    () => {
      const inHash = window.location.hash.match(new RegExp(`[#&]${name}=([^&]+)`));
      if (inHash) return inHash[1];
      return new URLSearchParams(window.location.search).get(name);
    },
    () => null,
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
