"use client";

import { useOwnChannels } from "./useChannels";
import { useSiteRole } from "./useRole";
import type { Channel } from "@/lib/channel/types";

/**
 * ช่องของบัญชีที่ล็อกอินอยู่ — อ่านจากคลาวด์ ไม่ใช่จากเครื่อง
 *
 * มีไว้ให้หน้าที่แค่ "อยากรู้ว่าช่องเราชื่ออะไร" (เช่นทำลิงก์สนับสนุนในหน้าทัวร์)
 * ไม่ต้องไปพึ่งฉบับร่างที่ค้างอยู่ในหน่วยความจำของหน้าตั้งค่าช่อง —
 * ซึ่งจะว่างเปล่าถ้ายังไม่ได้เปิดหน้านั้นในแท็บนี้ และไม่มีทางตามข้ามเครื่องได้
 *
 * ตอนนี้เป็นเปลือกบางๆ ของ useOwnChannels ซึ่งใช้ท่อข้อมูลร่วมกับหน้าอื่น
 * (lib/backend/live.ts) — เปิดหลายหน้าพร้อมกันก็ยังมี onSnapshot ท่อเดียว
 */
export function useMyChannels(): {
  channels: Channel[];
  first: Channel | null;
  loaded: boolean;
} {
  const { uid } = useSiteRole();
  const { channels, loaded } = useOwnChannels(uid);
  return { channels, first: channels[0] ?? null, loaded };
}
