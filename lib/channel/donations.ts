"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import type { Donation } from "@/lib/tournament/types";

const COL = "channels";
const DON = "donations";

/** ใบสนับสนุนของช่อง — อาจผูกกับทัวร์ (สมทบทุนเงินรางวัล) หรือไม่ก็ได้ */
export type ChannelDonation = Donation & {
  channelId: string;
  /** ถ้าโดเนทผ่านหน้าทัวร์ จะมี id ทัวร์ติดมาด้วย */
  tournamentId?: string | null;
  tournamentName?: string | null;
};

export async function submitChannelDonation(
  channelId: string,
  data: {
    kind: "tip" | "member";
    name: string;
    amount: number;
    message?: string;
    slip?: string;
    tierId?: string;
    tierName?: string;
    months?: number;
    tournamentId?: string;
    tournamentName?: string;
  },
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await addDoc(collection(db, COL, channelId, DON), {
    channelId,
    kind: data.kind,
    name: data.name.slice(0, 40),
    amount: data.amount,
    message: (data.message ?? "").slice(0, 140),
    slip: data.slip ?? null,
    tierId: data.tierId ?? null,
    tierName: data.tierName ?? null,
    months: data.months ?? null,
    tournamentId: data.tournamentId ?? null,
    tournamentName: data.tournamentName ?? null,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}

export function watchChannelDonations(
  channelId: string,
  onChange: (list: ChannelDonation[]) => void,
  options?: { onlyApproved?: boolean; onError?: (e: Error) => void },
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  const base = collection(db, COL, channelId, DON);
  const q = options?.onlyApproved
    ? query(base, where("status", "==", "approved"), orderBy("createdAt", "asc"))
    : query(base, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) =>
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChannelDonation)),
    (err) => options?.onError?.(err),
  );
}

export async function setChannelDonationStatus(
  channelId: string,
  donationId: string,
  status: Donation["status"],
  extra?: { expiresAt?: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  // ใบที่อนุมัติแล้วอ่านได้แบบสาธารณะ (widget ไม่ล็อกอิน) เลยต้องลบสลิปทิ้ง
  const patch =
    status === "approved"
      ? { status, slip: null, ...(extra?.expiresAt ? { expiresAt: extra.expiresAt } : {}) }
      : { status };
  await setDoc(doc(db, COL, channelId, DON, donationId), patch, { merge: true });
}

export async function deleteChannelDonation(channelId: string, donationId: string) {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, COL, channelId, DON, donationId));
}

/** ยอดที่อนุมัติแล้วของทัวร์นั้น — เอาไปบวกเข้าเงินรางวัล */
export function raisedForTournament(
  list: ChannelDonation[],
  tournamentId: string,
): number {
  return list
    .filter((d) => d.status === "approved" && d.tournamentId === tournamentId)
    .reduce((sum, d) => sum + (d.amount || 0), 0);
}

/** คำนวณวันหมดอายุสมาชิกจากจำนวนเดือน */
export function expiryFrom(months: number, from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + Math.max(1, months));
  return d.toISOString();
}