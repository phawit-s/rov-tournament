"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
 * update ใบของตัวเองด้วย
 *
 * คืน id ของใบที่สร้าง เพื่อส่งต่อให้ Worker ไปพลิกเป็น approved หลังตรวจสลิปผ่าน
 * — Worker เป็นตัวเดียวที่เชื่อถือได้พอจะเขียนสถานะ เพราะผู้ใช้แก้โค้ดมันไม่ได้
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
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const ref = await addDoc(collection(db, COL, channelId, DON), {
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
  return ref.id;
}

/**
 * ผลการจองลายนิ้วมือสลิป
 *   fresh     = สลิปใบใหม่ จองสำเร็จ
 *   duplicate = เคยถูกใช้ไปแล้ว ต้องปฏิเสธ
 *   unchecked = ตรวจไม่ได้ (ยังไม่ได้ publish กติกา / เน็ตมีปัญหา) ต้องปล่อยผ่าน
 */
export type SlipClaim = "fresh" | "duplicate" | "unchecked";

/**
 * จองลายนิ้วมือสลิป กันไม่ให้สลิปใบเดิมถูกส่งซ้ำ
 *
 * ทำไมต้องอ่านก่อนเขียน ทั้งที่กติกาปิด update ไว้อยู่แล้ว:
 * Firestore คืน permission-denied เหมือนกันหมด ทั้งกรณี "เอกสารมีอยู่แล้ว"
 * และกรณี "ยังไม่ได้ publish กติกา จึงโดน default deny" แยกจาก error ไม่ได้เลย
 * ถ้าเดาว่าเป็นสลิปซ้ำอย่างเดียว พอลืม publish กติกาเมื่อไหร่ สลิปที่ถูกต้อง
 * ทุกใบจะถูกปฏิเสธว่า "ถูกใช้ไปแล้ว" ซึ่งแย่กว่าไม่มีระบบกันซ้ำเสียอีก
 *
 * การอ่านก่อนแยกสองกรณีนี้ออกจากกันได้ เพราะกติกาเปิด get ให้ทุกคนที่ล็อกอิน
 *   อ่านไม่ได้        -> ไม่มีกติกาครอบคลุม -> unchecked (ปล่อยผ่าน)
 *   อ่านได้ มีเอกสาร  -> ซ้ำจริง            -> duplicate
 *   อ่านได้ ไม่มีเอกสาร -> จองต่อ            -> fresh / duplicate ถ้าโดนแย่งจอง
 */
export async function claimSlipRef(
  fingerprint: string,
  channelId: string,
): Promise<SlipClaim> {
  const db = getDb();
  if (!db) return "unchecked";
  const ref = doc(db, SLIP_REFS, fingerprint);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return "duplicate";
  } catch {
    // อ่านไม่ได้ = กติกายังไม่ขึ้น หรือเน็ตมีปัญหา ห้ามกล่าวหาคนโอนว่าส่งซ้ำ
    return "unchecked";
  }

  try {
    await setDoc(ref, { channelId, at: new Date().toISOString() });
    return "fresh";
  } catch {
    // อ่านผ่านแล้วแต่เขียนไม่ผ่าน = มีคนจองแทรกไประหว่างนั้น (กติกาปิด update)
    return "duplicate";
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
  expect: {
    amount: number;
    account?: string;
    /** ส่งไปให้ Worker รู้ว่าต้องไปพลิกสถานะใบไหน ถ้าตรวจผ่าน */
    channelId?: string;
    donationId?: string;
  },
): Promise<{
  ok: boolean;
  amount?: number;
  at?: string;
  bank?: string;
  /** Worker อนุมัติใบให้แล้วหรือยัง (ต้องตั้งบัญชีบอทใน Worker ก่อน) */
  approved?: boolean;
}> {
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
        channelId: expect.channelId ?? "",
        donationId: expect.donationId ?? "",
      }),
      // ต้องรอนานกว่าเดิมเพราะ Worker ทำสองงาน: ตรวจกับธนาคาร แล้วอนุมัติใบให้
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      ok?: boolean;
      amount?: number;
      at?: string;
      bank?: string;
      approved?: boolean;
    };
    if (!data?.ok) return { ok: false };
    return {
      ok: true,
      amount: typeof data.amount === "number" ? data.amount : undefined,
      at: typeof data.at === "string" ? data.at : undefined,
      bank: typeof data.bank === "string" ? data.bank : undefined,
      approved: data.approved === true,
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