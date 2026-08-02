"use client";

/**
 * ตัวโหลด YouTube IFrame API ที่ใช้ร่วมกันทั้งเว็บ
 *
 * สคริปต์ของ YouTube ต้องโหลดครั้งเดียวต่อหน้า และมันแจ้งกลับผ่าน
 * callback ตัวเดียวชื่อ onYouTubeIframeAPIReady ถ้าใครก็ตามเขียนทับ
 * callback นั้นทีหลัง คนที่รออยู่ก่อนหน้าจะไม่มีวันได้รับแจ้งเลย
 * จึงต้องรวมไว้ที่นี่ที่เดียวแล้วแชร์ promise เดิมให้ทุกคนที่ขอ
 */

export type YTPlayer = {
  loadVideoById: (id: string) => void;
  cuePlaylist: (opts: { list: string; listType: string }) => void;
  getPlaylist: () => string[] | null;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  setVolume: (v: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

export type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      height: string;
      width: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** สถานะจาก YouTube — ประกาศเองเพราะต้องใช้ก่อนสคริปต์โหลดเสร็จ */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("yt-api-missing"));
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => reject(new Error("yt-api-blocked"));
    document.head.appendChild(tag);
  });
  return apiPromise;
}
