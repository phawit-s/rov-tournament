"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLive } from "@/lib/backend/live";
import { NEUTRAL_PALETTE, loadArtPalette, type ArtPalette } from "@/lib/song/artwork";
import { watchOpenQueueCheap } from "@/lib/song/snapshot";
import { watchNowPlaying, watchSongQueue } from "@/lib/song/store";
import type { SongRequest } from "@/lib/song/types";
import { thumbUrl } from "@/lib/song/youtube";

const NONE: SongRequest[] = [];

/**
 * เพลงที่กำลังเล่นของช่องแบบสด — ถูกกว่า useOpenQueue มาก (ดู watchNowPlaying)
 * ใช้ตรงที่ต้องการแค่ "ตอนนี้เล่นอะไร" ไม่ต้องรู้คิวทั้งก้อน เช่นการ์ดช่องในหน้าแรก
 */
export function useNowPlaying(channelId: string | null | undefined): SongRequest | null {
  const { data } = useLive<SongRequest | null>(
    channelId ? `songs:playing:${channelId}` : null,
    null,
    (onChange, onError) => watchNowPlaying(channelId ?? "", onChange, () => onError()),
  );
  return data;
}

/**
 * คิวที่ยังไม่จบของช่อง (กำลังเล่น + รอคิว) แบบสด
 *
 * ใช้ท่อร่วม (useLive) — หลายที่ในหน้าเดียวขอช่องเดียวกันก็เปิด listener ท่อเดียว
 * ขอแค่ใบที่ยังไม่จบ ให้ตรงกับสิทธิ์อ่านสาธารณะ และไม่ลากประวัติหลายพันใบมาด้วย
 *
 * mode
 *   "cheap" (หน้าที่คนดูเปิด) — อ่านคิวสรุปใบเดียว ใบไม่สดค่อยฟังคิวจริง (lib/song/snapshot.ts)
 *           ช้ากว่าคิวจริงราวหนึ่งวินาที แลกกับค่าอ่านครั้งเดียวแทนเท่าจำนวนเพลง
 *   "exact" (หน้าสตูดิโอของเจ้าของ) — ฟังคิวจริง เห็นผลการจัดคิวของตัวเองทันที
 */
export function useOpenQueue(
  channelId: string | null | undefined,
  mode: "exact" | "cheap" = "exact",
): {
  queue: SongRequest[];
  loaded: boolean;
  error: boolean;
} {
  const [failed, setFailed] = useState<string | null>(null);
  const { data, loaded } = useLive<SongRequest[]>(
    channelId ? `songs:open:${mode}:${channelId}` : null,
    NONE,
    (onChange, onError) => {
      const fail = () => {
        setFailed(channelId ?? null);
        onError();
      };
      return mode === "cheap"
        ? watchOpenQueueCheap(channelId ?? "", onChange, fail)
        : watchSongQueue(channelId ?? "", onChange, { onlyOpen: true, onError: fail });
    },
  );
  return { queue: data, loaded, error: !!channelId && failed === channelId };
}

/**
 * ดูดสีจากปกเพลง
 *
 * เริ่มที่สีกลางแล้วค่อยเปลี่ยนเมื่อรูปโหลดเสร็จ ระหว่างเปลี่ยนเพลงให้ค้างสีเดิมไว้
 * ถ้าเด้งกลับเทาแล้วค่อยเข้าสีใหม่ จะเห็นเทาแวบหนึ่งทุกครั้งที่เปลี่ยนเพลง
 */
export function useArtPalette(videoId: string | null | undefined): ArtPalette {
  const [loaded, setLoaded] = useState<ArtPalette | null>(null);

  useEffect(() => {
    if (!videoId) return;
    const ac = new AbortController();
    void loadArtPalette(thumbUrl(videoId, "mq"), ac.signal).then((p) => {
      if (!ac.signal.aborted) setLoaded(p);
    });
    // เพลงเปลี่ยนก่อนรูปเก่าโหลดเสร็จ ต้องทิ้งผลเก่า ไม่งั้นสีเก่าจะมาทับเพลงใหม่
    return () => ac.abort();
  }, [videoId]);

  return videoId ? (loaded ?? NEUTRAL_PALETTE) : NEUTRAL_PALETTE;
}

/**
 * สีพื้นของ "เวที" (กล่องเพลงที่กำลังเล่น) จากสีปก
 *
 * ผสมสีปกเข้ากับแผ่น (paper) 24% — สว่างยังเป็นพื้นอ่อน มืดยังเป็นพื้นเข้ม
 * ตัวหนังสือสีหลัก (ดำ/ขาว) อ่านออกเสมอโดยไม่ต้องคำนวณคอนทราสต์ต่อเพลง
 * ผสมกับ paper ไม่ใช่ canvas — พื้นหน้าเป็นเทาแล้ว เวทีต้องสว่างกว่าพื้นถึงจะดูยกขึ้นมา
 * ไม่มีเพลง = แผ่นเปล่า
 */
export function stageStyle(palette: ArtPalette, hasSong: boolean): CSSProperties {
  return {
    background: hasSong
      ? `color-mix(in oklab, ${palette.glow} 24%, var(--c-paper))`
      : "var(--c-paper)",
    transition: "background-color 600ms ease, background 600ms ease",
  };
}
