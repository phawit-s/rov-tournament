"use client";

/**
 * โหมดผู้จัด — ล็อกเมนูและหน้าหลังบ้านไว้ด้วยรหัสผ่านหนึ่งชุด
 *
 * ข้อจำกัดที่ต้องรู้: เว็บนี้เป็น static ล้วน ไม่มีเซิร์ฟเวอร์ตรวจรหัสให้
 * รหัสจึงถูกเทียบด้วย SHA-256 ฝั่งเบราว์เซอร์ ตัวรหัสจริงไม่ได้อยู่ในไฟล์ JS
 * แต่คนที่รู้วิธีก็ยังตั้ง localStorage เองเพื่อข้ามได้
 *
 * ของจริงที่กันข้อมูลคือ Firebase Auth กับ firestore.rules ที่บังคับว่า
 * ต้องเป็นเจ้าของหรือทีมงานถึงจะเขียนข้อมูลทัวร์บนคลาวด์ได้
 * ชั้นนี้มีไว้เพื่อ "ผู้ชมทั่วไปเห็นแค่ที่ควรเห็น" ไม่ใช่กันคนตั้งใจเจาะ
 */

const KEY = "tourney-hub/admin";

/** เปลี่ยนรหัสได้โดยไม่ต้องแก้โค้ด ผ่าน NEXT_PUBLIC_ADMIN_PIN_HASH ตอน build */
const FALLBACK_HASH =
  "9a584c93210948b37883210caafc2b0bdd952d8ed889b95f8c01f047c8299c68";
const HASH = (
  process.env.NEXT_PUBLIC_ADMIN_PIN_HASH || FALLBACK_HASH
).toLowerCase();

let cache: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return false;
  try {
    cache = localStorage.getItem(KEY) === "1";
  } catch {
    cache = false;
  }
  return cache;
}

function write(value: boolean) {
  cache = value;
  try {
    if (value) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* โหมดส่วนตัวของเบราว์เซอร์เขียนไม่ได้ ก็ปล่อยให้ปลดล็อกแค่รอบนี้ */
  }
  listeners.forEach((l) => l());
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const gateStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  // ต้องคืน boolean ตัวเดิมเสมอ ไม่งั้น useSyncExternalStore จะวนไม่จบ
  getSnapshot: () => read(),
  getServerSnapshot: () => false,

  isAdmin: () => read(),

  /** เทียบรหัสแบบ hash — เรียกจาก event handler เท่านั้นเพราะเป็น async */
  async tryUnlock(input: string): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed) return false;
    try {
      const ok = (await sha256(trimmed)) === HASH;
      if (ok) write(true);
      return ok;
    } catch {
      // crypto.subtle ใช้ได้เฉพาะ https กับ localhost
      return false;
    }
  },

  lock() {
    write(false);
  },
};

/** หน้าที่ผู้ชมทั่วไปเปิดได้ นอกจากนี้ต้องปลดล็อกก่อน */
export const PUBLIC_PATHS = ["/", "/draw", "/wheel", "/tournament", "/c"];

export function isPublicPath(pathname: string | null): boolean {
  const clean = (pathname ?? "/").replace(/\/+$/, "") || "/";
  return PUBLIC_PATHS.includes(clean);
}
