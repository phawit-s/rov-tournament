"use client";

import { adminClaimStore, type AdminState } from "./backend/admin";
import { hasBackend } from "./backend/config";

/**
 * สิทธิ์ผู้จัด — มีสองระดับ ต่างกันตรงที่ "ใครเป็นคนตัดสิน"
 *
 *  verified : Firestore ยืนยันว่ามีเอกสาร admins/{uid} อยู่จริง
 *             กติกาถูกบังคับบนเครื่อง Google ปลอมไม่ได้ และคำสั่งที่แตะข้อมูล
 *             บนคลาวด์จะผ่านจริงเฉพาะระดับนี้
 *
 *  local    : ใส่รหัสผู้จัดถูกในเครื่องนี้ เปิดได้แค่หน้าจอกับเครื่องมือที่ทำงาน
 *             ในเบราว์เซอร์ล้วน (สุ่มทีม วงล้อ widget ประวัติ ทัวร์ที่ยังไม่เผยแพร่)
 *             ข้อมูลบนคลาวด์ยังถูกปฏิเสธเหมือนเดิม
 *
 * ที่ต้องยอมรับ: หน้าเว็บเป็นไฟล์ static คนที่เปิด devtools เป็นก็บังคับให้เมนู
 * โผล่ได้เสมอ ไม่ว่าจะล็อกยังไง สิ่งที่กันได้จริงคือ "ข้อมูล" ซึ่งอยู่ใต้
 * firestore.rules ไม่ใช่ "หน้าจอ"
 */

export type Access = "none" | "local" | "verified";

const KEY = "tourney-hub/admin";

/** เปลี่ยนรหัสได้โดยไม่ต้องแก้โค้ด ผ่าน NEXT_PUBLIC_ADMIN_PIN_HASH ตอน build */
const FALLBACK_HASH =
  "9a584c93210948b37883210caafc2b0bdd952d8ed889b95f8c01f047c8299c68";
const HASH = (
  process.env.NEXT_PUBLIC_ADMIN_PIN_HASH || FALLBACK_HASH
).toLowerCase();

let cache: boolean | null = null;
const listeners = new Set<() => void>();

function readLocal(): boolean {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return false;
  try {
    cache = localStorage.getItem(KEY) === "1";
  } catch {
    cache = false;
  }
  return cache;
}

function writeLocal(value: boolean) {
  cache = value;
  try {
    if (value) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* โหมดส่วนตัวของเบราว์เซอร์เขียนไม่ได้ ก็ปล่อยให้ปลดล็อกแค่รอบนี้ */
  }
  emit();
}

function emit() {
  listeners.forEach((l) => l());
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------- สถานะรวมของทั้งสองแหล่ง ---------- */

let claim: AdminState = hasBackend ? "loading" : "no-backend";
let access: Access = "none";

function recompute() {
  const next: Access =
    claim === "admin" ? "verified" : readLocal() ? "local" : "none";
  if (next !== access) {
    access = next;
    return true;
  }
  return false;
}

export const gateStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    const stopClaim = adminClaimStore.subscribe(() => {
      claim = adminClaimStore.status();
      recompute();
      emit();
    });
    claim = adminClaimStore.status();
    recompute();
    return () => {
      listeners.delete(onChange);
      stopClaim();
    };
  },
  // ต้องคืนค่าเดิมเสมอถ้าไม่มีอะไรเปลี่ยน ไม่งั้น useSyncExternalStore วนไม่จบ
  getSnapshot: (): Access => {
    recompute();
    return access;
  },
  getServerSnapshot: (): Access => "none",

  /** สถานะดิบของฝั่ง Firebase เอาไว้เลือกข้อความในหน้าล็อก */
  claim: () => claim,

  isAdmin: () => gateStore.getSnapshot() !== "none",

  /** เทียบรหัสแบบ hash — เรียกจาก event handler เท่านั้นเพราะเป็น async */
  async tryUnlock(input: string): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed) return false;
    try {
      const ok = (await sha256(trimmed)) === HASH;
      if (ok) writeLocal(true);
      return ok;
    } catch {
      // crypto.subtle ใช้ได้เฉพาะ https กับ localhost
      return false;
    }
  },

  /** ปลดเฉพาะรหัสในเครื่อง สิทธิ์ที่ Firestore ยืนยันต้องออกด้วยการล็อกเอาต์ */
  lock() {
    writeLocal(false);
  },
};

/**
 * หน้าที่ผู้ชมทั่วไปเปิดได้ — งานของสตรีมเมอร์ทั้งหมดอยู่ใต้ /studio/ ซึ่งมีด่าน
 * ของตัวเองอยู่แล้ว รายการนี้จึงเป็น "หน้าบ้าน" ทั้งหมดที่มี
 */
export const PUBLIC_PATHS = [
  "/",
  "/draw",
  "/wheel",
  "/tournament",
  "/c",
  "/song",
  "/songs",
  "/account",
];

export function isPublicPath(pathname: string | null): boolean {
  const clean = (pathname ?? "/").replace(/\/+$/, "") || "/";
  return PUBLIC_PATHS.includes(clean);
}
