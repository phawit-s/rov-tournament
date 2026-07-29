"use client";

import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { authStore, getDb, hasBackend } from "./firebase";

/**
 * สิทธิ์ผู้ดูแลที่ตรวจจากฝั่งเซิร์ฟเวอร์จริง
 *
 * เอกสาร admins/{uid} มีอยู่ = เป็นผู้ดูแล ตัวกติกาอยู่ใน firestore.rules
 * ซึ่งรันบนเครื่อง Google ไม่ใช่ในเบราว์เซอร์ ปลอมไม่ได้
 *  - อ่านเอกสารของคนอื่นไม่ได้
 *  - สร้างเอกสารให้ตัวเองไม่ได้ถ้ายังไม่ได้เป็นผู้ดูแลอยู่ก่อน
 *
 * ข้อจำกัดที่ยังเหลือ: หน้าเว็บเป็นไฟล์ static ใครเปิด devtools ก็ยังบังคับให้
 * เมนูโผล่ได้ แต่ทุกคำสั่งที่แตะข้อมูลบนคลาวด์จะถูกปฏิเสธอยู่ดี
 */

export type AdminState = "loading" | "no-backend" | "signed-out" | "denied" | "admin";

let state: AdminState = hasBackend ? "loading" : "no-backend";
let watchedUid: string | null = null;
let unsubDoc: Unsubscribe | null = null;
const listeners = new Set<() => void>();

function set(next: AdminState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function stopDoc() {
  unsubDoc?.();
  unsubDoc = null;
  watchedUid = null;
}

/** ตามผู้ใช้ปัจจุบัน แล้วเฝ้าเอกสารสิทธิ์ของ uid นั้น */
function syncWithAuth() {
  const user = authStore.user();

  if (!user || user.anonymous) {
    stopDoc();
    set(authStore.ready() ? "signed-out" : "loading");
    return;
  }

  if (watchedUid === user.uid) return;

  stopDoc();
  const db = getDb();
  if (!db) {
    set("no-backend");
    return;
  }

  watchedUid = user.uid;
  set("loading");
  unsubDoc = onSnapshot(
    doc(db, "admins", user.uid),
    (snap) => {
      // เช็ค uid ซ้ำอีกที เผื่อสลับบัญชีระหว่างที่ผลลัพธ์กำลังเดินทางกลับมา
      if (watchedUid !== user.uid) return;
      set(snap.exists() ? "admin" : "denied");
    },
    // กติกาปฏิเสธ = ไม่ใช่ผู้ดูแล ไม่ใช่ข้อผิดพลาดที่ต้องแจ้งผู้ใช้
    () => set("denied"),
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
        stopDoc();
        started = false;
      }
    };
  },
  getSnapshot: () => state,
  getServerSnapshot: (): AdminState => (hasBackend ? "loading" : "no-backend"),
};
