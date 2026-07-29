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

/** อัปโหลดช่องขึ้นคลาวด์ (public read) */
export async function pushChannel(channel: Channel): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const slim: Channel = { ...channel };
  // รูปใหญ่เกินโควตา doc ก็ตัดทิ้ง
  if (slim.cover && slim.cover.length > 500_000) delete slim.cover;
  await setDoc(
    doc(db, COL, channel.ownerUid),
    { ...slim, isPublic: true, syncedAt: serverTimestamp() },
    { merge: true },
  );
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

/** หาช่องจาก handle (ใช้ตอนเปิดลิงก์ /c/#h=affarain) */
export async function findChannelByHandle(handle: string): Promise<Channel | null> {
  const db = getDb();
  if (!db || !handle) return null;
  const snap = await getDocs(
    query(collection(db, COL), where("handle", "==", handle.toLowerCase()), limit(1)),
  );
  return snap.empty ? null : (snap.docs[0].data() as Channel);
}
