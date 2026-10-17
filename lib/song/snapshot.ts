"use client";

/**
 * คิวสรุปของช่อง — เอกสารใบเดียว channels/{id}/live/queue เก็บเพลงที่ยังไม่จบทั้งคิว
 * ------------------------------------------------------------------
 * ทำไมต้องมี (ต.ค. 2569 โควตาอ่านฟรีวันละ 50,000 ครั้งหมดจนเว็บล่มทั้งวัน)
 *
 *   Firestore คิดค่าอ่านรายเอกสาร ฟังคิวจริง (songRequests ที่ยังไม่จบ) =
 *   จ่ายเท่าจำนวนเพลงในคิวทุกครั้งที่เปิดหน้า/ต่อใหม่ ทุกคนดู ทุก widget และทุกคำขอจากแชท
 *   ใบสรุปทำให้คนอ่านจ่ายครั้งเดียวไม่ว่าคิวจะยาวแค่ไหน และการเปลี่ยนหลายใบพร้อมกัน
 *   (เพลงเดิมจบ + เพลงถัดไปขึ้น) ถูกรวบเป็นการเปลี่ยนครั้งเดียว
 *
 * ใครเขียน: ตัวเล่นในสตูดิโอ (แท็บที่คุมคิว) ซึ่งฟังคิวจริงอยู่แล้ว — เขียนเมื่อคิวเปลี่ยน
 *   (หน่วงไว้รวบหลายการเปลี่ยน) เขียนซ้ำทุก HEARTBEAT_MS ให้รู้ว่ายังสด
 *   และพยายามประกาศว่า "เลิกสด" ตอนปิดหน้า
 *   ต้องเป็นตัวเล่น เพราะ Firebase แพ็กเกจฟรีไม่มี Cloud Functions ไว้สร้างใบนี้ฝั่งเซิร์ฟเวอร์
 *   และคนดูเขียนเองไม่ได้ (ใครก็ลบคิวคนอื่นทิ้งได้)
 *
 * ใครอ่าน: หน้าขอเพลง widget ทางสำรอง REST ของ widget และ Worker (worker/song-ingest.js)
 *
 * ใบเก่าเกิน STALE_MS หรือยังไม่มีใบ (ตัวเล่นไม่ได้เปิด / ยังเป็นโค้ดรุ่นก่อน / กติกายังไม่ publish)
 * → กลับไปฟังคิวจริงแบบเดิม ผิดแค่เรื่องเงิน ไม่ผิดเรื่องข้อมูล
 * ------------------------------------------------------------------ */

import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import { restGetDoc } from "@/lib/backend/firestore-rest";
import { watchSongQueue } from "./store";
import type { SongRequest } from "./types";

/** ตัวเล่นเขียนซ้ำทุกเท่านี้แม้คิวไม่เปลี่ยน — ทุกครั้งคิดค่าอ่าน 1 ต่อคนที่ฟังอยู่ จึงไม่ถี่ */
export const HEARTBEAT_MS = 10 * 60_000;
/** ไม่มีใครเขียนนานเกินนี้ = ตัวเล่นปิดไปแล้ว ใบนี้เชื่อไม่ได้ (worker/song-ingest.js ใช้ค่าเดียวกัน) */
export const STALE_MS = 25 * 60_000;

export type QueueSnapshot = {
  v: 1;
  /** ISO — เวลาที่ตัวเล่นเขียนล่าสุด */
  updatedAt: string;
  /** ตัวเล่นปิดหน้า/เลิกคุมคิวแล้ว — คนอ่านกลับไปฟังคิวจริงทันที ไม่ต้องรอให้เก่า */
  closed?: boolean;
  songs: SongRequest[];
};

const EMPTY: SongRequest[] = [];

const ref = (channelId: string) => {
  const db = getDb();
  return db ? doc(db, "channels", channelId, "live", "queue") : null;
};

/** ใบนี้ยังเชื่อได้ไหม */
export function isFresh(snap: QueueSnapshot | null | undefined, now = Date.now()): boolean {
  if (!snap || snap.v !== 1 || snap.closed || !Array.isArray(snap.songs)) return false;
  const at = Date.parse(snap.updatedAt);
  return Number.isFinite(at) && now - at < STALE_MS;
}

/**
 * ตัดเหลือเฉพาะฟิลด์ที่คนอ่านใช้ — ใบเดียวเก็บได้ไม่เกิน 1 MB และทุกไบต์ส่งไปทุกคนที่ฟัง
 * (url กับ channelId ไม่ต้อง ใบรู้อยู่แล้วว่าเป็นของช่องไหน และสร้างลิงก์จาก videoId ได้)
 */
function slim(s: SongRequest): SongRequest {
  const out: Record<string, unknown> = {};
  const keys = [
    "id", "videoId", "title", "author", "byUid", "byName", "message",
    "status", "createdAt", "playedAt", "duration", "source", "orderKey",
  ] as const;
  for (const k of keys) {
    const v = (s as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as SongRequest;
}

/** ไว้เทียบว่าคิวเปลี่ยนจริงไหม — ไม่เปลี่ยนก็ไม่ต้องเขียน (ทุกการเขียนคิดค่าอ่านกับทุกคนที่ฟัง) */
export function snapshotKey(songs: SongRequest[]): string {
  return JSON.stringify(songs.map(slim));
}

export async function writeQueueSnapshot(channelId: string, songs: SongRequest[]): Promise<void> {
  const r = ref(channelId);
  if (!r) return;
  const body: Record<string, unknown> = {
    v: 1,
    updatedAt: new Date().toISOString(),
    closed: deleteField(),
    songs: songs.map(slim),
  };
  await setDoc(r, body, { merge: true });
}

/** อ่านใบสรุปผ่าน REST ครั้งเดียว (1 read) — ทางสำรองของ widget · ไม่มีใบ = null */
export function fetchQueueSnapshot(channelId: string): Promise<QueueSnapshot | null> {
  return restGetDoc<QueueSnapshot>(`channels/${channelId}/live/queue`);
}

/** ประกาศว่าเลิกสด — ทำแบบพยายามเท่านั้น (ตอนปิดแท็บอาจส่งไม่ทัน ก็ยังมี STALE_MS กันไว้) */
export function closeQueueSnapshot(channelId: string): void {
  const r = ref(channelId);
  if (!r) return;
  void setDoc(r, { closed: true }, { merge: true }).catch(() => undefined);
}

/**
 * ฟังคิวที่ยังไม่จบแบบประหยัด — ฟังใบสรุปก่อน ใบไม่มี/เก่า/ปิดแล้ว ค่อยฟังคิวจริง
 * รูปเดียวกับ watchSongQueue(..., { onlyOpen: true }) เอาไปแทนกันได้ตรงๆ
 */
export function watchOpenQueueCheap(
  channelId: string,
  onChange: (list: SongRequest[], fromCache: boolean) => void,
  onError?: (e: Error) => void,
): () => void {
  const r = channelId ? ref(channelId) : null;
  if (!r) {
    onChange(EMPTY, false);
    return () => {};
  }

  let exact: (() => void) | null = null;
  let staleTimer: number | undefined;
  const useExact = () => {
    if (!exact) exact = watchSongQueue(channelId, onChange, { onlyOpen: true, onError });
  };
  const dropExact = () => {
    exact?.();
    exact = null;
  };

  const stopSnap = onSnapshot(
    r,
    (snap) => {
      window.clearTimeout(staleTimer);
      const data = snap.exists() ? (snap.data() as QueueSnapshot) : null;
      if (data && isFresh(data)) {
        dropExact();
        const list = data.songs
          .slice()
          .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
        onChange(list, snap.metadata.fromCache);
        // ไม่มีใครเขียนซ้ำจนเลยเวลา = ตัวเล่นปิดไปเงียบๆ → กลับไปฟังคิวจริงเอง
        staleTimer = window.setTimeout(useExact, Date.parse(data.updatedAt) + STALE_MS - Date.now());
      } else if (!snap.metadata.fromCache) {
        /* เซิร์ฟเวอร์ยืนยันแล้วว่าไม่มีใบ หรือใบเชื่อไม่ได้ → แบบเดิม
           ของที่ตอบจากแคชยังไม่ตัดสิน — แคชว่างตอนเพิ่งเปิดหน้า หรือถือใบเก่าจากรอบก่อน
           ทั้งที่บนเซิร์ฟเวอร์อาจสดอยู่ เปิดคิวจริงตอนนั้นคือจ่ายเท่าจำนวนเพลงฟรีๆ */
        useExact();
      }
    },
    // อ่านใบสรุปไม่ได้ (กติกายังไม่ publish ฯลฯ) ก็ใช้แบบเดิม
    () => useExact(),
  );

  return () => {
    stopSnap();
    dropExact();
    window.clearTimeout(staleTimer);
  };
}
