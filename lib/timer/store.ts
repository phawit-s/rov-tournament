"use client";

import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import {
  DEFAULT_TIMER,
  SLICE_LIMIT,
  clampScale,
  remainingAt,
  type StreamTimer,
  type WheelSlice,
} from "./types";

const COL = "channels";

/**
 * เขียนค่าตัวจับเวลาลงเอกสารช่องโดยตรง
 *
 * ใช้พาธแบบจุด (timer.remaining) ไม่ใช่ setDoc ทั้งก้อน — จะได้แตะเฉพาะฟิลด์นั้น
 * ไม่ไปทับพร้อมเพย์/แพ็กเกจ/คิวเพลงที่หน้าอื่นอาจเพิ่งแก้ไป
 *
 * ทุกตัวในไฟล์นี้มีผลทันที ไม่ต้องกด "เผยแพร่ช่อง" เหมือนค่าอื่น เพราะมันคือ
 * ปุ่มที่กดระหว่างไลฟ์ — กดหยุดแล้วต้องหยุดเดี๋ยวนั้น
 */
async function patch(channelId: string, value: Record<string, unknown>) {
  const db = getDb();
  if (!db || !channelId) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await updateDoc(doc(db, COL, channelId), {
    ...value,
    updatedAt: new Date().toISOString(),
  });
}

/** เติมค่าที่ขาดให้ครบ — ช่องเก่าไม่มีฟิลด์ timer เลย */
export function readTimer(raw: StreamTimer | undefined | null): StreamTimer {
  if (!raw) return DEFAULT_TIMER;
  return {
    ...DEFAULT_TIMER,
    ...raw,
    slices: raw.slices?.length ? raw.slices : DEFAULT_TIMER.slices,
  };
}

export function setTimerEnabled(channelId: string, enabled: boolean) {
  return patch(channelId, { "timer.enabled": enabled });
}

export function setTimerLabel(channelId: string, label: string) {
  return patch(channelId, { "timer.label": label.slice(0, 40) });
}

export function saveSlices(channelId: string, slices: WheelSlice[]) {
  return patch(channelId, { "timer.slices": slices.slice(0, SLICE_LIMIT) });
}

/**
 * หน้าตาของ widget (สี/ขนาด) — เก็บที่ช่อง จึงตั้งคนละแบบได้ทุกช่อง
 * และ source ที่วางไว้ใน OBS ทุกอันเปลี่ยนตามทันทีโดยไม่ต้องแก้ลิงก์
 */
export function setTimerStyle(
  channelId: string,
  style: { accent?: string; fontScale?: number; wheelScale?: number },
) {
  const value: Record<string, unknown> = {};
  if (style.accent !== undefined) {
    value["timer.accent"] = style.accent.replace("#", "").slice(0, 6);
  }
  if (style.fontScale !== undefined) {
    value["timer.fontScale"] = clampScale(style.fontScale, 0.6, 2.5);
  }
  if (style.wheelScale !== undefined) {
    value["timer.wheelScale"] = clampScale(style.wheelScale, 0.6, 2);
  }
  return patch(channelId, value);
}

/** กดเดิน — จับเวลาปัจจุบันไว้เป็นจุดตั้งต้น แล้วปล่อยให้ทุกจอนับเอง */
export function startTimer(channelId: string, timer: StreamTimer) {
  return patch(channelId, {
    "timer.remaining": Math.round(remainingAt(timer, Date.now())),
    "timer.startedAt": new Date().toISOString(),
  });
}

/** กดหยุด — บันทึกเวลาที่เหลือจริงไว้ แล้วล้างเวลาเริ่ม */
export function pauseTimer(channelId: string, timer: StreamTimer) {
  return patch(channelId, {
    "timer.remaining": Math.round(remainingAt(timer, Date.now())),
    "timer.startedAt": null,
  });
}

/** ตั้งเวลาใหม่ทั้งก้อน (หยุดนาฬิกาด้วย) */
export function setTimerSeconds(channelId: string, seconds: number) {
  return patch(channelId, {
    "timer.remaining": Math.max(0, Math.round(seconds)),
    "timer.startedAt": null,
  });
}

/**
 * บวก/ลบเวลา โดยที่นาฬิกาไม่สะดุด
 *
 * ต้องคิดเวลาที่เหลือจริง ณ ตอนกดก่อนเสมอ แล้วค่อยบวก — ถ้าเอา timer.remaining
 * (ค่าที่บันทึกไว้ตอนกดเริ่ม) มาบวกตรงๆ เวลาที่เดินไปแล้วทั้งหมดจะถูกคืนกลับมา
 * เช่นเดินไป 10 นาทีแล้วกด +1 นาที จะกลายเป็นเพิ่มขึ้น 11 นาที
 *
 * แล้วรีเซ็ต startedAt เป็นตอนนี้ด้วยถ้ายังเดินอยู่ เพราะจุดตั้งต้นเปลี่ยนไปแล้ว
 */
export function bumpTimer(channelId: string, timer: StreamTimer, delta: number) {
  const now = Date.now();
  const next = Math.max(0, Math.round(remainingAt(timer, now) + delta));
  return patch(channelId, {
    "timer.remaining": next,
    "timer.startedAt": timer.startedAt ? new Date(now).toISOString() : null,
  });
}

/**
 * บันทึกผลหมุนวงล้อ พร้อมบวกเวลาให้ในคำสั่งเดียว
 *
 * รวมเป็นการเขียนครั้งเดียวโดยตั้งใจ — ถ้าแยกเป็นสองครั้ง (บันทึกผล แล้วค่อยบวกเวลา)
 * จะมีจังหวะที่ widget เห็นผลหมุนแล้วแต่เวลายังไม่ขยับ ซึ่งบนสตรีมคือเห็นวงล้อ
 * หยุดที่ "+5 นาที" แต่นาฬิกาข้างๆ ยังเท่าเดิม แล้วค่อยกระตุกขึ้นทีหลัง
 */
export function recordSpin(
  channelId: string,
  timer: StreamTimer,
  slice: WheelSlice,
) {
  const now = Date.now();
  const next = Math.max(0, Math.round(remainingAt(timer, now) + slice.seconds));
  return patch(channelId, {
    "timer.remaining": next,
    "timer.startedAt": timer.startedAt ? new Date(now).toISOString() : null,
    "timer.lastSpin": {
      label: slice.label,
      seconds: slice.seconds,
      sliceId: slice.id,
      at: new Date(now).toISOString(),
    },
  });
}
