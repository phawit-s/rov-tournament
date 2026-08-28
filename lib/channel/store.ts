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
import { authStore, getDb, hasBackend } from "@/lib/backend/firebase";
import { DEFAULT_CHANNEL, type Channel } from "./types";

const COL = "channels";

/**
 * ---------------- ฉบับร่างระหว่างแก้ (อยู่ในหน่วยความจำล้วน) ----------------
 *
 * ★ ห้ามเขียนลง localStorage ★
 *
 * ช่องเป็นของ "บัญชี" ไม่ใช่ของ "เครื่อง" — เจ้าของเปิดจากคอมที่บ้าน โน้ตบุ๊ก
 * ที่ร้าน หรือมือถือ ก็ต้องเห็นของชุดเดียวกัน ต้นฉบับจึงต้องอยู่บนคลาวด์ที่เดียว
 *
 * ของเดิมเก็บร่างไว้ใน localStorage คีย์เดียวทั้งเบราว์เซอร์ ซึ่งพังสองทางพร้อมกัน:
 *
 *  1. ย้ายเครื่องแล้วของหาย — เปิดอีกเครื่องได้ช่องเปล่า ทั้งที่บนคลาวด์มีครบ
 *  2. ใช้เครื่องร่วมกันแล้วของรั่ว — สลับบัญชีแล้วร่างของคนก่อนหน้าโผล่มาทั้งใบ
 *     รวมเลขพร้อมเพย์ ชื่อบัญชีรับโอน และลิงก์ไลฟ์ของเขา
 *     (กติกาฝั่งเซิร์ฟเวอร์กันการ "เขียน" ไว้อยู่แล้ว แต่กันการ "มองเห็น" ไม่ได้
 *      เพราะของรั่วมาจากเครื่องนี้เอง ไม่ได้มาจากคลาวด์)
 *
 * ตอนนี้ร่างอยู่ในหน่วยความจำของแท็บนั้นเท่านั้น: สลับหน้าไปมาในสตูดิโอแล้ว
 * งานที่แก้ค้างไว้ยังอยู่ · รีเฟรชหรือปิดแท็บแล้วหายไปตามที่ควรเป็น เพราะสิ่งที่
 * ยังไม่ได้กด "เผยแพร่" ก็คือสิ่งที่ยังไม่มีอยู่จริง · และไม่มีอะไรค้างในเครื่อง
 * ให้คนถัดไปที่มาล็อกอินเห็น
 */

/** คีย์รุ่นเก่าที่เคยเก็บร่างไว้ — ต้องล้างทิ้ง ไม่ใช่แค่เลิกใช้ */
const LEGACY_KEY_PREFIX = "tourney-hub/channel/v1";

/** uid ของคนที่ล็อกอินอยู่ — ผู้ใช้แบบไม่ระบุตัวตนไม่นับ ไม่มีช่องอยู่แล้ว */
function currentUid(): string | null {
  const u = authStore.user();
  return u && !u.anonymous ? u.uid : null;
}

/**
 * ร่างถูกผูกกับ "ช่องใบไหน" ไม่ใช่แค่ "บัญชีไหน"
 *
 * ★ นี่คือจุดที่เคยพาไปแก้ช่องผิดใบ ★
 * ของเดิมเก็บร่างใบเดียวต่อบัญชี แล้วหน้าตั้งค่าช่องเดาว่าใบนั้นคือ
 * "ช่องแรกของเรา" — ใครมีสองช่องขึ้นไป (หรือเป็นผู้ดูแลที่เข้าไปช่วยตั้งช่องคนอื่น)
 * จะกดจากการ์ดช่อง B แล้วไปโผล่ในร่างของช่อง A โดยไม่มีอะไรบอก
 *
 * ตอนนี้เก็บเป็นตารางตามรหัสช่อง สลับไปดูช่องอื่นแล้วกลับมา งานที่ค้างไว้ยังอยู่
 * และขอร่างของช่องไหน ก็ได้ของช่องนั้นเท่านั้น
 */
type Draft = { uid: string | null; data: Channel };

const drafts = new Map<string, Draft>();
/**
 * ตัวนับรุ่น — ใช้เป็น snapshot ให้ useSyncExternalStore แทนตัวข้อมูลเอง
 * เพราะข้อมูลจริงเป็น Map ที่ถูกแก้ในที่ ไม่ได้สร้างใหม่ทุกครั้ง
 * คนที่เรียกใช้อ่านของจริงต่อด้วย channelStore.draftFor(id)
 */
let version = 0;
const listeners = new Set<() => void>();

/**
 * ล้างของเก่าที่ค้างอยู่ในเครื่องทิ้งครั้งเดียว
 *
 * แค่เลิกเขียนไม่พอ — เครื่องที่เคยใช้รุ่นก่อนยังมีเลขพร้อมเพย์ของเจ้าของเดิม
 * นอนอยู่ใน localStorage ต่อไปเรื่อยๆ จนกว่าจะมีใครมาลบ
 */
let purged = false;
function purgeLegacy() {
  if (purged || typeof window === "undefined") return;
  purged = true;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_KEY_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* โหมดส่วนตัวของเบราว์เซอร์อ่านไม่ได้ ก็ไม่มีอะไรให้ลบอยู่แล้ว */
  }
}

function bump() {
  version += 1;
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
  /**
   * มีร่างที่แก้ค้างไว้ในแท็บนี้ *ของช่องใบนี้* แล้วหรือยัง
   * (ร่างอยู่ในหน่วยความจำล้วน ไม่ได้อยู่ในเครื่อง — ดูหัวไฟล์)
   */
  hasLocal: boolean;
  /**
   * ถ้าคลาวด์ไม่มีช่องใบนี้ ให้ปั้นโครงว่างขึ้นมาได้ไหม
   *
   * ได้เฉพาะตอนที่ปลายทางคือ "ช่องแรกของตัวเอง" ซึ่งใช้ uid เป็นชื่อเอกสาร
   * ถ้าเป็นรหัสช่องที่คลาวด์ไม่รู้จัก แปลว่าลิงก์ผิดหรือช่องถูกลบไปแล้ว —
   * ปั้นโครงว่างตรงนั้นคือการเปิดฟอร์มที่กด "เผยแพร่" แล้วสร้างช่องผีขึ้นมาใหม่
   */
  canCreate: boolean;
  /** รู้ผลจากคลาวด์แล้วหรือยัง */
  cloudLoaded: boolean;
  /** บนคลาวด์มีช่องนี้อยู่จริงไหม */
  cloudExists: boolean;
}): SeedChoice {
  if (!input.hasUser) return "wait";
  // ของที่แก้ค้างไว้ในแท็บนี้สำคัญกว่าเสมอ ห้ามเอาของคลาวด์มาทับงานที่ยังไม่ได้เผยแพร่
  if (input.hasLocal) return "keep-local";
  if (!input.cloudLoaded) return "wait";
  if (input.cloudExists) return "use-cloud";
  return input.canCreate ? "create-empty" : "wait";
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
  getSnapshot: () => version,
  getServerSnapshot: () => 0,

  /**
   * ร่างของช่องใบที่ระบุ — ใบอื่นหรือของบัญชีอื่นถือว่าไม่มี
   *
   * เช็ค uid ทุกครั้งเพราะเครื่องเดียวมีคนใช้หลายบัญชีได้ (สตรีมเมอร์ยืมโน้ตบุ๊กกัน
   * เป็นเรื่องปกติ) สลับบัญชีในแท็บเดิมแล้วร่างของคนก่อนหน้าต้องไม่โผล่มา
   */
  draftFor(channelId: string | null | undefined): Channel | null {
    if (typeof window === "undefined" || !channelId) return null;
    purgeLegacy();
    const hit = drafts.get(channelId);
    return hit && hit.uid === currentUid() ? hit.data : null;
  },

  set(channelId: string, next: Channel | null) {
    if (!next) {
      drafts.delete(channelId);
      bump();
      return;
    }
    drafts.set(channelId, {
      uid: currentUid(),
      data: { ...next, updatedAt: new Date().toISOString() },
    });
    bump();
  },

  update(channelId: string, patch: Partial<Channel>) {
    const current = channelStore.draftFor(channelId);
    if (!current) return;
    channelStore.set(channelId, { ...current, ...patch });
  },

  /** ทิ้งร่างทั้งหมด — ใช้ตอนล็อกเอาต์ */
  clear() {
    drafts.clear();
    bump();
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

/**
 * อัปโหลดช่องโดยเดาปลายทางจาก ownerUid
 *
 * @deprecated ห้ามใช้กับช่องที่อาจถูกโอนเจ้าของมา — มันเดาว่า "ชื่อเอกสาร = uid
 * เจ้าของ" ซึ่งจริงเฉพาะช่องแรกที่สร้างจากบัญชีนั้นเอง ช่องที่โอนมาหรือช่องที่สอง
 * จะถูกเขียนไปที่เอกสารใหม่ กลายเป็นช่องซ้ำโดยที่ลิงก์เดิมยังชี้ใบเก่า
 * ให้ใช้ pushChannelAs(channel, idของเอกสารที่กำลังแก้) แทนเสมอ
 */
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
 * ฟังเฉพาะช่องที่ตัวเองเป็นเจ้าของ — หน้าภาพรวมของสตูดิโอใช้
 *
 * ตั้งใจไม่ใช้ watchAllChannels แล้วมากรองในเครื่อง เพราะสตรีมเมอร์คนหนึ่ง
 * ไม่ควรต้องดาวน์โหลดช่องของทุกคนในระบบมาเพื่อดูช่องตัวเองสองสามช่อง
 * (กติกาเปิดอ่านสาธารณะอยู่แล้ว ทำได้ แต่เปลืองเน็ตของคนใช้ฟรีๆ)
 *
 * ไม่ใส่ orderBy ด้วยเหตุผลเดียวกับ watchAllChannels — เอกสารที่ไม่มีฟิลด์
 * ที่ใช้เรียงจะหายไปเงียบๆ โดยไม่มี error ให้จับ
 */
export function watchMyChannels(
  uid: string,
  onChange: (list: Channel[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db || !uid) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL), where("ownerUid", "==", uid)),
    (snap) => {
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
