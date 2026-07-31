"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { authStore } from "@/lib/backend/firebase";
import { setSongStatus, splitQueue, watchSongQueue } from "@/lib/song/store";
import { thumbUrl } from "@/lib/song/youtube";
import type { SongRequest } from "@/lib/song/types";
import Button from "../ui/Button";
import Panel, { PanelHeader } from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { toast } from "../ui/Toast";
import { EmptyState, Skeleton } from "../tournament/ui";

/**
 * หน้าเล่นเพลงของสตรีมเมอร์
 *
 * ทำไมต้องเป็นหน้าเว็บธรรมดา ไม่ใช่ widget ใน OBS:
 * OBS Browser Source มีคุกกี้แยกของตัวเอง ไม่ได้ล็อกอิน YouTube จึงมีโฆษณาคั่น
 * และ Google มักเด้งหน้ายืนยันตัวตนเวลาพยายามล็อกอินในนั้น
 * เปิดหน้านี้ในเบราว์เซอร์ปกติที่ล็อกอิน Premium อยู่แล้วจะไม่เจอทั้งสองปัญหา
 * แล้วค่อยดึงเสียงเข้า OBS ด้วย Desktop Audio หรือจับหน้าต่างนี้เป็น Window Capture
 *
 * หน้านี้เป็นตัวเดียวที่แตะสถานะเพลง — พอคลิปจบมันจะปิดเพลงเดิมแล้วเปิดเพลงถัดไปเอง
 */

const EMPTY: SongRequest[] = [];

/* ---------- YouTube IFrame API ---------- */

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      height: string;
      width: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: () => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** โหลดสคริปต์ของ YouTube ครั้งเดียวต่อหน้า แล้วแชร์ผลให้ทุกคนที่รอ */
let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
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

export default function SongPlayer() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const reduced = useReducedMotion();

  // ผู้ดูแลเปิดคิวของช่องอื่นได้ด้วยการใส่ #ch= ไม่งั้นใช้ช่องตัวเอง
  const chParam = useHashParam("ch");
  const channelId = chParam ?? (user && !user.anonymous ? user.uid : null);

  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);
  const [ready, setReady] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [auto, setAuto] = useState(true);
  const [volume, setVolume] = useState(70);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /** วิดีโอที่สั่งเล่นไปแล้ว กันสั่งซ้ำทุกครั้งที่คิวอัปเดต */
  const loadedRef = useRef<string | null>(null);
  /**
   * อ่านค่าล่าสุดจากใน callback ของ YouTube ที่ผูกไว้ครั้งเดียวตอนสร้าง player
   * ต้องอัปเดตใน effect ไม่ใช่ตอนเรนเดอร์ — เขียน ref ระหว่างเรนเดอร์ทำให้ผลลัพธ์
   * ไม่แน่นอนเมื่อ React เรนเดอร์ซ้ำแล้วทิ้งผลนั้น
   */
  const stateRef = useRef({ channelId, queue, auto });
  useEffect(() => {
    stateRef.current = { channelId, queue, auto };
  }, [channelId, queue, auto]);

  const { playing, queued, done } = splitQueue(queue);

  /* ---------- คิว ---------- */
  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(channelId, setQueue, {
      onError: () => setQueue(EMPTY),
    });
  }, [channelId]);

  /* ---------- ตัวเล่น ---------- */
  const advance = useCallback(async () => {
    const { channelId: ch, queue: list, auto: on } = stateRef.current;
    if (!ch) return;
    const { playing: cur, queued: next } = splitQueue(list);
    if (cur) await setSongStatus(ch, cur.id, "played");
    if (on && next.length > 0) await setSongStatus(ch, next[0].id, "playing", list);
  }, []);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(el, {
          height: "100%",
          width: "100%",
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => setReady(true),
            onStateChange: (e) => {
              // คลิปจบเอง = ไปเพลงถัดไป (ไม่ใช่ตอนกดหยุดหรือโหลดคลิปใหม่)
              if (e.data === YT.PlayerState.ENDED) void advance();
            },
            // คลิปเสีย/ฝังไม่ได้ ก็ข้ามไปเลย ไม่ให้คิวค้าง
            onError: () => void advance(),
          },
        });
      })
      .catch(() => setApiError(true));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [advance]);

  // สั่งเล่นเมื่อเพลงที่ควรเล่นเปลี่ยนไป
  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    const id = playing?.videoId ?? null;
    if (!id || id === loadedRef.current) return;
    loadedRef.current = id;
    p.loadVideoById(id);
  }, [ready, playing?.videoId]);

  useEffect(() => {
    if (ready) playerRef.current?.setVolume(volume);
  }, [ready, volume]);

  /* ---------- ปุ่ม ---------- */
  const playNext = async () => {
    if (!channelId) return;
    if (queued.length === 0) {
      toast("คิวว่างแล้ว", "info");
      return;
    }
    if (playing) await setSongStatus(channelId, playing.id, "played");
    await setSongStatus(channelId, queued[0].id, "playing", queue);
  };

  const skip = async () => {
    if (!channelId || !playing) return;
    await setSongStatus(channelId, playing.id, "rejected");
    if (queued.length > 0) await setSongStatus(channelId, queued[0].id, "playing", queue);
  };

  if (!channelId) {
    return (
      <EmptyState
        title="ยังไม่รู้ว่าจะเล่นคิวของช่องไหน"
        description="ล็อกอินด้วยบัญชีเจ้าของช่อง หรือใส่รหัสช่องต่อท้ายลิงก์เป็น #ch=รหัสช่อง"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        no="09"
        eyebrow="Player"
        title="เล่นเพลงตามคิว"
        description="เปิดหน้านี้ในเบราว์เซอร์ที่ล็อกอิน YouTube Premium อยู่ แล้วดึงเสียงเข้า OBS — จะได้ไม่มีโฆษณาคั่นกลางไลฟ์"
        meta={`คิว ${queued.length} เพลง`}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel variant="feature" className="overflow-hidden p-0">
          {/* ตัวเล่นต้องอยู่ใน DOM ตลอด ไม่งั้นสร้าง player ใหม่ทุกครั้งที่เปลี่ยนเพลง */}
          <div className="relative aspect-video w-full bg-black">
            <div ref={mountRef} className="absolute inset-0" />

            {!playing && !apiError && (
              <div className="absolute inset-0 grid place-items-center bg-black/70 text-center">
                <div>
                  <p className="slug">Idle</p>
                  <p className="mt-2 text-sm text-muted">
                    ยังไม่มีเพลงที่กำลังเล่น — กด &ldquo;เล่นเพลงถัดไป&rdquo;
                  </p>
                </div>
              </div>
            )}

            {apiError && (
              <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
                <div>
                  <p className="slug" style={{ color: "rgb(var(--st-live))" }}>
                    โหลดตัวเล่นไม่ได้
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-muted">
                    ตัวบล็อกโฆษณาหรือส่วนขยายบางตัวบล็อกสคริปต์ของ YouTube ไว้ —
                    ปิดเฉพาะเว็บนี้แล้วรีเฟรช หรือกดเปิดใน YouTube เอาเอง
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-5">
            {playing ? (
              <>
                <p className="slug" style={{ color: "rgb(var(--st-live))" }}>
                  กำลังเล่น
                </p>
                <h2 className="mt-1.5 font-display text-xl leading-snug font-light text-ice">
                  {playing.title}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {playing.author} · ขอโดย {playing.byName}
                </p>
                {playing.message && (
                  <p className="mt-2 text-sm text-champagne/80">
                    &ldquo;{playing.message}&rdquo;
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">รอเพลงแรก</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button onClick={() => void playNext()}>เล่นเพลงถัดไป</Button>
              <Button variant="ghost" disabled={!playing} onClick={() => void skip()}>
                ข้ามเพลงนี้
              </Button>
              <a
                href={playing?.url ?? "https://www.youtube.com"}
                target="_blank"
                rel="noreferrer noopener"
                className="font-display text-xs text-champagne hover:underline"
              >
                เปิดใน YouTube →
              </a>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span className="slug slug-2 shrink-0">เสียง</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1"
                aria-label="ระดับเสียง"
              />
              <span className="num w-9 text-right text-xs text-muted">{volume}</span>
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              เล่นเพลงถัดไปอัตโนมัติเมื่อเพลงจบ
            </label>
          </div>
        </Panel>

        <Panel className="p-5">
          <PanelHeader eyebrow="Queue" title="คิวถัดไป" count={queued.length} />

          {!ready && !apiError && <Skeleton className="h-16 w-full" />}

          {queued.length === 0 ? (
            <EmptyState
              title="คิวว่าง"
              description="ส่งลิงก์หน้าขอเพลงให้คนดู แล้วเพลงจะเข้ามาที่นี่เอง"
            />
          ) : (
            <ul className="space-y-2">
              {queued.map((s, i) => (
                <motion.li
                  key={s.id}
                  layout={!reduced}
                  className="tile flex items-center gap-3 rounded-xl p-2.5"
                >
                  <span className="fig text-outline w-6 shrink-0 text-center text-lg">
                    {i + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(s.videoId)}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="h-9 w-16 shrink-0 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ice">{s.title}</span>
                    <span className="block truncate text-xs text-muted">
                      ขอโดย {s.byName}
                    </span>
                  </span>
                </motion.li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <p className="mt-4 text-xs text-muted">เล่นจบแล้ว {done.length} เพลง</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
