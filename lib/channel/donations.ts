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
/** ลายนิ้วมือสลิปที่เคยใช้แล้ว — id เป็น SHA-256 hex 64 ตัว */
const SLIP_REFS = "slipRefs";

/** ใบสนับสนุนของช่อง — อาจผูกกับทัวร์ (สมทบทุนเงินรางวัล) หรือไม่ก็ได้ */
export type ChannelDonation = Donation & {
  channelId: string;
  /** ถ้าโดเนทผ่านหน้าทัวร์ จะมี id ทัวร์ติดมาด้วย */
  tournamentId?: string | null;
  tournamentName?: string | null;
};

/**
 * ส่งใบสนับสนุนเข้าช่อง
 *
 * ผลการตรวจสลิป (slipRef / slipCheck / …) แนบมากับใบได้เลย แต่ **สถานะต้องเป็น
 * pending เสมอ** เพราะกติกา create ของ Firestore บังคับไว้ และคนโอนก็ไม่มีสิทธิ์
 * update ใบของตัวเองด้วย ดังนั้นถึงจะตรวจผ่านและเจ้าของช่องเปิด autoApprove ไว้
 * การพลิกเป็น approved ก็เป็นงานฝั่งผู้จัด (ที่มีสิทธิ์ update) ไม่ใช่ฝั่งนี้
 */
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
    /** SHA-256 ของ QR บนสลิป — มีค่าก็ต่อเมื่อจอง slipRefs สำเร็จแล้ว */
    slipRef?: string | null;
    slipCheck?: Donation["slipCheck"];
    slipAmount?: number | null;
    slipAt?: string | null;
    slipBank?: string | null;
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
    slipRef: data.slipRef ?? null,
    slipCheck: data.slipCheck ?? "none",
    slipAmount: data.slipAmount ?? null,
    slipAt: data.slipAt ?? null,
    slipBank: data.slipBank ?? null,
    autoApproved: false,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}

/**
 * จองลายนิ้วมือสลิป — คืน true ถ้าเป็นสลิปใบใหม่ / false ถ้าเคยถูกใช้ไปแล้ว
 *
 * ไม่ต้องใช้ transaction เพราะกติกาฝั่งเซิร์ฟเวอร์ปิด update ไว้แล้ว
 * setDoc ทับเอกสารที่มีอยู่จึงถูกนับเป็น update และโดนปฏิเสธเสมอ
 * ต่อให้สองคนยิงพร้อมกัน ก็มีแค่คนแรกที่ create ผ่าน
 */
export async function claimSlipRef(
  fingerprint: string,
  channelId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  try {
    await setDoc(doc(db, SLIP_REFS, fingerprint), {
      channelId,
      at: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    // permission-denied ที่นี่แปลได้ทางเดียวคือเอกสารมีอยู่แล้ว (กติกา create ผ่านแน่
    // เพราะล็อกอินแล้วและ id ยาว 64 ตัว) — เท่ากับสลิปซ้ำ
    const code = (err as { code?: string }).code;
    if (code === "permission-denied" || code === "already-exists") return false;
    // เน็ตหลุด/เซิร์ฟเวอร์ล่ม = ยังไม่รู้ว่าซ้ำหรือไม่ ห้ามเดาว่าซ้ำ
    // โยนออกไปให้ฟอร์มบอกว่าส่งไม่สำเร็จแทน จะได้ไม่กล่าวหาคนโอนผิดๆ
    throw err;
  }
}

/**
 * ส่ง QR ของสลิปไปให้ Worker ตรวจกับธนาคาร
 * คีย์ของผู้ให้บริการอยู่ใน Worker ไม่ได้อยู่ในหน้าเว็บ เราแค่ยิง payload ไปถาม
 * ห้าม throw ออกไปข้างนอก — ตรวจไม่ได้ก็แค่ตกไปให้คนตรวจด้วยตา ไม่ควรทำให้ส่งใบไม่ได้
 */
export async function verifySlipRemote(
  endpoint: string,
  payload: string,
  expect: { amount: number; account?: string },
): Promise<{ ok: boolean; amount?: number; at?: string; bank?: string }> {
  const url = endpoint.trim();
  if (!url) return { ok: false };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload,
        expectAmount: expect.amount,
        expectAccount: expect.account ?? "",
      }),
      // สลิปตรวจช้ากว่านี้ก็ไม่ต้องรอ ปล่อยให้ผู้จัดตรวจเองเร็วกว่า
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      ok?: boolean;
      amount?: number;
      at?: string;
      bank?: string;
    };
    if (!data?.ok) return { ok: false };
    return {
      ok: true,
      amount: typeof data.amount === "number" ? data.amount : undefined,
      at: typeof data.at === "string" ? data.at : undefined,
      bank: typeof data.bank === "string" ? data.bank : undefined,
    };
  } catch {
    return { ok: false };
  }
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