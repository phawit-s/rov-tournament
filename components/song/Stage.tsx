"use client";

import { useState, type ReactNode } from "react";
import { useNow } from "@/hooks/useClient";
import { stageStyle, useArtPalette } from "@/hooks/useSong";
import { formatClock, isStalePlayback, playbackProgress } from "@/lib/song/progress";
import type { SongRequest } from "@/lib/song/types";
import Cover from "../ui/Cover";

/**
 * เวที — เพลงที่กำลังเล่น
 *
 * ของชิ้นเดียวในเว็บที่มีสี: พื้นย้อมจากปกเพลง (docs/DESIGN.md ข้อ 1)
 * ปกใหญ่ ชื่อเพลงหนา คนขอ และแถบเวลาที่เดินจริง
 * ไม่มีเพลง = พื้นเทาเรียบ พร้อมข้อความที่บอกว่าต้องทำอะไร (`empty`)
 */
export default function Stage({
  song,
  empty,
  layout = "stack",
  footer,
}: {
  song: SongRequest | null;
  empty?: ReactNode;
  /** stack = ปกอยู่บน (มือถือ/คอลัมน์แคบ) · side = ปกอยู่ซ้าย (จอกว้าง) */
  layout?: "stack" | "side";
  footer?: ReactNode;
}) {
  const palette = useArtPalette(song?.videoId);

  return (
    <section
      aria-label="เพลงที่กำลังเล่น"
      className="rounded-stage p-4 sm:p-5"
      style={stageStyle(palette, !!song)}
    >
      {song ? (
        <div
          key={song.id}
          className={`rise-in ${layout === "side" ? "flex flex-col gap-5 sm:flex-row sm:items-center" : ""}`}
        >
          <Cover
            videoId={song.videoId}
            size="lg"
            priority
            className={layout === "side" ? "w-full sm:w-64" : "w-full"}
          />
          <div className={`min-w-0 ${layout === "side" ? "flex-1" : "mt-4 px-1"}`}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <EqBars />
              กำลังเล่น
            </p>
            <p className="mt-1.5 line-clamp-2 text-title font-bold">{song.title}</p>
            {song.author && <p className="mt-0.5 truncate text-muted">{song.author}</p>}
            <p className="mt-2 truncate text-sm text-muted">
              {song.source === "filler" ? (
                "เพลงสำรองของช่อง"
              ) : (
                <>
                  ขอโดย <span className="font-medium text-ink">{song.byName}</span>
                </>
              )}
            </p>
            <PlaybackBar song={song} />
          </div>
        </div>
      ) : (
        <div className="px-1 py-6">{empty ?? <p className="text-muted">ยังไม่มีเพลงที่กำลังเล่น</p>}</div>
      )}
      {footer}
    </section>
  );
}

/**
 * แถบเวลาของเพลง — วิ่งด้วย CSS ล้วน (ดู .bar-run ใน globals.css)
 *
 * ตำแหน่งเริ่มของแถบ (animation-delay ติดลบ) คิดครั้งเดียวตอนแถบขึ้นจอ
 * ห้ามคิดใหม่ทุกวินาที — เปลี่ยน delay กลางทาง เบราว์เซอร์ถือว่าตั้งค่านั้นมาตั้งแต่ต้น
 * แถบจะกระโดดไปข้างหน้าอีกหนึ่งวินาทีทุกวินาที = วิ่งเร็วเป็นสองเท่า
 * key ผูกกับเพลง เวลาเริ่ม และความยาว — อย่างใดเปลี่ยน แถบเริ่มคิดใหม่เอง
 * ที่เดินทุกวินาทีมีแค่ตัวเลขเวลา (Clock)
 */
export function PlaybackBar({ song }: { song: SongRequest }) {
  const now = useNow(1000);
  const p = playbackProgress(song, now);
  if (!p) return null;
  if (isStalePlayback(song, now)) return null;

  return (
    <div className="mt-4">
      <RunBar key={`${song.id}:${song.playedAt}:${song.duration}`} song={song} />
      <div className="num mt-1.5 flex justify-between text-xs text-muted">
        <span>{formatClock(p.elapsed)}</span>
        <span>-{formatClock(p.duration - p.elapsed)}</span>
      </div>
    </div>
  );
}

function RunBar({ song }: { song: SongRequest }) {
  const [p] = useState(() => playbackProgress(song, Date.now()));
  if (!p) return null;
  return (
    <span className="relative block h-1 overflow-hidden rounded-full bg-ink/12">
      <span
        className="bar-run absolute inset-0 rounded-full bg-ink"
        style={{
          animationDuration: `${p.duration}s`,
          animationDelay: p.delay,
          // ใช้เฉพาะตอนผู้ใช้ปิดแอนิเมชัน แถบจะค้างที่ตำแหน่งจริงแทน
          ["--at" as string]: p.ratio.toFixed(3),
        }}
      />
    </span>
  );
}

/** แถบเสียงเต้นสามแท่ง — บอกว่า "กำลังเล่นอยู่จริง" */
export function EqBars({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-[2px] ${className}`} aria-hidden>
      {[0, 0.25, 0.5].map((d) => (
        <span
          key={d}
          className="eq-bar h-full w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </span>
  );
}
