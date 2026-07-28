"use client";

/**
 * โหมดผู้จัด — กันมือลั่นเฉยๆ ไม่ใช่ระบบความปลอดภัยจริง
 * เว็บนี้เป็น static ล้วน ไม่มีเซิร์ฟเวอร์ ใครเปิด devtools ก็เห็นข้อมูลทั้งหมด
 * ถ้าต้องการแยกสิทธิ์จริงต้องมี backend
 */

const KEY = "rov-randomizer/admin-unlocked";

let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

function read(): Set<string> {
  if (cache) return cache;
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...read()]));
  } catch {
    /* ไม่ซีเรียส */
  }
  listeners.forEach((l) => l());
}

let snapshot = "";
function computeSnapshot() {
  snapshot = [...read()].sort().join(",");
  return snapshot;
}

export const adminStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  /** คืนสตริงเดิมถ้าไม่มีอะไรเปลี่ยน เพื่อไม่ให้ React รีเรนเดอร์วน */
  getSnapshot: () => {
    const next = [...read()].sort().join(",");
    if (next !== snapshot) snapshot = next;
    return snapshot;
  },
  getServerSnapshot: () => "",

  isUnlocked(tournamentId: string, pin?: string) {
    // ยังไม่ตั้ง PIN = เปิดให้แก้ได้เลย
    if (!pin) return true;
    return read().has(tournamentId);
  },

  tryUnlock(tournamentId: string, pin: string, input: string): boolean {
    if (input !== pin) return false;
    read().add(tournamentId);
    persist();
    return true;
  },

  lock(tournamentId: string) {
    read().delete(tournamentId);
    persist();
  },
};

export { computeSnapshot };
