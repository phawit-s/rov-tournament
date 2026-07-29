"use client";

import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import { authStore } from "@/lib/backend/firebase";

/**
 * ประวัติฝั่งคลาวด์ — เขียนได้อย่างเดียว แก้ทีหลังไม่ได้
 *
 * ต่างจาก lib/activity.ts ที่เก็บใน localStorage ของเครื่องใครเครื่องมัน
 * อันนี้อยู่บนคลาวด์ ผู้ดูแลทุกคนเห็นเหมือนกันว่าใครเผยแพร่อะไรเมื่อไหร่
 * firestore.rules ปิด update กับ delete ไว้ทั้งหมด ประวัติจึงลบหรือแก้ย้อนหลังไม่ได้
 */

const COL = "auditLog";

export type AuditKind =
  | "tournament.publish"
  | "tournament.unpublish"
  | "channel.publish"
  | "donation.approve"
  | "donation.reject"
  | "admin.add"
  | "admin.remove";

export type AuditEntry = {
  id: string;
  at: string;
  kind: AuditKind;
  actorUid: string;
  actorName: string;
  targetId?: string | null;
  targetName?: string | null;
  detail?: string | null;
};

export const AUDIT_META: Record<AuditKind, { label: string; rgb: string }> = {
  "tournament.publish": { label: "เผยแพร่ทัวร์", rgb: "77 181 145" },
  "tournament.unpublish": { label: "ถอดทัวร์ออก", rgb: "224 86 107" },
  "channel.publish": { label: "อัปเดตช่อง", rgb: "109 146 219" },
  "donation.approve": { label: "อนุมัติสลิป", rgb: "221 175 100" },
  "donation.reject": { label: "ปฏิเสธสลิป", rgb: "224 86 107" },
  "admin.add": { label: "เพิ่มผู้ดูแล", rgb: "160 121 216" },
  "admin.remove": { label: "ถอดผู้ดูแล", rgb: "146 151 172" },
};

/**
 * บันทึกลงประวัติ — ห้าม throw ออกไปข้างนอก
 * ถ้าจดประวัติไม่สำเร็จก็ไม่ควรทำให้งานหลักที่ผู้ใช้กด (เช่นเผยแพร่ทัวร์) ล้มตาม
 */
export async function recordAudit(
  kind: AuditKind,
  target?: { id?: string; name?: string; detail?: string },
): Promise<void> {
  try {
    const db = getDb();
    const user = authStore.user();
    if (!db || !user || user.anonymous) return;
    await addDoc(collection(db, COL), {
      at: new Date().toISOString(),
      kind,
      actorUid: user.uid,
      actorName: user.name,
      actorEmail: user.email ?? null,
      targetId: target?.id ?? null,
      targetName: target?.name ?? null,
      detail: target?.detail ?? null,
    });
  } catch {
    /* จดไม่ได้ก็ปล่อยผ่าน งานหลักสำคัญกว่า */
  }
}

/** ฟังประวัติล่าสุด — อ่านได้เฉพาะผู้ดูแล กติกาจะปฏิเสธคนอื่นเอง */
export function watchAudit(
  onChange: (list: AuditEntry[]) => void,
  options?: { max?: number; onError?: (e: Error) => void },
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL), orderBy("at", "desc"), limit(options?.max ?? 200)),
    (snap) =>
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEntry)),
    (err) => options?.onError?.(err),
  );
}
