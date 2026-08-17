"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { authStore } from "@/lib/backend/firebase";
import { watchMyChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";

/* ต้องเป็นอาร์เรย์ตัวเดิมเสมอ ไม่งั้น setState ตอน error จะรีเรนเดอร์ไม่จบ */
const NONE: Channel[] = [];

/**
 * ช่องของบัญชีที่ล็อกอินอยู่ — อ่านจากคลาวด์ ไม่ใช่จากเครื่อง
 *
 * มีไว้ให้หน้าที่แค่ "อยากรู้ว่าช่องเราชื่ออะไร" (เช่นทำลิงก์สนับสนุนในหน้าทัวร์)
 * ไม่ต้องไปพึ่งฉบับร่างที่ค้างอยู่ในหน่วยความจำของหน้าตั้งค่าช่อง —
 * ซึ่งจะว่างเปล่าถ้ายังไม่ได้เปิดหน้านั้นในแท็บนี้ และไม่มีทางตามข้ามเครื่องได้
 */
export function useMyChannels(): {
  channels: Channel[];
  first: Channel | null;
  loaded: boolean;
} {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const uid = user && !user.anonymous ? user.uid : null;

  const [channels, setChannels] = useState<Channel[]>(NONE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchMyChannels(
      uid,
      (list) => {
        setChannels(list);
        setLoaded(true);
      },
      () => {
        setChannels(NONE);
        setLoaded(true);
      },
    );
  }, [uid]);

  return { channels, first: channels[0] ?? null, loaded };
}
