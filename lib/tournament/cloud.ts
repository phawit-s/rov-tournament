"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { recordAudit } from "@/lib/audit";
import { getDb, hasBackend } from "@/lib/backend/firebase";
import { stripContacts } from "@/lib/safe";
import type { SoloEntry, TeamEntry, Tournament } from "./types";

export type CloudTournament = Tournament & {
  ownerUid: string;
  ownerName: string;
  /** เปิดให้คนทั่วไปดูไหม (widget กับลิงก์แชร์ต้องใช้) */
  isPublic: boolean;
};

export type Registration = {
  id: string;
  tournamentId: string;
  /** ชื่อทีม หรือชื่อผู้เล่นในโหมดเดี่ยว — กติกาบังคับให้มีเสมอ */
  teamName: string;
  members: string[];
  contact?: string | null;
  byUid: string;
  byName: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";

  /* ---- ของที่เพิ่มมาทีหลัง ใบเก่าจะไม่มี ต้องอ่านแบบเผื่อ undefined ---- */
  /** ทีมหรือเดี่ยว ใบเก่าไม่มีฟิลด์นี้ ถือเป็นทีม */
  kind?: "team" | "solo";
  ign?: string | null;
  lane?: string | null;
  /** โลโก้ทีม / รูปโปรไฟล์ ย่อแล้วเป็น data URL */
  image?: string | null;
  note?: string | null;
};

const COL = "tournaments";
const REG = "registrations";

export function cloudReady(): boolean {
  return hasBackend && !!getDb();
}

/**
 * ตัดของที่ไม่ควรขึ้นคลาวด์ออก
 * doc นี้ถูกตั้งเป็น public เพื่อให้ widget ใน OBS อ่านได้ ใครมีลิงก์ก็อ่านได้หมด
 * เพราะฉะนั้น PIN กับข้อมูลติดต่อของทีมต้องไม่ติดไปด้วย
 */
function sanitize(t: Tournament): Omit<Tournament, "adminPin"> {
  const copy: Tournament = stripContacts({ ...t });
  delete copy.adminPin;
  // รูป data URL ใหญ่เกิน 1MB ต่อ doc ของ Firestore ถ้าใหญ่ก็ตัดทิ้ง
  if (copy.cover && copy.cover.length > 600_000) delete copy.cover;
  return copy;
}

/** อัปโหลด/อัปเดตทัวร์ขึ้นคลาวด์ */
export async function pushTournament(
  tournament: Tournament,
  owner: { uid: string; name: string; email?: string | null },
  isPublic = true,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await setDoc(
    doc(db, COL, tournament.id),
    {
      ...sanitize(tournament),
      ownerUid: owner.uid,
      ownerName: owner.name,
      /*
        ช่องที่ทัวร์นี้สังกัด — เอาค่าที่ผู้จัดเลือกไว้เป็นหลัก

        ของเดิมทับด้วย owner.uid ทุกครั้ง ซึ่งถูกเฉพาะตอนที่ "รหัสช่อง = uid
        เจ้าของ" คือช่องแรกที่บัญชีนั้นสร้างเอง ช่องที่สองหรือช่องที่โอนมา
        มีรหัสคนละตัว ยอดสมทบทุนเงินรางวัลจึงไปดึงจากช่องผิดใบเงียบๆ
        (uid ยังใช้เป็นทางสำรองให้ทัวร์เก่าที่ยังไม่เคยเลือกช่อง)
      */
      channelId: tournament.channelId ?? owner.uid,
      ownerEmail: owner.email ?? null,
      adminEmails: (tournament.adminEmails ?? []).map((e) => e.toLowerCase()),
      isPublic,
      syncedAt: serverTimestamp(),
    },
    { merge: true },
  );
  // จดประวัติหลังเขียนสำเร็จเท่านั้น จะได้ไม่มีบรรทัดหลอกตอนเขียนพัง
  // recordAudit กลืน error ไว้เองแล้ว ตรงนี้จึงไม่ต้อง try/catch ซ้ำ
  await recordAudit("tournament.publish", {
    id: tournament.id,
    name: tournament.name,
    detail: isPublic ? "เผยแพร่สาธารณะ" : "เก็บเป็นส่วนตัว",
  });
}

export async function removeTournament(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, COL, id));
  await recordAudit("tournament.unpublish", { id });
}

/** ฟังทัวร์ตัวเดียวแบบเรียลไทม์ — widget กับหน้าคนดูใช้ตัวนี้ */
export function watchTournament(
  id: string,
  onChange: (t: CloudTournament | null) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, COL, id),
    (snap) => onChange(snap.exists() ? (snap.data() as CloudTournament) : null),
    (err) => onError?.(err),
  );
}

/** เรียงใหม่สุดขึ้นก่อน — ทำในเครื่องแทน orderBy เพราะ orderBy ตัดเอกสารที่ไม่มีฟิลด์นั้นทิ้งเงียบๆ */
function byNewest(list: CloudTournament[]): CloudTournament[] {
  return list
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** ฟังทัวร์ทั้งหมดของเจ้าของคนนี้ */
export function watchMyTournaments(
  uid: string,
  onChange: (list: CloudTournament[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL), where("ownerUid", "==", uid)),
    (snap) => onChange(byNewest(snap.docs.map((d) => d.data() as CloudTournament))),
    (err) => onError?.(err),
  );
}

/**
 * ฟังทัวร์ทุกอันบนคลาวด์ — สำหรับผู้ดูแลระบบ
 *
 * ทัวร์เก็บอยู่ใน localStorage ของเครื่องคนสร้าง หน้ารายการจึงเห็นแต่ของเครื่องตัวเอง
 * ผู้ดูแลคนอื่น (หรือคนเดิมแต่คนละเครื่อง) เลยไม่เห็นทัวร์ที่จัดไว้เลย
 * ตัวนี้ดึงจากคลาวด์มาเติมให้ครบ
 *
 * ไม่ใส่ where เพราะกติกาให้สิทธิ์ผู้ดูแลอ่านได้ทุกเอกสารอยู่แล้ว
 * (isAdmin ไม่ได้ขึ้นกับตัวเอกสาร ทุกใบจึงผ่านเหมือนกันหมด)
 */
export function watchAllTournaments(
  onChange: (list: CloudTournament[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, COL),
    (snap) => onChange(byNewest(snap.docs.map((d) => d.data() as CloudTournament))),
    (err) => onError?.(err),
  );
}

/* ---------------- การสมัครข้ามเครื่อง ---------------- */

/**
 * ส่งใบสมัคร — ปลายทางคือ subcollection ของทัวร์ ไม่ใช่ตัวทัวร์
 *
 * ตัวทัวร์เขียนได้เฉพาะเจ้าของ คนสมัครจึงเขียนลงตรงนั้นไม่ได้
 * ที่นี่คือทางเดียวที่ใบจะไปถึงผู้จัดจริง เขียนสำเร็จ = ผู้จัดเห็นแน่นอน
 *
 * คืน id ของใบกลับไป เผื่อคนสมัครกดถอนทันทีโดยยังไม่ทันได้ snapshot
 */
export async function submitRegistration(
  tournamentId: string,
  entry: {
    teamName: string;
    members: string[];
    contact?: string;
    kind?: "team" | "solo";
    ign?: string;
    lane?: string;
    image?: string;
    note?: string;
  },
  by: { uid: string; name: string },
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const ref = await addDoc(collection(db, COL, tournamentId, REG), {
    tournamentId,
    teamName: entry.teamName,
    // กติกาจำกัดไว้ 12 คน ตัดตั้งแต่ตรงนี้จะได้ไม่โดนปฏิเสธทั้งใบ
    members: entry.members.slice(0, 12),
    contact: entry.contact ?? null,
    kind: entry.kind ?? "team",
    ign: entry.ign ?? null,
    lane: entry.lane ?? null,
    image: entry.image ?? null,
    note: entry.note ?? null,
    byUid: by.uid,
    byName: by.name,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  return ref.id;
}

/**
 * ฟังใบของตัวเองในทัวร์นี้ — คนสมัครจะได้เห็นสถานะขยับเองโดยไม่ต้องรีเฟรช
 *
 * กติกาเปิด read ให้เจ้าของใบ (byUid == uid) อยู่แล้ว จึง query ด้วย where ตัวเดียวกันได้
 * ไม่ใส่ orderBy เพราะ orderBy ตัดเอกสารที่ไม่มีฟิลด์นั้นทิ้งเงียบๆ เรียงในเครื่องแทน
 */
export function watchMyRegistrations(
  tournamentId: string,
  uid: string,
  onChange: (list: Registration[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL, tournamentId, REG), where("byUid", "==", uid)),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Registration)
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
      ),
    (err) => onError?.(err),
  );
}

/** ถอนใบของตัวเอง — กติกาให้ลบได้เฉพาะใบที่ยังไม่ถูกตัดสิน */
export async function withdrawRegistration(
  tournamentId: string,
  registrationId: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await deleteDoc(doc(db, COL, tournamentId, REG, registrationId));
}

export function watchRegistrations(
  tournamentId: string,
  onChange: (list: Registration[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL, tournamentId, REG), orderBy("createdAt", "asc")),
    (snap) =>
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Registration)),
    (err) => onError?.(err),
  );
}

export async function setRegistrationStatus(
  tournamentId: string,
  registrationId: string,
  status: Registration["status"],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await setDoc(
    doc(db, COL, tournamentId, REG, registrationId),
    { status },
    { merge: true },
  );
}

/**
 * แปลงใบสมัครที่อนุมัติแล้วเป็นทีมในทัวร์
 *
 * แปะ uid ของคนส่งไว้ด้วย ผู้จัดจะได้ตามตัวกลับได้
 * และเจ้าตัวเปิดหน้าทัวร์แล้วเห็นว่า "ใบของคุณผ่านแล้ว" แทนที่จะเห็นฟอร์มเปล่า
 * ค่าที่ไม่มีต้องไม่ใส่คีย์เลย เพราะ Firestore ไม่รับ undefined
 */
export function registrationToTeam(reg: Registration): TeamEntry {
  return {
    id: reg.id,
    name: reg.teamName,
    members: reg.members ?? [],
    registeredAt: reg.createdAt,
    approved: true,
    ...(reg.contact ? { contact: reg.contact } : {}),
    ...(reg.image ? { logo: reg.image } : {}),
    ...(reg.byUid ? { uid: reg.byUid } : {}),
  };
}

/** แปลงใบสมัครเป็นผู้เล่นเดี่ยว ใช้กับทัวร์ที่ผู้จัดสุ่มแบ่งทีมเอง */
export function registrationToSolo(reg: Registration): SoloEntry {
  return {
    id: reg.id,
    name: reg.teamName,
    registeredAt: reg.createdAt,
    approved: true,
    ...(reg.ign ? { ign: reg.ign } : {}),
    ...(reg.lane ? { lane: reg.lane } : {}),
    ...(reg.contact ? { contact: reg.contact } : {}),
    ...(reg.image ? { avatar: reg.image } : {}),
    ...(reg.byUid ? { uid: reg.byUid } : {}),
  };
}
