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

/** อ่านค่าจาก location.hash แบบ reactive โดยไม่ setState ใน effect */
export function useHashParam(name: string): string | null {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => {
      const match = window.location.hash.match(
        new RegExp(`[#&]${name}=([^&]+)`),
      );
      return match ? match[1] : null;
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
