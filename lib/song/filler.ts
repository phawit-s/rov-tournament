"use client";

import type { FillerTrack, SongRequest } from "./types";

/**
 * ตรรกะการเลือกเพลงสำรอง
 *
 * ตัวรายการเก็บอยู่ในเอกสารช่อง (ดู lib/song/config.ts สำหรับการเขียน)
 * ไม่แยกเป็นคอลเลกชันใหม่ เพราะกติกา Firestore เปิดให้เจ้าของแก้เอกสารช่อง
 * อยู่แล้ว ไม่ต้องไปเพิ่มกติกาแล้วรอ publish ใหม่ก่อนถึงจะใช้ได้
 */

/** เพดานจำนวนเพลงสำรอง กันเอกสารช่องบวมจนชนลิมิตของ Firestore */
export const FILLER_LIMIT = 100;

/**
 * เลือกเพลงสำรองเพลงถัดไป
 *
 * โหมดเรียงลำดับ: ไล่ต่อจากเพลงสำรองที่เพิ่งเล่นไป วนกลับมาต้นเมื่อหมดกอง
 * โหมดสุ่ม: เลี่ยงเพลงที่เพิ่งเล่นไปในรอบล่าสุด จะได้ไม่วนเพลงเดิมติดกัน
 *
 * ไม่ใช้ Math.random ตรงๆ ตอนเรนเดอร์ — ตัวนี้ถูกเรียกจากใน effect เท่านั้น
 */
export function pickFiller(
  tracks: FillerTrack[],
  history: SongRequest[],
  mode: "off" | "order" | "shuffle",
): FillerTrack | null {
  if (mode === "off" || tracks.length === 0) return null;

  // เพลงสำรองที่ผ่านไปแล้ว เรียงใหม่สุดอยู่หน้า
  const playedFiller = history
    .filter((s) => s.source === "filler" && s.status !== "queued")
    .sort((a, b) => (b.playedAt ?? b.createdAt ?? "").localeCompare(a.playedAt ?? a.createdAt ?? ""));

  if (mode === "order") {
    const lastId = playedFiller[0]?.videoId;
    const at = lastId ? tracks.findIndex((t) => t.videoId === lastId) : -1;
    return tracks[(at + 1) % tracks.length];
  }

  /* โหมดสุ่ม — กันเพลงซ้ำกับที่เพิ่งผ่านไปครึ่งกอง
     ถ้ากันแล้วไม่เหลืออะไรเลย (กองเล็กมาก) ก็ยอมสุ่มจากทั้งกอง */
  const avoid = new Set(
    playedFiller.slice(0, Math.floor(tracks.length / 2)).map((s) => s.videoId),
  );
  const pool = tracks.filter((t) => !avoid.has(t.videoId));
  const from = pool.length > 0 ? pool : tracks;
  return from[Math.floor(Math.random() * from.length)];
}
