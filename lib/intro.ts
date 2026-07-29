"use client";

/**
 * ส่งไม้ต่อจากหน้าปกอินโทรไปยังฮีโร่ของหน้าแรก
 * ต้องอยู่คนละไฟล์กับทั้งสองฝั่ง เพื่อไม่ให้ import วนกัน
 */

let done = false;
let willPlay: boolean | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const introStore = {
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
  // ต้องคืน primitive เดิมเสมอ ไม่งั้น useSyncExternalStore จะวนไม่จบ
  getSnapshot: () => done,
  getServerSnapshot: () => false,
  markDone() {
    if (done) return;
    done = true;
    emit();
  },
  /** IntroLoader เรียกครั้งเดียวตอน mount เพื่อบอกว่าจะเล่นอินโทรไหม */
  setWillPlay(v: boolean) {
    willPlay = v;
    if (!v) done = true;
    emit();
  },
  willPlay: () => willPlay,
};

/** ดีเลย์ฐานของฮีโร่: ถ้าอินโทรกำลังเล่นให้รอม่านเปิดก่อน */
export function heroDelay(base: number): number {
  return (done ? 0 : 0.85) + base;
}
