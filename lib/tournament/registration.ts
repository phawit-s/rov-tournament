"use client";

import type { SoloEntry, TeamEntry, Tournament } from "./types";

/**
 * ใบที่ผูกกับบัญชีจะมี uid ติดมาด้วย
 * เก็บเป็นฟิลด์เสริมบนโครงเดิม ใบเก่าก่อนมีระบบบัญชีจึงยังใช้ได้เหมือนเดิม
 */
export type AccountBound = { uid?: string };

/** อ่าน uid ของเจ้าของใบแบบไม่พังกับใบเก่าที่ไม่มีฟิลด์นี้ */
export function entryUid(entry: TeamEntry | SoloEntry): string | null {
  const value = (entry as { uid?: unknown }).uid;
  return typeof value === "string" && value.trim() ? value : null;
}

export type MyEntry =
  | { kind: "team"; entry: TeamEntry & AccountBound }
  | { kind: "solo"; entry: SoloEntry & AccountBound };

/** หาใบที่ผู้ใช้คนนี้สมัครไว้แล้วในรายชื่อที่ผู้จัดรับเข้าไปแล้ว */
export function findMyEntry(
  tournament: Tournament,
  uid: string | null | undefined,
): MyEntry | null {
  if (!uid) return null;
  const team = tournament.teams.find((t) => entryUid(t) === uid);
  if (team) return { kind: "team", entry: team };
  const solo = tournament.soloPlayers.find((p) => entryUid(p) === uid);
  if (solo) return { kind: "solo", entry: solo };
  return null;
}

/**
 * เหตุผลที่สมัครไม่ได้
 *
 * offline = ผู้จัดยังไม่ได้เผยแพร่ทัวร์ขึ้นคลาวด์ ใบสมัครจึงไม่มีที่ให้ส่งไป
 * ต้องแยกจาก closed เพราะคนสมัครแก้อะไรไม่ได้ ต้องไปบอกผู้จัด
 */
export type GateReason = "offline" | "not-open" | "closed" | "full" | "finished";

export type Gate =
  | { open: true }
  | { open: false; reason: GateReason; at?: string };

export function slotsLeft(tournament: Tournament): number | null {
  if (tournament.maxTeams <= 0) return null;
  const used =
    tournament.entryMode === "solo"
      ? tournament.soloPlayers.length
      : tournament.teams.length;
  return Math.max(0, tournament.maxTeams - used);
}

/**
 * ตัดสินว่าตอนนี้เปิดรับสมัครอยู่ไหม
 *
 * โหมดเดี่ยวนับหัวคน โหมดทีมนับทีม เพราะ maxTeams ของสองโหมดหมายถึงคนละอย่าง
 * เรียงเหตุผลจากที่ผู้สมัครทำอะไรไม่ได้เลยไปหาที่รอได้
 */
export function registerGate(
  tournament: Tournament,
  now: number,
  online: boolean,
): Gate {
  if (!online) return { open: false, reason: "offline" };
  if (tournament.status === "finished") return { open: false, reason: "finished" };

  const opensAt = tournament.registerOpenAt
    ? new Date(tournament.registerOpenAt).getTime()
    : null;
  const closesAt = tournament.registerCloseAt
    ? new Date(tournament.registerCloseAt).getTime()
    : null;

  if (opensAt !== null && Number.isFinite(opensAt) && now < opensAt) {
    return { open: false, reason: "not-open", at: tournament.registerOpenAt };
  }
  if (closesAt !== null && Number.isFinite(closesAt) && now > closesAt) {
    return { open: false, reason: "closed", at: tournament.registerCloseAt };
  }

  const left = slotsLeft(tournament);
  if (left === 0) return { open: false, reason: "full" };

  return { open: true };
}

export const GATE_TEXT: Record<GateReason, { title: string; detail: string }> = {
  offline: {
    title: "ยังไม่เปิดรับสมัครออนไลน์",
    detail:
      "ผู้จัดยังไม่ได้เผยแพร่ทัวร์นี้ขึ้นคลาวด์ ใบสมัครเลยไม่มีที่ให้ส่งไป ติดต่อผู้จัดโดยตรงได้เลย",
  },
  "not-open": {
    title: "ยังไม่ถึงเวลารับสมัคร",
    detail: "กลับมาใหม่ตามเวลาข้างล่าง กดแชร์ลิงก์นี้เก็บไว้ก่อนได้",
  },
  closed: {
    title: "ปิดรับสมัครแล้ว",
    detail: "หมดเวลารับสมัครของทัวร์นี้ ลองดูทัวร์อื่นที่ยังเปิดอยู่",
  },
  full: {
    title: "ที่นั่งเต็มแล้ว",
    detail: "จำนวนผู้สมัครครบตามที่ผู้จัดกำหนด ถ้ามีคนถอนตัวช่องจะเปิดอีกครั้ง",
  },
  finished: {
    title: "ทัวร์นี้จบไปแล้ว",
    detail: "ดูผลการแข่งได้ที่แท็บสายแข่ง",
  },
};

/** ร่างใบสมัครที่ฟอร์มปั้นขึ้นก่อนส่ง — ใช้ร่วมกันทั้งโหมดทีมและเดี่ยว */
export type RegistrationDraft = {
  kind: "team" | "solo";
  /** ชื่อทีม หรือชื่อผู้เล่นในโหมดเดี่ยว */
  teamName: string;
  members: string[];
  contact?: string;
  ign?: string;
  lane?: string;
  /** โลโก้ทีม / รูปโปรไฟล์ ย่อแล้วเป็น data URL */
  image?: string;
  note?: string;
};

/** ชื่อซ้ำกับที่รับเข้าไปแล้วไหม — เทียบแบบไม่สนตัวพิมพ์และช่องว่างหัวท้าย */
export function nameTaken(tournament: Tournament, raw: string): boolean {
  const name = raw.trim().toLocaleLowerCase("th");
  if (!name) return false;
  const pool =
    tournament.entryMode === "solo"
      ? tournament.soloPlayers.map((p) => p.name)
      : tournament.teams.map((t) => t.name);
  return pool.some((n) => n.trim().toLocaleLowerCase("th") === name);
}
