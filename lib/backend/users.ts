"use client";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { authStore, getDb, hasBackend } from "./firebase";

/**
 * โปรไฟล์ผู้ใช้ — หนึ่งบัญชีหนึ่งเอกสาร
 *
 * มีไว้เพื่อสองอย่างที่เดิมทำไม่ได้
 *  1. เลือกคนจากรายชื่อตอนเพิ่มทีมงาน/ผู้ดูแล แทนการก๊อป uid มาวาง
 *  2. ผูกใบสมัครแข่งกับบัญชีจริง จะได้รู้ว่าใครสมัคร ติดต่อกลับได้
 *
 * เอกสารถูกเขียนโดยเจ้าของบัญชีเองเท่านั้น (กติกาบังคับ uid ให้ตรง)
 * ส่วนการดึงรายชื่อทั้งหมดเปิดให้เฉพาะผู้ดูแล ไม่งั้นใครก็กวาดอีเมลทุกคนไปได้
 */

const COL = "users";

export type UserProfile = {
  uid: string;
  email: string | null;
  name: string;
  photo: string | null;
  /** ชื่อในเกม/ชื่อที่อยากให้คนอื่นเห็น */
  gameName?: string;
  /** ไลน์ / เบอร์ / ดิสคอร์ด ไว้ให้ผู้จัดติดต่อกลับ */
  contact?: string;
  createdAt: string;
  updatedAt: string;
};

/** โปรไฟล์ที่ยังไม่ได้กรอกชื่อในเกม ถือว่ายังสมัครไม่เสร็จ */
export function isComplete(p: UserProfile | null): boolean {
  return !!p && !!p.gameName?.trim();
}

/* ---------------- โปรไฟล์ของตัวเอง ---------------- */

let mine: UserProfile | null = null;
let mineState: "loading" | "none" | "ready" = hasBackend ? "loading" : "none";
let snapshot = "loading";
const listeners = new Set<() => void>();
let unsubDoc: Unsubscribe | null = null;
let unsubAuth: (() => void) | null = null;
let watchedUid: string | null = null;

function emit() {
  // รวมสถานะกับค่าที่เปลี่ยนไว้ในสตริงเดียว ไม่งั้นแก้ชื่อแล้วหน้าจอไม่รีเรนเดอร์
  const next = `${mineState}:${mine?.gameName ?? ""}:${mine?.contact ?? ""}`;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

/**
 * สร้างเอกสารโปรไฟล์ให้อัตโนมัติตอนล็อกอินครั้งแรก
 * merge เพื่อไม่ให้ทับ gameName/contact ที่ผู้ใช้กรอกไว้เอง
 */
async function ensureProfile() {
  const db = getDb();
  const u = authStore.user();
  if (!db || !u || u.anonymous) return;
  const now = new Date().toISOString();
  await setDoc(
    doc(db, COL, u.uid),
    {
      uid: u.uid,
      email: u.email ?? null,
      name: u.name,
      photo: u.photo ?? null,
      updatedAt: now,
      // createdAt เขียนทับไม่ได้เพราะ merge จะเก็บของเดิมไว้ถ้ามีอยู่แล้ว
      createdAt: now,
    },
    { merge: true },
  );
}

function syncWithAuth() {
  const u = authStore.user();
  const db = getDb();

  if (!u || u.anonymous || !db) {
    unsubDoc?.();
    unsubDoc = null;
    watchedUid = null;
    mine = null;
    mineState = authStore.ready() ? "none" : "loading";
    emit();
    return;
  }

  if (watchedUid === u.uid) return;
  unsubDoc?.();
  watchedUid = u.uid;
  mineState = "loading";
  emit();

  unsubDoc = onSnapshot(
    doc(db, COL, u.uid),
    (snap) => {
      if (watchedUid !== u.uid) return;
      if (snap.exists()) {
        mine = snap.data() as UserProfile;
        mineState = "ready";
        emit();
      } else {
        // ยังไม่มีเอกสาร — สร้างให้แล้ว onSnapshot จะยิงกลับมาเอง
        mine = null;
        mineState = "ready";
        emit();
        void ensureProfile();
      }
    },
    () => {
      mine = null;
      mineState = "none";
      emit();
    },
  );
}

let started = false;

export const profileStore = {
  subscribe(onChange: () => void) {
    if (!started) {
      started = true;
      if (hasBackend) {
        unsubAuth = authStore.subscribe(syncWithAuth);
        syncWithAuth();
      }
    }
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        unsubAuth?.();
        unsubDoc?.();
        unsubAuth = null;
        unsubDoc = null;
        watchedUid = null;
        started = false;
      }
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => "loading",

  profile: () => mine,
  state: () => mineState,

  /** กรอกโปรไฟล์ให้ครบ — เรียกจากฟอร์ม */
  async save(patch: { gameName?: string; contact?: string }) {
    const db = getDb();
    const u = authStore.user();
    if (!db || !u || u.anonymous) throw new Error("ต้องล็อกอินก่อน");
    await setDoc(
      doc(db, COL, u.uid),
      {
        uid: u.uid,
        email: u.email ?? null,
        name: u.name,
        photo: u.photo ?? null,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  },
};

/* ---------------- รายชื่อผู้ใช้ (เฉพาะผู้ดูแล) ---------------- */

const NO_USERS: UserProfile[] = [];

/**
 * ฟังรายชื่อผู้ใช้ทั้งหมด — ใช้ในตัวเลือกตอนเพิ่มทีมงาน/ผู้ดูแล
 * กติกาเปิด list ให้เฉพาะผู้ดูแล คนอื่นเรียกแล้วจะโดนปฏิเสธและได้รายการว่าง
 */
export function watchUsers(
  onChange: (list: UserProfile[]) => void,
  onError?: () => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange(NO_USERS);
    return () => {};
  }
  return onSnapshot(
    collection(db, COL),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as UserProfile);
      list.sort((a, b) =>
        (a.gameName || a.name || "").localeCompare(b.gameName || b.name || ""),
      );
      onChange(list);
    },
    () => {
      onChange(NO_USERS);
      onError?.();
    },
  );
}

/** ดึงโปรไฟล์คนเดียวจาก uid — ใช้โชว์ชื่อแทนรหัสยาวๆ */
export async function getProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, COL, uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch {
    return null;
  }
}
