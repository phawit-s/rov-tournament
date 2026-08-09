"use client";

import { uid } from "./random";

export type ActivityType =
  | "tournament.create"
  | "tournament.update"
  | "tournament.delete"
  | "tournament.publish"
  | "bracket.generate"
  | "match.score"
  | "team.add"
  | "team.remove"
  | "registration.approve"
  | "registration.reject"
  | "donation.approve"
  | "donation.reject"
  | "member.approve"
  | "draw.finish"
  | "wheel.spin"
  | "song.play"
  | "song.skip"
  | "auth.signin"
  | "auth.signout";

export type ActivityEntry = {
  id: string;
  at: string;
  type: ActivityType;
  message: string;
  tournamentId?: string;
  tournamentName?: string;
  actor?: string;
};

const KEY = "tourney-hub/activity/v1";
const MAX = 300;

let cache: ActivityEntry[] | null = null;
const EMPTY: ActivityEntry[] = [];
const listeners = new Set<() => void>();

function read(): ActivityEntry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function commit(next: ActivityEntry[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* เต็มก็ปล่อย ไม่ใช่ข้อมูลสำคัญ */
  }
  listeners.forEach((l) => l());
}

/**
 * บันทึกกิจกรรม — เก็บในเครื่องนี้เท่านั้น
 * ถ้าอยากให้แอดมินหลายคนเห็น log ร่วมกันต้องย้ายขึ้นคลาวด์
 */
export function recordActivity(
  type: ActivityType,
  message: string,
  meta?: { tournamentId?: string; tournamentName?: string; actor?: string },
) {
  if (typeof window === "undefined") return;
  const entry: ActivityEntry = {
    id: uid(),
    at: new Date().toISOString(),
    type,
    message,
    ...meta,
  };
  commit([entry, ...read()].slice(0, MAX));
}

export const activityStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: () => read(),
  getServerSnapshot: () => EMPTY,
  clear: () => commit([]),
};

export const ACTIVITY_META: Record<
  ActivityType,
  { label: string; glyph: string; rgb: string }
> = {
  "tournament.create": { label: "สร้างทัวร์", glyph: "◆", rgb: "110 155 240" },
  "tournament.update": { label: "แก้ข้อมูลทัวร์", glyph: "◇", rgb: "138 142 168" },
  "tournament.delete": { label: "ลบทัวร์", glyph: "✕", rgb: "224 96 112" },
  "tournament.publish": { label: "เผยแพร่ขึ้นคลาวด์", glyph: "▲", rgb: "52 227 176" },
  "bracket.generate": { label: "สุ่มสายแข่ง", glyph: "❖", rgb: "196 130 255" },
  "match.score": { label: "กรอกผลแมตช์", glyph: "●", rgb: "169 155 255" },
  "team.add": { label: "เพิ่มทีม", glyph: "＋", rgb: "52 227 176" },
  "team.remove": { label: "ลบทีม", glyph: "－", rgb: "224 96 112" },
  "registration.approve": { label: "อนุมัติใบสมัคร", glyph: "✓", rgb: "52 227 176" },
  "registration.reject": { label: "ปฏิเสธใบสมัคร", glyph: "✕", rgb: "224 96 112" },
  "donation.approve": { label: "อนุมัติโดเนท", glyph: "★", rgb: "169 155 255" },
  "donation.reject": { label: "ปฏิเสธโดเนท", glyph: "✕", rgb: "224 96 112" },
  "member.approve": { label: "รับสมาชิกใหม่", glyph: "✦", rgb: "196 130 255" },
  "draw.finish": { label: "สุ่มแบ่งทีมเสร็จ", glyph: "◈", rgb: "110 155 240" },
  "wheel.spin": { label: "หมุนวงล้อ", glyph: "◐", rgb: "104 184 197" },
  "song.play": { label: "เปิดเพลง", glyph: "▶", rgb: "196 130 255" },
  "song.skip": { label: "ข้ามเพลง", glyph: "⤳", rgb: "126 130 153" },
  "auth.signin": { label: "เข้าสู่ระบบ", glyph: "→", rgb: "138 142 168" },
  "auth.signout": { label: "ออกจากระบบ", glyph: "←", rgb: "138 142 168" },
};
