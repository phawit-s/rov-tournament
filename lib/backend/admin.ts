"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { authStore, getDb, hasBackend } from "./firebase";

/**
 * สิทธิ์ผู้ดูแลที่ตรวจจากฝั่งเซิร์ฟเวอร์จริง
 *
 * วิธีเช็คคือ "ลองขออ่านรายชื่อผู้ดูแลทั้งคอลเลกชัน" ถ้ากติกาอนุญาต = เป็นผู้ดูแล
 * ที่ใช้วิธีนี้แทนการอ่านเอกสารของตัวเอง เพราะเจ้าของเว็บ (อีเมลใน ownerEmails
 * ของ firestore.rules) เป็นผู้ดูแลตั้งแต่ publish กติกา โดยยังไม่มีเอกสารสิทธิ์
 * ของตัวเองเลย — ถ้าไปเช็คเอกสารจะกลายเป็นไก่กับไข่
 *
 * กติกาอยู่ใน firestore.rules ซึ่งรันบนเครื่อง Google ไม่ใช่ในเบราว์เซอร์
 * จึงปลอมไม่ได้ ข้อจำกัดที่ยังเหลือ: หน้าเว็บเป็นไฟล์ static ใครเปิด devtools
 * ก็ยังบังคับให้เมนูโผล่ได้ แต่ทุกคำสั่งที่แตะข้อมูลบนคลาวด์จะถูกปฏิเสธอยู่ดี
 */

export type AdminState = "loading" | "no-backend" | "signed-out" | "denied" | "admin";

export type AdminEntry = {
  uid: string;
  label: string;
  addedAt?: string;
};

let state: AdminState = hasBackend ? "loading" : "no-backend";
let roster: AdminEntry[] = [];
const EMPTY: AdminEntry[] = [];
let watchedUid: string | null = null;
let unsubList: Unsubscribe | null = null;
const listeners = new Set<() => void>();

/*
  snapshot ต้องมีทั้งสถานะและรายชื่ออยู่ในสตริงเดียว
  ถ้าคืนแค่สถานะ พอรายชื่อเปลี่ยนแต่สถานะยังเป็น "admin" เหมือนเดิม
  useSyncExternalStore จะถือว่าไม่มีอะไรเปลี่ยนแล้วไม่รีเรนเดอร์
*/
let snapshot: string = state;

function refresh(next: AdminState) {
  state = next;
  const value =
    next === "admin" ? `admin:${roster.map((r) => r.uid).join(",")}` : next;
  if (value === snapshot) return;
  snapshot = value;
  listeners.forEach((l) => l());
}

function stopList() {
  unsubList?.();
  unsubList = null;
  watchedUid = null;
  roster = EMPTY;
}

/** ตามผู้ใช้ปัจจุบัน แล้วลองขออ่านรายชื่อผู้ดูแล */
function syncWithAuth() {
  const user = authStore.user();

  if (!user || user.anonymous) {
    stopList();
    refresh(authStore.ready() ? "signed-out" : "loading");
    return;
  }

  if (watchedUid === user.uid) return;

  stopList();
  const db = getDb();
  if (!db) {
    refresh("no-backend");
    return;
  }

  watchedUid = user.uid;
  refresh("loading");
  unsubList = onSnapshot(
    collection(db, "admins"),
    (snap) => {
      // เช็ค uid ซ้ำอีกที เผื่อสลับบัญชีระหว่างที่ผลลัพธ์กำลังเดินทางกลับมา
      if (watchedUid !== user.uid) return;
      roster = snap.docs.map((d) => {
        const data = d.data() as { label?: string; email?: string; addedAt?: string };
        return {
          uid: d.id,
          label: data.label ?? data.email ?? d.id,
          addedAt: data.addedAt,
        };
      });
      refresh("admin");
    },
    // กติกาปฏิเสธ = ไม่ใช่ผู้ดูแล ไม่ใช่ข้อผิดพลาดที่ต้องแจ้งผู้ใช้
    () => {
      if (watchedUid !== user.uid) return;
      roster = EMPTY;
      refresh("denied");
    },
  );
}

let started = false;
let unsubAuth: (() => void) | null = null;

export const adminClaimStore = {
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
        unsubAuth = null;
        stopList();
        started = false;
      }
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => (hasBackend ? "loading" : "no-backend"),

  /** สถานะล้วนๆ ไม่รวมรายชื่อ */
  status: (): AdminState => state,

  /** รายชื่อผู้ดูแลที่เพิ่มไว้ (เจ้าของเว็บอยู่ในกติกา ไม่อยู่ในรายการนี้) */
  roster: () => roster,

  async addAdmin(uid: string, label: string) {
    const db = getDb();
    if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    const clean = uid.trim();
    if (!clean) throw new Error("ต้องใส่รหัสผู้ใช้");
    await setDoc(doc(db, "admins", clean), {
      label: label.trim() || clean,
      addedAt: new Date().toISOString(),
    });
  },

  async removeAdmin(uid: string) {
    const db = getDb();
    if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
    await deleteDoc(doc(db, "admins", uid));
  },
};
