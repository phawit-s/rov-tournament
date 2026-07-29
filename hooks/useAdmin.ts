"use client";

import { useSyncExternalStore } from "react";
import { gateStore, type Access } from "@/lib/gate";

/** "none" | "local" | "verified" — ดูความหมายที่ lib/gate.ts */
export function useAccess(): Access {
  return useSyncExternalStore(
    gateStore.subscribe,
    gateStore.getSnapshot,
    gateStore.getServerSnapshot,
  );
}

/** เห็นเมนูและเปิดหน้าหลังบ้านได้ไหม */
export function useIsAdmin(): boolean {
  return useAccess() !== "none";
}
