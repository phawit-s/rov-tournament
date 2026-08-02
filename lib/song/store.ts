"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import type { SongConfig, SongRequest, SongStatus } from "./types";

const COL = "channels";
const SONGS = "songRequests";

/** อ้างอิงคงที่ ไม่งั้นการ setState([]) ตอน error จะทำให้รีเรนเดอร์ไม่จบ */
const EMPTY: SongRequest[] = [];

export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate" | "too-many" | "queue-full" | "failed" };

/**
 * ส่งคำขอเพลงเข้าคิว
 *
 * กติกาฝั่งเซิร์ฟเวอร์คุมแค่รูปแบบข้อมูลกับสถานะเริ่มต้น ส่วนเพดานจำนวน
 * (กี่เพลงต่อคน คิวยาวสุดเท่าไหร่) เช็คตรงนี้จากคิวที่โหลดมาแล้ว
 * เพราะกติกา Firestore นับจำนวนเอกสารในคอลเลกชันไม่ได้
 * — ตั้งใจให้เป็นการกันมือลั่น ไม่ใช่ด่านกันคนตั้งใจสแปม
 */
export async function submitSongRequest(
  channelId: string,
  data: {
    videoId: string;
    title: string;
    author: string;
    url: string;
    byUid: string;
    byName: string;
    message?: string;
  },
  queue: SongRequest[],
  config: SongConfig,
): Promise<SubmitResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "failed" };

  const waiting = queue.filter((s) => s.status === "queued" || s.status === "playing");

  if (config.maxQueue && waiting.length >= config.maxQueue) {
    return { ok: false, reason: "queue-full" };
  }
  if (!config.allowDuplicates && waiting.some((s) => s.videoId === data.videoId)) {
    return { ok: false, reason: "duplicate" };
  }
  if (config.maxPerUser) {
    const mine = waiting.filter((s) => s.byUid === data.byUid).length;
    if (mine >= config.maxPerUser) return { ok: false, reason: "too-many" };
  }

  try {
    const ref = await addDoc(collection(db, COL, channelId, SONGS), {
      channelId,
      videoId: data.videoId,
      title: data.title.slice(0, 140),
      author: data.author.slice(0, 80),
      url: data.url,
      byUid: data.byUid,
      byName: data.byName.slice(0, 40),
      message: (data.message ?? "").slice(0, 120) || null,
      source: "viewer" as const,
      status: "queued" as SongStatus,
      createdAt: new Date().toISOString(),
      playedAt: null,
    });
    return { ok: true, id: ref.id };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * ฟังคิวของช่อง
 *
 * ไม่ใส่ orderBy ในคิวรี แล้วเรียงในเครื่องแทน เพราะ Firestore จะตัดเอกสาร
 * ที่ไม่มีฟิลด์ที่ใช้เรียงทิ้งเงียบๆ ซึ่งเคยทำให้ข้อมูลหายมาแล้วในหน้าอื่น
 */
export function watchSongQueue(
  channelId: string,
  onChange: (list: SongRequest[]) => void,
  options?: { onlyOpen?: boolean; onError?: (e: Error) => void },
): () => void {
  const db = getDb();
  if (!db || !channelId) {
    onChange(EMPTY);
    return () => {};
  }

  const base = collection(db, COL, channelId, SONGS);
  // widget ไม่ได้ล็อกอิน จึงขอเฉพาะที่ยังไม่จบ ให้ตรงกับที่กติกาเปิดให้อ่าน
  const q = options?.onlyOpen
    ? query(base, where("status", "in", ["queued", "playing"]))
    : base;

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SongRequest);
      list.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      onChange(list);
    },
    (err) => options?.onError?.(err),
  );
}

/**
 * เปลี่ยนสถานะเพลง
 * กดเล่นแล้วเพลงที่เคยเล่นค้างอยู่ต้องถูกปิดก่อน ไม่งั้น "กำลังเล่น" จะมีหลายเพลง
 */
export async function setSongStatus(
  channelId: string,
  songId: string,
  status: SongStatus,
  queue?: SongRequest[],
): Promise<void> {
  const db = getDb();
  if (!db) return;

  if (status === "playing" && queue) {
    const stale = queue.filter((s) => s.status === "playing" && s.id !== songId);
    if (stale.length > 0) {
      const batch = writeBatch(db);
      stale.forEach((s) =>
        batch.set(
          doc(db, COL, channelId, SONGS, s.id),
          { status: "played", playedAt: new Date().toISOString() },
          { merge: true },
        ),
      );
      batch.set(
        doc(db, COL, channelId, SONGS, songId),
        { status, playedAt: new Date().toISOString() },
        { merge: true },
      );
      await batch.commit();
      return;
    }
  }

  await setDoc(
    doc(db, COL, channelId, SONGS, songId),
    {
      status,
      ...(status === "playing" || status === "played"
        ? { playedAt: new Date().toISOString() }
        : {}),
    },
    { merge: true },
  );
}

export async function removeSongRequest(channelId: string, songId: string) {
  const db = getDb();
  if (!db) return;
  await deleteDoc(doc(db, COL, channelId, SONGS, songId));
}

/** ล้างเพลงที่เล่นจบ/ถูกปฏิเสธออก เก็บคิวให้สะอาด */
export async function clearFinishedSongs(channelId: string, queue: SongRequest[]) {
  const db = getDb();
  if (!db) return;
  const done = queue.filter((s) => s.status === "played" || s.status === "rejected");
  if (done.length === 0) return;

  // Firestore จำกัด batch ละ 500 การเขียน แบ่งก้อนไว้กันคิวยาวผิดปกติ
  for (let i = 0; i < done.length; i += 400) {
    const batch = writeBatch(db);
    done
      .slice(i, i + 400)
      .forEach((s) => batch.delete(doc(db, COL, channelId, SONGS, s.id)));
    await batch.commit();
  }
}

/**
 * เพลงที่กำลังเล่นกับคิวถัดไป — ใช้ทั้งใน widget และหน้าจัดการ
 *
 * คิวเรียงให้เพลงที่คนขอจริงมาก่อนเพลงสำรองเสมอ
 * เพลงสำรองคือของที่ระบบหยิบมาเล่นกันเงียบตอนไม่มีใครขอ
 * พอมีคนขอเข้ามาก็ต้องได้คิวก่อนทันทีโดยไม่ต้องรอเพลงสำรองหมดกอง
 * (ไม่ตัดเพลงที่กำลังเล่นอยู่ทิ้งกลางคัน รอให้จบเพลงก่อน)
 */
export function splitQueue(list: SongRequest[]) {
  const queued = list
    .filter((s) => s.status === "queued")
    .sort((a, b) => {
      const fa = a.source === "filler" ? 1 : 0;
      const fb = b.source === "filler" ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });

  return {
    playing: list.find((s) => s.status === "playing") ?? null,
    queued,
    done: list.filter((s) => s.status === "played" || s.status === "rejected"),
  };
}

/**
 * ใส่เพลงเข้าคิวโดยตรง — ใช้ตอนสตรีมเมอร์ใส่เอง ต่อคิวเพลงเก่า หรือระบบหยิบเพลงสำรอง
 *
 * ไม่ผ่านด่านเพดานเหมือน submitSongRequest เพราะคนที่กดคือเจ้าของคิวเอง
 * เพดานพวกนั้นมีไว้กันคนดูสแปม ไม่ได้มีไว้กันเจ้าของ
 */
export async function addSongToQueue(
  channelId: string,
  data: {
    videoId: string;
    title: string;
    author: string;
    url: string;
    byUid: string;
    byName: string;
    message?: string | null;
  },
  source: "streamer" | "filler",
): Promise<string | null> {
  const db = getDb();
  if (!db || !channelId) return null;
  const ref = await addDoc(collection(db, COL, channelId, SONGS), {
    channelId,
    videoId: data.videoId,
    title: (data.title ?? "").slice(0, 140),
    author: (data.author ?? "").slice(0, 80),
    url: data.url,
    byUid: data.byUid,
    byName: (data.byName ?? "").slice(0, 40),
    message: data.message ?? null,
    source,
    status: "queued" as SongStatus,
    createdAt: new Date().toISOString(),
    playedAt: null,
  });
  return ref.id;
}
