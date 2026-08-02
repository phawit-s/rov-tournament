"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
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

/**
 * ตัดสินว่าจะเอาอะไรมาเป็นสำเนาในเครื่องตอนเปิดหน้าตั้งค่าช่อง
 *
 * แยกออกมาเป็นฟังก์ชันล้วนเพราะตัดสินผิดแล้วเสียหายหนัก —
 * ถ้ารีบสร้างโครงว่างทั้งที่บนคลาวด์มีช่องอยู่แล้ว หน้าจะโชว์ช่องเปล่า
 * และถ้าคนกด "เผยแพร่ช่อง" ตอนนั้น ช่องจริงจะโดนทับหายทั้งใบ
 */
export type SeedChoice = "wait" | "use-cloud" | "create-empty" | "keep-local";

export function decideChannelSeed(input: {
  /** ล็อกอินอยู่ไหม */
  hasUser: boolean;
  /** มีสำเนาในเครื่องแล้วหรือยัง */
  hasLocal: boolean;
  /** ผู้ดูแลกำลังสลับไปแก้ช่องของคนอื่นอยู่ไหม (ช่องนั้นใช้สำเนาแยกของมันเอง) */
  editingOther: boolean;
  /** รู้ผลจากคลาวด์แล้วหรือยัง */
  cloudLoaded: boolean;
  /** บนคลาวด์มีช่องนี้อยู่จริงไหม */
  cloudExists: boolean;
}): SeedChoice {
  if (!input.hasUser) return "wait";
  // ของที่แก้ค้างไว้ในเครื่องสำคัญกว่าเสมอ ห้ามเอาของคลาวด์มาทับงานที่ยังไม่ได้เผยแพร่
  if (input.hasLocal) return "keep-local";
  if (input.editingOther) return "keep-local";
  if (!input.cloudLoaded) return "wait";
  return input.cloudExists ? "use-cloud" : "create-empty";
}

/**
 * โครงช่องเปล่า
 *
 * ค่าเริ่มต้นของ id คือ uid ของเจ้าของ ซึ่งเป็นช่องแรกของคนนั้น
 * ช่องที่สองเป็นต้นไปต้องส่ง id เข้ามาเอง เพราะชื่อเอกสารซ้ำกันไม่ได้
 */
export function emptyChannel(
  owner: { uid: string; email?: string | null },
  id?: string,
): Channel {
  const now = new Date().toISOString();
  return {
    ...DEFAULT_CHANNEL,
    id: id ?? owner.uid,
    ownerUid: owner.uid,
    ownerEmail: owner.email ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * เปิดช่องใหม่ให้เจ้าของคนเดิม
 *
 * ต้องเขียนขึ้นคลาวด์ทันทีตั้งแต่ตอนสร้าง ไม่รอให้กดเผยแพร่
 * เพราะแถบสลับช่องอ่านรายชื่อจากคลาวด์ ถ้าไม่เขียนก่อนช่องใหม่จะไม่โผล่ให้เลือก
 *
 * ยังไม่ตั้ง handle ให้ — เจ้าของต้องตั้งเองก่อนคนอื่นถึงจะเปิดลิงก์ /c/#h= ได้
 * (ตัวหา handle มองข้ามช่องที่ handle ว่างอยู่แล้ว จึงไม่ไปชนกับช่องอื่น)
 */
export async function createChannel(
  owner: { uid: string; email?: string | null },
  name: string,
): Promise<Channel> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const id = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fresh: Channel = { ...emptyChannel(owner, id), name: name.trim() };
  await setDoc(doc(db, COL, id), {
    ...fresh,
    isPublic: true,
    syncedAt: serverTimestamp(),
  });
  return fresh;
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
 *
 * ตั้งใจไม่ใช้ orderBy ใน query — Firestore จะ "ตัดเอกสารที่ไม่มีฟิลด์นั้นทิ้งเงียบๆ"
 * ถ้าเรียงด้วย updatedAt แล้วมีช่องไหนไม่มีฟิลด์นี้ (เอกสารเก่า หรือถูกเขียนจาก
 * ที่อื่น) ผู้ดูแลจะไม่เห็นช่องนั้นเลยและไม่มี error ให้จับด้วย
 * คอลเลกชันนี้มีขนาดเท่าจำนวนผู้จัด เรียงในเครื่องเองถูกกว่ามาก
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
    collection(db, COL),
    (snap) => {
      // id จาก doc เชื่อถือได้กว่าฟิลด์ในเอกสาร (เอกสารเก่าอาจไม่มี id)
      const list = snap.docs.map((d) => ({ ...(d.data() as Channel), id: d.id }));
      list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      onChange(list);
    },
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
