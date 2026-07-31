"use client";

/**
 * ล็อกว่า "ใครเป็นคนเล่นเพลงอยู่" ข้ามแท็บ
 *
 * ตัวเล่นถูกฝังไว้ทั้งในหน้าช่องและหน้า /player/ ถ้าเปิดค้างไว้พร้อมกัน
 * สองที่จะเล่นคลิปเดียวกันคนละจังหวะ = เสียงซ้อนกันออกไลฟ์
 * และพอเพลงจบทั้งคู่จะเดินคิวพร้อมกัน ทำให้เพลงถัดไปโดนข้ามทิ้ง
 *
 * กลไก: เจ้าของล็อกเขียนชื่อตัวเองลง localStorage แล้วต่ออายุทุก 2 วินาที
 * ใครมาทีหลังเห็นว่ายังสดอยู่ก็ถอยเป็นผู้ชม จนกว่าเจ้าของจะหายไปเกิน 6 วินาที
 * (ปิดแท็บดื้อๆ ก็หลุดเอง ไม่ต้องพึ่ง cleanup ที่อาจไม่ได้รัน)
 *
 * ตั้งใจใช้ localStorage ไม่ใช่ BroadcastChannel เพราะ event ของ storage
 * ยิงข้ามแท็บให้ฟรี และค่าที่ค้างอยู่ยังอ่านได้ตอนแท็บใหม่เพิ่งเปิด
 */

const KEY = "tourney-hub/song/player-lock";
const ID_KEY = "tourney-hub/song/player-id";
const BEAT_MS = 2000;
const STALE_MS = 6000;

export type LockState = "leader" | "follower";

/** ตัวคุมล็อกที่คืนให้ผู้เรียก — แย่งสิทธิ์ต้องผ่านตัวนี้เท่านั้น */
export type LockHandle = {
  stop: () => void;
  /** ย้ายสิทธิ์มาที่หน้านี้ทันที แล้วแจ้ง onChange ให้ตรงกับความจริง */
  takeOver: () => void;
};

type Entry = { id: string; at: number };

/**
 * ชื่อประจำแท็บ — เก็บใน sessionStorage เพราะมันอยู่แค่ในแท็บนั้นและรอดการรีเฟรช
 *
 * ถ้าสุ่มใหม่ทุกครั้งที่ mount พอกด F5 แท็บเดิมจะไม่รู้จักล็อกที่ตัวเองเพิ่งเขียนไว้
 * แล้วนึกว่ามีหน้าต่างอื่นเล่นอยู่ ต้องรอ 6 วินาทีให้หมดอายุก่อนถึงจะเล่นต่อได้
 */
export function playerInstanceId(): string {
  const made = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  try {
    const found = sessionStorage.getItem(ID_KEY);
    if (found) return found;
    sessionStorage.setItem(ID_KEY, made);
  } catch {
    /* เขียนไม่ได้ก็ใช้ชื่อสุ่มไปรอบนี้ อย่างมากคือรีเฟรชแล้วรอ 6 วิ */
  }
  return made;
}

function read(): Entry | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Entry;
    return typeof value?.id === "string" && typeof value?.at === "number"
      ? value
      : null;
  } catch {
    return null;
  }
}

function write(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* โหมดส่วนตัวเขียนไม่ได้ — ปล่อยให้ทุกแท็บเป็นเจ้าของไปเลย ดีกว่าเล่นไม่ได้ */
  }
}

/** ล็อกว่างหรือเป็นของเราอยู่แล้วไหม */
function mine(id: string): boolean {
  const cur = read();
  return !cur || cur.id === id || Date.now() - cur.at > STALE_MS;
}

/**
 * ขอเป็นคนเล่น — คืนตัวคุมไว้ให้เลิกจองหรือแย่งสิทธิ์
 *
 * onChange ถูกเรียกครั้งแรกแบบไม่ซิงโครนัส ผู้เรียกจะได้ setState ได้
 * โดยไม่ชนกฎที่ห้าม setState ระหว่างตัว effect กำลังรัน
 *
 * การแย่งสิทธิ์ต้องเรียกผ่าน takeOver ของตัวคุมนี้เท่านั้น ห้ามให้ผู้เรียก
 * ไปตั้งสถานะเองข้างนอก — ตัวแปร current ในนี้กันการแจ้งซ้ำอยู่ ถ้าข้างนอก
 * เปลี่ยนสถานะโดยที่ในนี้ไม่รู้ ค่าจะเพี้ยนกันจนการกลับไปเป็นผู้ชมถูกกลืนหาย
 * แล้วจะมีสองแท็บคิดว่าตัวเองเป็นคนเล่นพร้อมกัน = เสียงซ้อนออกไลฟ์
 */
export function claimPlayerLock(
  id: string,
  onChange: (state: LockState) => void,
): LockHandle {
  if (typeof window === "undefined") {
    return { stop: () => {}, takeOver: () => {} };
  }

  let current: LockState | null = null;
  let timer = 0;

  const tick = () => {
    const next: LockState = mine(id) ? "leader" : "follower";
    if (next === "leader") write(id);
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) tick();
  };

  timer = window.setTimeout(function beat() {
    tick();
    timer = window.setTimeout(beat, BEAT_MS);
  }, 0);
  window.addEventListener("storage", onStorage);

  return {
    takeOver: () => {
      write(id);
      tick();
    },
    stop: () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      // คืนล็อกเฉพาะตอนที่ยังเป็นของเรา จะได้ไม่ไปลบของแท็บที่แย่งไปแล้ว
      if (read()?.id === id) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ไม่เป็นไร เดี๋ยวมันหมดอายุเอง */
        }
      }
    },
  };
}
