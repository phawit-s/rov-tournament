"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "@/lib/backend/firebase";
import { restQueryEq, restQueryIn } from "@/lib/backend/firestore-rest";
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
  /** fromCache = SDK ตอบจากแคชเพราะยังไม่ได้คำตอบจากเซิร์ฟเวอร์ (ต่อไม่ติด/กำลังต่อ) */
  onChange: (list: SongRequest[], fromCache: boolean) => void,
  options?: { onlyOpen?: boolean; onError?: (e: Error) => void },
): () => void {
  const db = getDb();
  if (!db || !channelId) {
    // ไม่มีอะไรให้รอ คิวว่างนี่คือคำตอบจริง ไม่ใช่ของค้างในแคช
    onChange(EMPTY, false);
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
      onChange(list, snap.metadata.fromCache);
    },
    (err) => options?.onError?.(err),
  );
}

/**
 * คิวที่ยังไม่จบ อ่านผ่าน REST ครั้งเดียว — ทางสำรองของ widget ตอนสายสดของ SDK ใช้ไม่ได้
 * (เหตุผลอยู่ใน lib/backend/firestore-rest.ts) เงื่อนไขต้องตรงกับ onlyOpen ข้างบน
 */
export async function fetchOpenSongQueue(channelId: string): Promise<SongRequest[]> {
  const list = await restQueryIn<SongRequest>(`${COL}/${channelId}`, SONGS, "status", [
    "queued",
    "playing",
  ]);
  return list.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * เพลงที่กำลังเล่นอยู่ใบเดียวผ่าน REST — กินโควตาอ่านแค่ 1 ครั้ง
 * ทางสำรองของ widget ใช้ถามถี่ๆ แทน fetchOpenSongQueue ที่กินเท่าจำนวนเพลงทั้งคิว
 */
export async function fetchPlayingSong(channelId: string): Promise<SongRequest | null> {
  const [song] = await restQueryEq<SongRequest>(`${COL}/${channelId}`, SONGS, "status", "playing", 1);
  return song ?? null;
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

/**
 * เลื่อนลำดับเพลงในคิว
 *
 * ขึ้น/ลง = สลับคีย์เรียงกับใบที่อยู่ติดกัน วิธีนี้ไม่ต้องเขียนใหม่ทั้งคิว
 * แตะแค่สองใบ และไม่พังถ้ามีใบใหม่แทรกเข้ามาระหว่างนั้น
 *
 * บนสุด = ตั้งคีย์ให้มาก่อนหัวแถวหนึ่งวินาที
 *
 * สลับได้เฉพาะในกลุ่มเดียวกัน — เพลงที่คนขอกับเพลงสำรองอยู่คนละชั้นเสมอ
 * (เพลงสำรองต้องอยู่ท้ายแถวตลอด ไม่งั้นมันจะไปแซงเพลงที่คนดูอุตส่าห์ขอมา)
 */
export async function moveSongInQueue(
  channelId: string,
  queued: SongRequest[],
  songId: string,
  dir: "up" | "down" | "top",
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const isFiller = (s: SongRequest) => s.source === "filler";
  const target = queued.find((s) => s.id === songId);
  if (!target) return;

  // ดูเฉพาะเพื่อนร่วมกลุ่ม จะได้ไม่ข้ามชั้นไปสลับกับอีกกลุ่ม
  const group = queued.filter((s) => isFiller(s) === isFiller(target));
  const at = group.findIndex((s) => s.id === songId);
  if (at < 0) return;

  const write = (id: string, key: string) =>
    setDoc(doc(db, COL, channelId, SONGS, id), { orderKey: key }, { merge: true });

  if (dir === "top") {
    if (at === 0) return;
    const head = group[0];
    const headAt = Date.parse(sortKeyOf(head));
    const key = Number.isFinite(headAt)
      ? new Date(headAt - 1000).toISOString()
      : new Date(0).toISOString();
    await write(target.id, key);
    return;
  }

  const other = group[dir === "up" ? at - 1 : at + 1];
  if (!other) return;
  /* อ่านคีย์ทั้งสองให้ครบก่อนค่อยเขียน — ถ้าอ่านสลับกับเขียน
     ค่าที่อ่านทีหลังอาจกลายเป็นค่าที่เพิ่งเขียนไป แล้วสองใบจะได้คีย์เท่ากันจนไม่สลับ */
  const keyTarget = sortKeyOf(target);
  const keyOther = sortKeyOf(other);
  await Promise.all([write(target.id, keyOther), write(other.id, keyTarget)]);
}

/**
 * บันทึกความยาวคลิปที่ตัวเล่นเพิ่งอ่านได้
 *
 * widget เอาไปคู่กับ playedAt เพื่อคำนวณแถบความคืบหน้าเอง
 * โดยไม่ต้องให้ตัวเล่นคอยส่งเวลาปัจจุบันมาทุกวินาที (ซึ่งจะเปลืองทั้งเน็ตและโควตา)
 */
export async function setSongDuration(
  channelId: string,
  songId: string,
  duration: number,
): Promise<void> {
  const db = getDb();
  if (!db || !(duration > 0)) return;
  await setDoc(
    doc(db, COL, channelId, SONGS, songId),
    { duration: Math.round(duration) },
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
/** คีย์ที่ใช้เรียงจริง — ใบที่ยังไม่เคยถูกเลื่อนลำดับก็ใช้เวลาที่ขอไปตามเดิม */
export const sortKeyOf = (s: SongRequest): string => s.orderKey ?? s.createdAt ?? "";

export function splitQueue(list: SongRequest[]) {
  const queued = list
    .filter((s) => s.status === "queued")
    .sort((a, b) => {
      const fa = a.source === "filler" ? 1 : 0;
      const fb = b.source === "filler" ? 1 : 0;
      if (fa !== fb) return fa - fb;
      const byKey = sortKeyOf(a).localeCompare(sortKeyOf(b));
      // คีย์ชนกันได้ถ้าสองใบถูกเลื่อนพร้อมกัน ใช้ id ตัดสินให้ลำดับนิ่ง
      return byKey !== 0 ? byKey : a.id.localeCompare(b.id);
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

/**
 * เพลงที่เล่นจบ/ข้ามไปล่าสุด — ไว้ดูย้อนหลังกับกดเล่นซ้ำ
 *
 * ต่างจาก watchSongQueue ทั้งคอลเลกชันตรงที่อ่านแค่ `max` ใบล่าสุด
 * ช่องที่ไลฟ์ทุกคืนสะสมใบเก่าเป็นพันๆ ใบ (@affarain มีกว่า 5,000 ใบในสองเดือน)
 * อ่านทั้งก้อนทุกครั้งที่เปิดหน้า = โควตาอ่านรายวันของ Firestore หมดในไม่กี่รอบ
 *
 * เรียงด้วย playedAt อย่างเดียว (มีดัชนีให้อยู่แล้ว ไม่ต้องสร้างดัชนีผสม)
 * แล้วค่อยคัดสถานะในเครื่อง — ใบที่ยังรอคิวมี playedAt เป็น null จึงตกไปท้ายแถวเอง
 */
export function watchRecentFinished(
  channelId: string,
  onChange: (list: SongRequest[]) => void,
  max = 40,
  onError?: (e: Error) => void,
): () => void {
  const db = getDb();
  if (!db || !channelId) {
    onChange(EMPTY);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COL, channelId, SONGS), orderBy("playedAt", "desc"), limit(max)),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as SongRequest)
        .filter((s) => s.status === "played" || s.status === "rejected");
      onChange(list);
    },
    (err) => onError?.(err),
  );
}

/**
 * ลบประวัติเพลงที่เล่นจบ/ข้ามไปแล้วของช่องทั้งหมด ทีละก้อน
 *
 * ไม่รับคิวมาจากหน้าจอเหมือน clearFinishedSongs — หน้าจอโหลดประวัติมาแค่บางส่วน
 * ถ้าลบตามนั้นจะเหลือใบเก่าค้างอยู่อีกหลายพัน จึงถามฐานข้อมูลเองทีละ 400 ใบ
 * (batch รับได้ 500 การเขียน) จนไม่เหลือ คืนจำนวนที่ลบไป
 */
export async function clearAllFinishedSongs(channelId: string): Promise<number> {
  const db = getDb();
  if (!db || !channelId) return 0;
  const base = collection(db, COL, channelId, SONGS);
  let removed = 0;
  for (;;) {
    const snap = await getDocs(
      query(base, where("status", "in", ["played", "rejected"]), limit(400)),
    );
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  return removed;
}
