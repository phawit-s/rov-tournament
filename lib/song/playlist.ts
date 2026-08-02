"use client";

import { lookupVideo } from "./youtube";
import { loadYouTubeApi, type YTPlayer } from "./yt-api";
import type { FillerTrack } from "./types";

/**
 * ดึงรายชื่อเพลงจากเพลย์ลิสต์ YouTube โดยไม่ต้องใช้ API key
 *
 * ทางที่ทุกคนคิดถึงก่อนคือ YouTube Data API ซึ่งต้องมีคีย์ของ Google
 * และเปิดเผยไม่ได้ในเว็บ static แถมยังอ่านเพลย์ลิสต์แบบ Mix (RD...) ไม่ได้ด้วย
 *
 * แต่ตัวเล่นฝัง (IFrame API) โหลดเพลย์ลิสต์ได้เองอยู่แล้ว รวมถึง Mix
 * และเปิดเมธอด getPlaylist() ให้อ่านรายการออกมาเป็นไอดีคลิป
 * เลยยืมมันมาทำหน้าที่นี้แทน — สร้างตัวเล่นซ่อนไว้ ปิดเสียง สั่ง cue
 * (cue ไม่ใช่ play คลิปจึงไม่ดังออกลำโพงระหว่างนำเข้า) แล้วอ่านรายการ
 *
 * ข้อจำกัดที่ต้องรู้: เพลย์ลิสต์แบบ Mix เป็นของที่ YouTube ปั้นให้แต่ละคน
 * รายการที่ได้จึงเป็นภาพ ณ ตอนนำเข้า ไม่ใช่ของที่อัปเดตตามตลอด
 * ซึ่งพอดีกับการเอามาทำกองเพลงสำรอง
 */

/** ดึง id เพลย์ลิสต์จากลิงก์ — รองรับทั้งลิงก์คลิปที่มี &list= และหน้าเพลย์ลิสต์ */
export function playlistIdFrom(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // ใส่ id มาโดดๆ ก็รับ (PL... UU... RD... OL... FL...)
  if (/^[A-Za-z0-9_-]{12,50}$/.test(text) && /^(PL|UU|RD|OL|FL|LL)/.test(text)) {
    return text;
  }

  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(url.hostname)) {
      return null;
    }
    const list = url.searchParams.get("list");
    return list && list.length >= 2 ? list : null;
  } catch {
    return null;
  }
}

/** อ่านไอดีคลิปทั้งหมดในเพลย์ลิสต์ ผ่านตัวเล่นซ่อนที่ปิดเสียงไว้ */
export function fetchPlaylistVideoIds(
  listId: string,
  timeoutMs = 15000,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let host: HTMLDivElement | null = null;
    let player: YTPlayer | null = null;
    let poll = 0;
    let done = false;

    const cleanup = () => {
      window.clearInterval(poll);
      try {
        player?.destroy();
      } catch {
        /* ตัวเล่นอาจถูกถอดไปแล้ว ไม่เป็นไร */
      }
      host?.remove();
    };
    const finish = (ids: string[]) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ids);
    };
    const die = (err: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };

    loadYouTubeApi()
      .then((YT) => {
        if (done) return;
        host = document.createElement("div");
        // ต้องอยู่ใน DOM จริงตัวเล่นถึงจะทำงาน ซ่อนด้วยการดันออกนอกจอแทน display:none
        host.style.cssText =
          "position:fixed;left:-9999px;top:0;width:200px;height:120px;pointer-events:none";
        document.body.appendChild(host);

        player = new YT.Player(host, {
          height: "120",
          width: "200",
          events: {
            onReady: () => {
              player?.mute();
              player?.cuePlaylist({ list: listId, listType: "playlist" });
              /* รายการไม่ได้มาทันทีหลัง cue ต้องคอยถามจนกว่าจะมี
                 ไม่มี event ไหนบอกว่า "รายการพร้อมแล้ว" โดยเฉพาะ */
              poll = window.setInterval(() => {
                let list: string[] | null = null;
                try {
                  list = player?.getPlaylist() ?? null;
                } catch {
                  list = null;
                }
                if (Array.isArray(list) && list.length > 0) finish(list);
              }, 350);
            },
            onError: () => die(new Error("playlist-error")),
          },
        });

        window.setTimeout(() => die(new Error("playlist-timeout")), timeoutMs);
      })
      .catch(() => die(new Error("yt-api-blocked")));
  });
}

/**
 * นำเข้าเพลย์ลิสต์ทั้งชุดเป็นรายการเพลงพร้อมชื่อ
 *
 * ชื่อคลิปต้องถามทีละตัวจาก oEmbed ยิงพร้อมกันทีเดียวห้าสิบเส้นเสี่ยงโดนจำกัดอัตรา
 * จึงแบ่งเป็นก้อนละ 6 แล้วรายงานความคืบหน้าไปด้วย คนกดจะได้ไม่คิดว่าค้าง
 */
export async function importPlaylist(
  listId: string,
  limit: number,
  onProgress?: (done: number, total: number) => void,
): Promise<FillerTrack[]> {
  const ids = (await fetchPlaylistVideoIds(listId)).slice(0, limit);
  const out: FillerTrack[] = [];
  const CHUNK = 6;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = await Promise.all(ids.slice(i, i + CHUNK).map((v) => lookupVideo(v)));
    for (const info of part) {
      // คลิปที่ถูกลบหรือตั้งเป็นส่วนตัวจะคืน null — ข้ามไปเลย ใส่ไปก็เล่นไม่ได้
      if (info) {
        out.push({ videoId: info.videoId, title: info.title, author: info.author });
      }
    }
    onProgress?.(Math.min(i + CHUNK, ids.length), ids.length);
  }

  return out;
}
