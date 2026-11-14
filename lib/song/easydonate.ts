"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";

/**
 * ผลของโดเนทหนึ่งรายการที่ Worker จดไว้ (worker/easydonate.js)
 * result: queued ลัดคิวแล้ว · test ปุ่มทดสอบ · no-song โดเนทธรรมดา · off ยังไม่ตั้งยอด
 *   below-min ยอดไม่ถึง · songs-closed ปิดรับเพลง · ที่เหลือคือหาเพลงหรือเขียนคิวไม่ได้
 */
export type DonateLogEntry = {
  at: string;
  name: string;
  amount: number;
  result: string;
  title?: string;
  videoId?: string;
  query?: string;
  min?: number;
};

const EMPTY: DonateLogEntry[] = [];

/**
 * ฟังบันทึกโดเนทลัดคิว 10 รายการล่าสุดของช่อง (channels/{id}/private/easydonate)
 * ใบเดียว — ค่าอ่าน 1 ตอนเปิด และ 1 ต่อโดเนทที่เข้ามาระหว่างเปิดหน้าไว้
 * อ่านได้เฉพาะเจ้าของช่องกับผู้ดูแล (firestore.rules) คนอื่นจะได้ error ซึ่งปล่อยเป็นรายการว่าง
 */
export function watchDonateLog(
  channelId: string,
  onChange: (log: DonateLogEntry[]) => void,
): () => void {
  const db = getDb();
  if (!db || !channelId) {
    onChange(EMPTY);
    return () => {};
  }
  return onSnapshot(
    doc(db, "channels", channelId, "private", "easydonate"),
    (snap) => {
      const log = snap.data()?.log;
      onChange(Array.isArray(log) ? (log as DonateLogEntry[]) : EMPTY);
    },
    () => onChange(EMPTY),
  );
}

/** ลิงก์หน้าโดเนทของสตรีมเมอร์บน EasyDonate — null ถ้าชื่อไม่ใช่รูปแบบชื่อผู้ใช้ */
export function easyDonateUrl(user?: string | null): string | null {
  const name = (user ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._-]{2,40}$/.test(name) ? `https://ezdn.app/${name}` : null;
}

/** ยอดเงินแบบสั้น ฿1,000 */
export const baht = (n: number): string =>
  `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
