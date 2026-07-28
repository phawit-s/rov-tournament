/**
 * สุ่มแบบ deterministic จาก seed
 * ใส่ seed เดิม + รายชื่อเดิม -> ผลลัพธ์เดิมเสมอ ตรวจสอบย้อนหลังได้
 */

/** แปลงสตริงเป็นเลข 32-bit สำหรับป้อน PRNG */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** PRNG เล็กเร็ว คุณภาพพอสำหรับงานสุ่มทีม */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}

const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** seed สุ่มใหม่ อ่านง่าย ไม่มีตัวอักษรกำกวม */
export function makeSeed(length = 8): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SEED_ALPHABET[bytes[i] % SEED_ALPHABET.length];
    if (i === 3 && length > 4) out += "-";
  }
  return out;
}

/** Fisher–Yates ไม่แก้ไข array ต้นฉบับ */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rand: () => number = Math.random): T {
  return items[Math.floor(rand() * items.length)];
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}
