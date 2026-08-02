"use client";

import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import type { FillerTrack } from "./types";
import { FILLER_LIMIT } from "./filler";

const COL = "channels";

/**
 * แก้ค่าตั้งค่าระบบขอเพลงบนเอกสารช่องโดยตรง
 *
 * ต่างจากหน้าตั้งค่าช่อง (/channel/) ที่แก้สำเนาในเครื่องก่อนแล้วรอกด "เผยแพร่ช่อง"
 * ของพวกนี้ต้องมีผลทันทีเพราะใช้ตอนกำลังไลฟ์อยู่ — ปิดรับคิวแล้วต้องปิดเดี๋ยวนั้น
 * ไม่ใช่ปิดแล้วยังมีคนส่งเข้ามาได้อีกจนกว่าจะนึกได้ว่าต้องกดเผยแพร่
 *
 * ใช้ updateDoc กับพาธแบบจุด (songs.enabled) ไม่ใช่ setDoc ทั้งก้อน
 * จะได้แตะเฉพาะฟิลด์นั้น ไม่ไปทับค่าอื่นในช่องที่คนอื่นอาจเพิ่งแก้ไป
 *
 * ข้อควรรู้: ถ้าหลังจากนี้ไปกด "เผยแพร่ช่อง" ที่หน้าตั้งค่าโดยที่หน้านั้น
 * ยังถือสำเนาเก่าอยู่ ค่าที่แก้จากตรงนี้จะถูกทับ — แถบ "มีการแก้ที่ยังไม่ได้เผยแพร่"
 * ในหน้านั้นจะขึ้นเตือนให้เห็นก่อนอยู่แล้ว
 */
async function patchSongs(channelId: string, patch: Record<string, unknown>) {
  const db = getDb();
  if (!db || !channelId) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await updateDoc(doc(db, COL, channelId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

/** เปิด/ปิดรับคำขอเพลงจากคนดู — มีผลทันที ไม่ต้องกดเผยแพร่ */
export function setSongsEnabled(channelId: string, enabled: boolean): Promise<void> {
  return patchSongs(channelId, { "songs.enabled": enabled });
}

export function saveFillerList(
  channelId: string,
  tracks: FillerTrack[],
): Promise<void> {
  return patchSongs(channelId, { "songs.filler": tracks.slice(0, FILLER_LIMIT) });
}

export function saveFillerMode(
  channelId: string,
  mode: "off" | "order" | "shuffle",
): Promise<void> {
  return patchSongs(channelId, { "songs.fillerMode": mode });
}
