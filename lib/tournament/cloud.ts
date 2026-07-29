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
import { getDb, hasBackend } from "@/lib/backend/firebase";
import { stripContacts } from "@/lib/safe";
import type { TeamEntry, Tournament } from "./types";

export type CloudTournament = Tournament & {
  ownerUid: string;
  ownerName: string;
  /** เปิดให้คนทั่วไปดูไหม (widget กับลิงก์แชร์ต้องใช้) */
  isPublic: boolean;
};

export type Registration = {
  id: string;
  tournamentId: string;
  teamName: string;
  members: string[];
  contact?: string;
  byUid: string;
  byName: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
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
      channelId: owner.uid,
      ownerEmail: owner.email ?? null,
      adminEmails: (tournament.adminEmails ?? []).map((e) => e.toLowerCase()),
      isPublic,
      syncedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeTournament(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, COL, id));
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
  const q = query(
    collection(db, COL),
    where("ownerUid", "==", uid),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as CloudTournament)),
    (err) => onError?.(err),
  );
}

/* ---------------- การสมัครข้ามเครื่อง ---------------- */

export async function submitRegistration(
  tournamentId: string,
  entry: { teamName: string; members: string[]; contact?: string },
  by: { uid: string; name: string },
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await addDoc(collection(db, COL, tournamentId, REG), {
    tournamentId,
    teamName: entry.teamName,
    members: entry.members,
    contact: entry.contact ?? null,
    byUid: by.uid,
    byName: by.name,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
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

/** แปลงใบสมัครที่อนุมัติแล้วเป็นทีมในทัวร์ */
export function registrationToTeam(reg: Registration): TeamEntry {
  return {
    id: reg.id,
    name: reg.teamName,
    members: reg.members,
    contact: reg.contact,
    registeredAt: reg.createdAt,
    approved: true,
  };
}
