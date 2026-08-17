"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { authStore, getDb, hasBackend } from "./firebase";

/**
 * สิทธิ์ "สตรีมเมอร์" — ระดับกลางระหว่างผู้ใช้ทั่วไปกับผู้ดูแลระบบ
 *
 * ผู้ใช้ทั่วไป : เปิดหน้าเว็บสาธารณะได้ สมัครแข่ง โดเนท ขอเพลง
 * สตรีมเมอร์   : ได้ทุกอย่างข้างบน + เปิดสตูดิโอจัดการ "ช่องของตัวเอง"
 * ผู้ดูแลระบบ  : ได้ทุกอย่าง + เห็นผู้ใช้ทั้งระบบ แก้ช่องคนอื่น และให้/ถอดสิทธิ์
 *
 * คำตอบที่เชื่อได้จริงอยู่ที่ firestore.rules — เอกสาร streamers/{uid}
 * เขียนได้เฉพาะผู้ดูแล จะแก้ localStorage หรือ devtools ยังไงก็ไม่ได้สิทธิ์จริง
 * หน้าเว็บอ่านเอกสารของตัวเองได้อย่างเดียว ("อ่านไม่ได้" = ไม่มีสิทธิ์)
 */

const STREAMERS = "streamers";
const REQUESTS = "streamerRequests";

export type StreamerState =
  | "loading"
  | "no-backend"
  | "signed-out"
  | "none"
  | "streamer";

export type StreamerEntry = {
  uid: string;
  label: string;
  email?: string | null;
  grantedAt?: string;
  grantedBy?: string;
};

export type RequestStatus = "pending" | "approved" | "rejected";

/** แพลตฟอร์มที่ไลฟ์อยู่ — ใช้เลือกในฟอร์มขอสิทธิ์ */
export const PLATFORMS: { key: string; label: string }[] = [
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
  { key: "twitch", label: "Twitch" },
  { key: "other", label: "อื่นๆ" },
];

export function platformLabel(key?: string): string {
  return PLATFORMS.find((p) => p.key === key)?.label ?? "ไม่ระบุ";
}

export type StreamerRequest = {
  uid: string;
  name: string;
  email: string | null;
  /** ชื่อช่องที่อยากเปิด */
  channelName: string;
  platform: string;
  channelUrl?: string;
  note?: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** เหตุผลตอนปฏิเสธ — คนขอต้องรู้ว่าต้องแก้อะไรถึงจะยื่นใหม่ได้ */
  reason?: string;
};

/* ---------------- สิทธิ์ของตัวเอง ---------------- */

let state: StreamerState = hasBackend ? "loading" : "no-backend";
let snapshot: StreamerState = state;
const listeners = new Set<() => void>();
let unsubDoc: Unsubscribe | null = null;
let unsubAuth: (() => void) | null = null;
let watchedUid: string | null = null;

function refresh(next: StreamerState) {
  state = next;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function stopDoc() {
  unsubDoc?.();
  unsubDoc = null;
  watchedUid = null;
}

function syncWithAuth() {
  const user = authStore.user();

  if (!user || user.anonymous) {
    stopDoc();
    refresh(authStore.ready() ? "signed-out" : "loading");
    return;
  }

  if (watchedUid === user.uid) return;

  stopDoc();
  const db = getDb();
  if (!db) {
    refresh("no-backend");
    return;
  }

  watchedUid = user.uid;
  refresh("loading");
  unsubDoc = onSnapshot(
    doc(db, STREAMERS, user.uid),
    (snap) => {
      // เช็ค uid ซ้ำ เผื่อสลับบัญชีระหว่างที่ผลลัพธ์กำลังเดินทางกลับมา
      if (watchedUid !== user.uid) return;
      refresh(snap.exists() ? "streamer" : "none");
    },
    /*
      อ่านไม่ได้ = ไม่มีสิทธิ์ ไม่ใช่ข้อผิดพลาดที่ต้องแจ้งผู้ใช้
      กรณีที่พบบ่อยที่สุดคือกติกา firestore.rules รุ่นใหม่ยังไม่ถูก publish
      ซึ่งผลลัพธ์ที่ถูกต้องก็คือ "ยังไม่มีใครเป็นสตรีมเมอร์" อยู่ดี
    */
    () => {
      if (watchedUid !== user.uid) return;
      refresh("none");
    },
  );
}

let started = false;

export const streamerStore = {
  subscribe(onChange: () => void) {
    if (!started) {
      started = true;
      if (hasBackend) {
        unsubAuth = authStore.subscribe(syncWithAuth);
        syncWithAuth();
      }
    }
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        unsubAuth?.();
        unsubAuth = null;
        stopDoc();
        started = false;
      }
    };
  },
  getSnapshot: (): StreamerState => snapshot,
  getServerSnapshot: (): StreamerState => (hasBackend ? "loading" : "no-backend"),
  state: (): StreamerState => state,
};

/* ---------------- รายชื่อสตรีมเมอร์ (เฉพาะผู้ดูแล) ---------------- */

const NO_STREAMERS: StreamerEntry[] = [];

export function watchStreamers(
  onChange: (list: StreamerEntry[]) => void,
  onError?: () => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange(NO_STREAMERS);
    return () => {};
  }
  return onSnapshot(
    collection(db, STREAMERS),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<StreamerEntry, "uid">;
        return { ...data, uid: d.id, label: data.label || d.id };
      });
      list.sort((a, b) => (b.grantedAt ?? "").localeCompare(a.grantedAt ?? ""));
      onChange(list);
    },
    () => {
      onChange(NO_STREAMERS);
      onError?.();
    },
  );
}

/** ให้สิทธิ์สตรีมเมอร์ — เขียนได้เฉพาะผู้ดูแล กติกาบังคับไว้ที่เซิร์ฟเวอร์ */
export async function grantStreamer(
  uid: string,
  label: string,
  extra?: { email?: string | null; grantedBy?: string },
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const clean = uid.trim();
  if (!clean) throw new Error("ต้องใส่รหัสผู้ใช้");
  await setDoc(
    doc(db, STREAMERS, clean),
    {
      uid: clean,
      label: label.trim() || clean,
      email: extra?.email ?? null,
      grantedAt: new Date().toISOString(),
      grantedBy: extra?.grantedBy ?? null,
    },
    { merge: true },
  );
}

export async function revokeStreamer(uid: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await deleteDoc(doc(db, STREAMERS, uid));
}

/* ---------------- คำขอเป็นสตรีมเมอร์ ---------------- */

const NO_REQUESTS: StreamerRequest[] = [];

/** ใบของตัวเอง — ใช้บอกสถานะในหน้า "ขอเป็นสตรีมเมอร์" */
export function watchMyStreamerRequest(
  uid: string,
  onChange: (req: StreamerRequest | null) => void,
): () => void {
  const db = getDb();
  if (!db || !uid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, REQUESTS, uid),
    (snap) => onChange(snap.exists() ? (snap.data() as StreamerRequest) : null),
    () => onChange(null),
  );
}

/** ใบทั้งหมด — กติกาเปิด list ให้เฉพาะผู้ดูแล */
export function watchStreamerRequests(
  onChange: (list: StreamerRequest[]) => void,
  onError?: () => void,
): () => void {
  const db = getDb();
  if (!db) {
    onChange(NO_REQUESTS);
    return () => {};
  }
  return onSnapshot(
    collection(db, REQUESTS),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as StreamerRequest),
        uid: d.id,
      }));
      /* ใบที่ยังไม่ตัดสินต้องอยู่บนสุดเสมอ ไม่งั้นงานที่ต้องทำจะจมอยู่ใต้ประวัติ */
      const rank = (s: RequestStatus) => (s === "pending" ? 0 : 1);
      list.sort(
        (a, b) =>
          rank(a.status) - rank(b.status) ||
          (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      );
      onChange(list);
    },
    () => {
      onChange(NO_REQUESTS);
      onError?.();
    },
  );
}

export type RequestDraft = {
  channelName: string;
  platform: string;
  channelUrl?: string;
  note?: string;
};

/**
 * ยื่นคำขอ (หรือยื่นใหม่หลังถูกปฏิเสธ) — ชื่อเอกสารคือ uid ของคนขอ
 * หนึ่งบัญชีจึงมีใบเดียวเสมอ ไม่ต้องกันใบซ้ำในหน้าเว็บ
 */
export async function submitStreamerRequest(draft: RequestDraft): Promise<void> {
  const db = getDb();
  const user = authStore.user();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  if (!user || user.anonymous) throw new Error("ต้องล็อกอินก่อน");

  const channelName = draft.channelName.trim();
  if (!channelName) throw new Error("ใส่ชื่อช่องก่อน");

  await setDoc(
    doc(db, REQUESTS, user.uid),
    {
      uid: user.uid,
      name: user.name,
      email: user.email ?? null,
      channelName: channelName.slice(0, 60),
      platform: draft.platform || "other",
      channelUrl: (draft.channelUrl ?? "").trim().slice(0, 200),
      note: (draft.note ?? "").trim().slice(0, 300),
      status: "pending",
      createdAt: new Date().toISOString(),
      // ล้างผลตัดสินรอบก่อนทิ้ง ไม่งั้นใบที่ยื่นใหม่จะยังโชว์เหตุผลที่โดนปฏิเสธเก่า
      decidedAt: null,
      decidedBy: null,
      reason: null,
    },
    { merge: true },
  );
}

/** ถอนใบของตัวเอง */
export async function withdrawStreamerRequest(uid: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  await deleteDoc(doc(db, REQUESTS, uid));
}

/**
 * ตัดสินใบ — อนุมัติแล้วต้องเขียนสิทธิ์ก่อน ค่อยติดสถานะ
 *
 * ถ้าสลับลำดับแล้วขั้นที่สองพลาด ใบจะขึ้นว่า "อนุมัติแล้ว" ทั้งที่ยังไม่มีสิทธิ์จริง
 * ซึ่งเป็นอาการที่ไล่หาสาเหตุยากที่สุด — ยอมให้เหลือใบ pending ที่มีสิทธิ์แล้วดีกว่า
 */
export async function decideStreamerRequest(
  req: StreamerRequest,
  decision: Exclude<RequestStatus, "pending">,
  by: { uid: string; label: string },
  reason?: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");

  if (decision === "approved") {
    await grantStreamer(req.uid, req.channelName || req.name || req.uid, {
      email: req.email,
      grantedBy: by.label,
    });
  }

  await setDoc(
    doc(db, REQUESTS, req.uid),
    {
      status: decision,
      decidedAt: new Date().toISOString(),
      decidedBy: by.label,
      reason: (reason ?? "").trim().slice(0, 300) || null,
    },
    { merge: true },
  );
}
