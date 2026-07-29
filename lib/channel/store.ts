"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb, hasBackend } from "@/lib/backend/firebase";
import { DEFAULT_CHANNEL, type Channel } from "./types";

const COL = "channels";
const KEY = "tourney-hub/channel/v1";

/* ---------------- สำเนาในเครื่อง ---------------- */

let cache: Channel | null | undefined;
const listeners = new Set<() => void>();

function read(): Channel | null {
  if (cache !== undefined) return cache;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Channel) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function commit(next: Channel | null) {
  cache = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* ไม่ซีเรียส */
  }
  listeners.forEach((l) => l());
}

export function emptyChannel(owner: { uid: string; email?: string | null }): Channel {
  const now = new Date().toISOString();
  return {
    ...DEFAULT_CHANNEL,
    id: owner.uid,
    ownerUid: owner.uid,
    ownerEmail: owner.email ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export const channelStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => read(),
  getServerSnapshot: (): Channel | null => null,

  set(next: Channel | null) {
    commit(next ? { ...next, updatedAt: new Date().toISOString() } : null);
  },

  update(patch: Partial<Channel>) {
    const current = read();
    if (!current) return;
    commit({ ...current, ...patch, updatedAt: new Date().toISOString() });
  },
};

/* ---------------- คลาวด์ ---------------- */

export function channelCloudReady(): boolean {
  return hasBackend && !!getDb();
}

/**
 * อัปโหลดช่องขึ้นคลาวด์ไปยัง doc ที่ระบุ (public read)
 *
 * แยกออกมาจาก pushChannel เพราะผู้ดูแลระบบแก้ช่องของคนอื่นได้
 * ตอนนั้น id ปลายทางไม่ใช่ uid ของคนที่กดปุ่ม กติกา isAdmin() ใน firestore.rules อนุญาตไว้แล้ว
 * ownerUid ในตัวเอกสารไม่ถูกแตะ เจ้าของเดิมยังเป็นเจ้าของอยู่
 */
export async function pushChannelAs(channel: Channel, targetId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const slim: Channel = { ...channel, id: targetId };
  // รูปใหญ่เกินโควตา doc ก็ตัดทิ้ง
  if (slim.cover && slim.cover.length > 500_000) delete slim.cover;
  await setDoc(
    doc(db, COL, targetId),
    { ...slim, isPublic: true, syncedAt: serverTimestamp() },
    { merge: true },
  );
}

/** อัปโหลดช่องของตัวเอง — doc id คือ uid ของเจ้าของ */
export async function pushChannel(channel: Channel): Promise<void> {
  await pushChannelAs(channel, channel.ownerUid);
}

export function watchChannel(
  id: string,
  onChange: (c: Channel | null) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, COL, id),
    (snap) => onChange(snap.exists() ? (snap.data() as Channel) : null),
    (err) => onError?.(err),
  );
}

/**
 * ฟังรายชื่อช่องทั้งหมด — ใช้ในแถบสลับช่องของผู้ดูแลระบบ
 *
 * กติกาเปิด read ของ channels เป็นสาธารณะอยู่แล้ว เลยไม่ต้องรอสิทธิ์อะไร
 * แต่ฝั่ง UI ควรเรียกเฉพาะตอน useAccess() === 'verified' จะได้ไม่ดึงข้อมูลทิ้งเปล่า
 * เรียงตาม updatedAt ล่าสุดขึ้นก่อน ช่องที่เพิ่งมีคนแก้จะอยู่ต้นแถว
 */
export function watchAllChannels(
  onChange: (list: Channel[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL), orderBy("updatedAt", "desc")),
    (snap) =>
      // id จาก doc เชื่อถือได้กว่าฟิลด์ในเอกสาร (เอกสารเก่าอาจไม่มี id)
      onChange(snap.docs.map((d) => ({ ...(d.data() as Channel), id: d.id }))),
    (err) => onError?.(err),
  );
}

/**
 * ติดธงว่าใบนี้ระบบอนุมัติเอง ไม่ใช่คนกด
 *
 * setChannelDonationStatus เขียนเฉพาะฟิลด์สถานะ ธงนี้เลยต้องเขียนแยกอีกครั้ง
 * เรียกหลังอนุมัติสำเร็จเสมอ ถ้าอนุมัติพลาดจะได้ไม่มีใบ pending ที่ติดธงค้างไว้
 */
export async function markDonationAutoApproved(
  channelId: string,
  donationId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(
    doc(db, COL, channelId, "donations", donationId),
    { autoApproved: true },
    { merge: true },
  );
}

/** หาช่องจาก handle (ใช้ตอนเปิดลิงก์ /c/#h=affarain) */
export async function findChannelByHandle(handle: string): Promise<Channel | null> {
  const db = getDb();
  if (!db || !handle) return null;
  const snap = await getDocs(
    query(collection(db, COL), where("handle", "==", handle.toLowerCase()), limit(1)),
  );
  return snap.empty ? null : (snap.docs[0].data() as Channel);
}
