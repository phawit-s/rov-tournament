"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { authStore } from "@/lib/backend/firebase";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import {
  claimPlayerLock,
  playerInstanceId,
  type LockHandle,
  type LockState,
} from "@/lib/song/player-lock";
import { pickFiller } from "@/lib/song/filler";
import {
  addSongToQueue,
  setSongStatus,
  splitQueue,
  watchSongQueue,
} from "@/lib/song/store";
import { thumbUrl, watchUrl } from "@/lib/song/youtube";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/song/yt-api";
import type { FillerTrack, SongRequest } from "@/lib/song/types";
import Button from "../ui/Button";
import Panel, { PanelHeader } from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { EmptyState, Skeleton } from "../tournament/ui";
import SongConsole from "./SongConsole";

/**
 * ตัวเล่นเพลงตามคิว — เดินเอง ไม่ต้องมีใครกด
 *
 * คิวมาถึง = เล่นเลย เพลงจบ = ต่อเพลงถัดไปเอง คลิปเสียก็ข้ามให้
 * ปุ่มที่เหลือ (ข้าม/หยุด) เป็นทางออกฉุกเฉิน ไม่ใช่ทางเดินปกติ
 *
 * ข้อจำกัดเดียวที่เลี่ยงไม่ได้คือกฎ autoplay ของเบราว์เซอร์ —
 * ถ้ายังไม่เคยมีใครคลิกอะไรในหน้านั้นเลย เบราว์เซอร์จะไม่ยอมให้เล่นมีเสียง
 * ตรงนั้นเลยต้องมีแผ่นให้แตะหนึ่งครั้ง หลังจากนั้นทั้งแท็บเดินเองยาว
 *
 * ห้ามเปิดใน OBS Browser Source — มันมีคุกกี้แยก ไม่ได้ล็อกอิน YouTube เลยมีโฆษณาคั่น
 * ให้เปิดในเบราว์เซอร์ปกติแล้วดึงเสียงเข้า OBS ทาง Desktop Audio
 */

const EMPTY: SongRequest[] = [];
const VOLUME_KEY = "tourney-hub/song/volume";

function readVolume(): number {
  if (typeof window === "undefined") return 70;
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 70;
}

/* =========================================================================
   ตัวเล่น — ใช้ได้ทั้งฝังในหน้าช่องและเปิดเป็นหน้าเต็ม
   ========================================================================= */

export function SongPlayerCore({
  channelId,
  compact = false,
  filler,
  fillerMode = "off",
}: {
  channelId: string;
  /** true = ฝังอยู่ในหน้าอื่น ไม่ต้องโชว์คิวซ้ำกับที่หน้านั้นมีอยู่แล้ว */
  compact?: boolean;
  /** เพลย์ลิสต์สำรอง — ใส่มาแล้วคิวจะไม่มีวันว่างจนเงียบทั้งไลฟ์ */
  filler?: FillerTrack[];
  fillerMode?: "off" | "order" | "shuffle";
}) {
  const reduced = useReducedMotion();
  // ต้องรู้ว่าใครล็อกอินอยู่ ตอนต่อเพลงสำรองต้องแปะ uid ไปกับใบ
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);
  const [ready, setReady] = useState(false);
  const [apiError, setApiError] = useState(false);
  /** เบราว์เซอร์ไม่ยอมให้เล่นเองเพราะยังไม่มีใครแตะหน้านี้ */
  const [blocked, setBlocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  /** มีอีกแท็บเล่นอยู่ไหม — ถ้ามี แท็บนี้ต้องเงียบ ไม่งั้นเสียงซ้อนกันออกไลฟ์ */
  const [lock, setLock] = useState<LockState>("leader");

  const lockRef = useRef<LockHandle | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /**
   * คำขอที่สั่งเล่นไปแล้ว — เก็บ id ของ "ใบคำขอ" ไม่ใช่ videoId
   *
   * ถ้าเก็บ videoId พอมีคนขอคลิปเดิมซ้ำ (ซึ่งทำได้ เพราะด่านกันซ้ำนับเฉพาะ
   * เพลงที่ยังอยู่ในคิว) ระบบจะเห็นว่า "ก็เพลงเดิม" แล้วไม่สั่งเล่นใหม่
   * ตัวเล่นค้างที่จอจบของรอบก่อน ไม่มี ENDED ยิงอีก คิวหยุดเดินถาวร
   */
  const loadedRef = useRef<string | null>(null);
  /** คนกดหยุดเอง — ต่างจากโดนสั่งหยุดเพราะเสียสิทธิ์ ต้องไม่ไปสั่งเล่นต่อทับเจตนา */
  const manualPauseRef = useRef(false);
  /** เพลงที่กำลังยิงคำสั่งโปรโมตอยู่ กัน snapshot ยิงซ้ำแล้วเขียนซ้ำ */
  const promotingRef = useRef<string | null>(null);
  const blockTimerRef = useRef<number | null>(null);

  const stateRef = useRef({ channelId, queue, active: true });
  useEffect(() => {
    stateRef.current = { channelId, queue, active: lock === "leader" };
  }, [channelId, queue, lock]);

  const { playing, queued, done } = useMemo(() => splitQueue(queue), [queue]);
  /** แท็บนี้เป็นคนคุมคิวจริงไหม ผู้ชมห้ามทั้งเล่นและห้ามเดินคิว */
  const active = lock === "leader";

  /* ---------- คิว ---------- */
  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(channelId, setQueue, {
      onError: () => setQueue(EMPTY),
    });
  }, [channelId]);

  /* ---------- ใครเป็นคนเล่น ---------- */
  useEffect(() => {
    // อ่านชื่อในนี้ ไม่ใช่ตอนเรนเดอร์ — Math.random/sessionStorage ตอนเรนเดอร์ผิดกฎ purity
    const handle = claimPlayerLock(playerInstanceId(), setLock);
    lockRef.current = handle;
    return () => {
      handle.stop();
      lockRef.current = null;
    };
  }, []);

  /* ---------- เดินคิวเอง ---------- */

  /**
   * ปิดเพลงที่จบแล้วและดันเพลงถัดไปขึ้นมา
   *
   * endedId คือ id ใบคำขอที่เพิ่งจบ ถ้าตอนนี้ใบที่กำลังเล่นไม่ใช่ตัวนั้นแล้ว
   * แปลว่ามีคนอื่น (อีกแท็บ หรือหน้า /player/ ที่เปิดค้างไว้) เดินคิวไปก่อนแล้ว
   * ต้องไม่เดินซ้ำ ไม่งั้นเพลงถัดไปจะโดนข้ามทิ้งโดยไม่มีใครได้ฟัง
   *
   * เทียบด้วย id ของใบ ไม่ใช่ videoId เพราะคลิปเดียวกันถูกขอซ้ำได้หลายใบ
   */
  const advance = useCallback(async (endedId?: string) => {
    const { channelId: ch, queue: list, active: on } = stateRef.current;
    if (!ch || !on) return;
    const { playing: cur, queued: next } = splitQueue(list);
    if (endedId && cur?.id !== endedId) return;
    if (cur) await setSongStatus(ch, cur.id, "played");
    if (next.length > 0) await setSongStatus(ch, next[0].id, "playing", list);
  }, []);

  /** ไม่มีเพลงเล่นอยู่แต่มีคนรอคิว = ดันขึ้นมาเล่นเลย ไม่ต้องรอใครกด */
  useEffect(() => {
    if (!channelId || !active || playing) {
      promotingRef.current = null;
      return;
    }
    const next = queued[0];
    if (!next || promotingRef.current === next.id) return;
    promotingRef.current = next.id;
    void setSongStatus(channelId, next.id, "playing", queue).catch(() => {
      // เขียนไม่ผ่าน (เน็ตหลุด/สิทธิ์) — ปลดล็อกไว้ให้ลองใหม่รอบหน้า
      promotingRef.current = null;
    });
  }, [channelId, active, playing, queued, queue]);

  /**
   * คิวว่างสนิท = หยิบเพลงสำรองมาต่อให้ ไลฟ์จะได้ไม่เงียบ
   *
   * ใส่เป็นใบจริงในคิวเลย ไม่ได้เล่นลอยๆ widget กับคนดูจะได้เห็นว่ากำลังเล่นอะไร
   * และเพราะ splitQueue จัดให้เพลงสำรองอยู่ท้ายแถวเสมอ พอมีคนขอเข้ามา
   * เพลงของเขาจะได้คิวก่อนเพลงสำรองที่ยังไม่ได้เล่นโดยอัตโนมัติ
   */
  const fillingRef = useRef(false);
  useEffect(() => {
    if (!channelId || !active || playing || queued.length > 0) return;
    if (fillerMode === "off" || !filler?.length || fillingRef.current) return;

    const pick = pickFiller(filler, queue, fillerMode);
    // กติกาบังคับให้ byUid ตรงกับคนที่เขียน ยังไม่ล็อกอินก็เขียนไม่ได้
    const uid = authStore.user()?.uid;
    if (!pick || !uid) return;

    fillingRef.current = true;
    void addSongToQueue(
      channelId,
      {
        videoId: pick.videoId,
        title: pick.title,
        author: pick.author,
        url: watchUrl(pick.videoId),
        byUid: uid,
        byName: "เพลย์ลิสต์สำรอง",
      },
      "filler",
    ).finally(() => {
      fillingRef.current = false;
    });
  }, [channelId, active, playing, queued.length, queue, filler, fillerMode]);

  /* ---------- ตัวเล่น ---------- */
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
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => setReady(true),
            onStateChange: (e) => {
              if (e.data === YT_STATE.PLAYING) {
                setBlocked(false);
                setPaused(false);
                if (blockTimerRef.current) {
                  window.clearTimeout(blockTimerRef.current);
                  blockTimerRef.current = null;
                }
              }
              if (e.data === YT_STATE.PAUSED) setPaused(true);
              // คลิปจบเอง = ไปเพลงถัดไป (ไม่ใช่ตอนกดหยุดหรือโหลดคลิปใหม่)
              if (e.data === YT_STATE.ENDED) void advance(loadedRef.current ?? undefined);
            },
            // คลิปเสีย/เจ้าของปิดการฝัง ก็ข้ามไปเลย ไม่ให้คิวค้าง
            onError: () => void advance(loadedRef.current ?? undefined),
            /* หมายเหตุ: loadedRef เก็บ id ใบคำขอ ไม่ใช่ videoId
               advance จึงเทียบใบต่อใบได้ตรงตัว แม้คลิปเดียวกันถูกขอซ้ำ */
          },
        });
      })
      .catch(() => setApiError(true));

    return () => {
      cancelled = true;
      if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [advance]);

  /*
    ปรับตัวเล่นให้ตรงกับคิวเสมอ

    ตัวนี้ไม่ใช่แค่ "สั่งเล่นตอนเพลงเปลี่ยน" แต่เป็นตัวที่ทำให้สิ่งที่ได้ยิน
    ตรงกับสิ่งที่คิวบอกทุกกรณี — รวมถึงกรณีที่เพลงไม่เปลี่ยนแต่บริบทเปลี่ยน
    (เพิ่งได้สิทธิ์คืนแล้วคลิปยังค้าง pause อยู่ / คิวว่างแล้วแต่เสียงยังดังต่อ)
  */
  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;

    // แท็บผู้ชมต้องเงียบสนิท ไม่งั้นเสียงซ้อนกับแท็บที่กำลังเล่นจริง
    if (!active) {
      p.pauseVideo();
      return;
    }

    // ไม่มีเพลงที่ควรเล่น = ต้องหยุดจริง ไม่ใช่ปล่อยคลิปเดิมดังต่อออกไลฟ์
    if (!playing) {
      if (loadedRef.current !== null) {
        loadedRef.current = null;
        manualPauseRef.current = false;
        p.pauseVideo();
      }
      return;
    }

    // ใบเดิม แต่คลิปอาจถูกสั่งหยุดไว้ตอนเสียสิทธิ์ — สั่งเล่นต่อให้เอง
    if (playing.id === loadedRef.current) {
      if (manualPauseRef.current) return;
      const state = p.getPlayerState();
      const moving = state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING;
      if (!moving && state !== YT_STATE.ENDED) p.playVideo();
      return;
    }

    loadedRef.current = playing.id;
    manualPauseRef.current = false;
    p.loadVideoById(playing.videoId);

    /*
      กฎ autoplay: ถ้าคนยังไม่เคยแตะอะไรในหน้านี้ เบราว์เซอร์จะเงียบไปเฉยๆ
      ไม่มี error ให้จับ ต้องดูสถานะเองว่าผ่านไปสองวินาทีแล้วขยับไหม
    */
    if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
    blockTimerRef.current = window.setTimeout(() => {
      if (manualPauseRef.current) return;
      const state = playerRef.current?.getPlayerState();
      const moving = state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING;
      if (!moving) setBlocked(true);
    }, 2200);
  }, [ready, active, playing]);

  useEffect(() => {
    if (ready) playerRef.current?.setVolume(volume);
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* โหมดส่วนตัวเขียนไม่ได้ ไม่ใช่เรื่องคอขาดบาดตาย */
    }
  }, [ready, volume]);

  /* ---------- ทางออกฉุกเฉิน ---------- */
  const start = () => {
    setBlocked(false);
    manualPauseRef.current = false;
    playerRef.current?.playVideo();
  };

  const togglePause = () => {
    const p = playerRef.current;
    if (!p) return;
    // จำเจตนาไว้ ไม่งั้นตัวปรับให้ตรงกับคิวจะสั่งเล่นต่อทับทันที
    manualPauseRef.current = !paused;
    if (paused) p.playVideo();
    else p.pauseVideo();
  };

  const skip = async () => {
    if (!playing) return;
    await setSongStatus(channelId, playing.id, "rejected");
    if (queued.length > 0) {
      await setSongStatus(channelId, queued[0].id, "playing", queue);
    }
  };

  const stage = (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {/* ตัวเล่นต้องอยู่ใน DOM ตลอด ไม่งั้นสร้าง player ใหม่ทุกครั้งที่เปลี่ยนเพลง */}
      <div ref={mountRef} className="absolute inset-0" />

      {!playing && !apiError && active && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
          <div>
            <p className="slug">รอเพลง</p>
            <p className="mt-2 text-sm text-muted">
              คิวว่างอยู่ — มีคนขอเพลงเข้ามาเมื่อไหร่ ตัวเล่นจะเริ่มเองทันที
            </p>
          </div>
        </div>
      )}

      {/* อีกแท็บถือสิทธิ์เล่นอยู่ — แท็บนี้เงียบไว้ กันเสียงซ้อน */}
      {!active && !apiError && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center">
          <div>
            <p className="slug">อีกหน้าต่างกำลังเล่นอยู่</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              ปิดเสียงตรงนี้ไว้ไม่ให้ซ้อนกัน — คิวยังเดินตามปกติจากหน้าต่างนั้น
            </p>
            {/* ต้องผ่าน takeOver ของตัวคุมล็อก ไม่ใช่ setLock เอง
                ไม่งั้นสถานะข้างในโมดูลกับบนจอจะไม่ตรงกัน แล้วสองแท็บจะเล่นซ้อน */}
            <Button
              size="sm"
              className="mt-4"
              onClick={() => lockRef.current?.takeOver()}
            >
              ย้ายมาเล่นที่นี่
            </Button>
          </div>
        </div>
      )}

      {/* แผ่นแตะครั้งเดียว โผล่เฉพาะตอนเบราว์เซอร์ไม่ยอมให้เล่นเอง */}
      {blocked && playing && active && !apiError && (
        <button
          type="button"
          onClick={start}
          className="absolute inset-0 grid cursor-pointer place-items-center bg-black/85 px-6 text-center backdrop-blur-sm"
        >
          <span>
            <span
              className="mx-auto grid h-16 w-16 place-items-center rounded-full"
              style={{ background: "rgb(var(--st-live) / 0.9)" }}
            >
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-black" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="mt-4 block font-display text-base text-ice">
              แตะครั้งเดียวเพื่อเริ่ม
            </span>
            <span className="mx-auto mt-1.5 block max-w-xs text-xs text-muted">
              เบราว์เซอร์ไม่ยอมให้เล่นเสียงเองจนกว่าจะมีคนแตะหน้านี้สักครั้ง
              หลังจากนี้เดินเองยาว ไม่ต้องกดอีก
            </span>
          </span>
        </button>
      )}

      {apiError && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center">
          <div>
            <p className="slug" style={{ color: "rgb(var(--st-live))" }}>
              โหลดตัวเล่นไม่ได้
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              ตัวบล็อกโฆษณาหรือส่วนขยายบางตัวบล็อกสคริปต์ของ YouTube ไว้ —
              ปิดเฉพาะเว็บนี้แล้วรีเฟรช
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const controls = (
    <>
      {playing ? (
        <>
          <p className="slug" style={{ color: "rgb(var(--st-live))" }}>
            กำลังเล่น
          </p>
          <h2
            className={`mt-1.5 font-display leading-snug font-light text-ice ${
              compact ? "text-base" : "text-xl"
            }`}
          >
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
        <p className="text-sm text-muted">
          {queued.length > 0 ? "กำลังเริ่มเพลงถัดไป…" : "ยังไม่มีใครขอเพลงเข้ามา"}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={!playing} onClick={togglePause}>
          {paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
        </Button>
        <Button size="sm" variant="ghost" disabled={!playing} onClick={() => void skip()}>
          ข้ามเพลงนี้
        </Button>
        {playing && (
          <a
            href={playing.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-display text-xs text-champagne hover:underline"
          >
            เปิดใน YouTube →
          </a>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
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
    </>
  );

  /* ---------- ฝังในหน้าอื่น ---------- */
  if (compact) {
    return (
      <div className="overflow-hidden rounded-2xl border border-hair">
        {stage}
        <div className="p-5">{controls}</div>
      </div>
    );
  }

  /* ---------- หน้าเต็ม ---------- */
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Panel variant="feature" className="overflow-hidden p-0">
        {stage}
        <div className="p-5">{controls}</div>
      </Panel>

      <Panel className="p-5">
        <PanelHeader eyebrow="Queue" title="คิวถัดไป" count={queued.length} />

        {!ready && !apiError && <Skeleton className="h-16 w-full" />}

        {queued.length === 0 ? (
          <EmptyState
            title="คิวว่าง"
            description="ส่งลิงก์หน้าขอเพลงให้คนดู แล้วเพลงจะเข้ามาเล่นเองที่นี่"
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
  );
}

/* =========================================================================
   หน้า /player/ — ตัวเล่นเต็มจอ ไว้เปิดทิ้งไว้อีกจอ
   ========================================================================= */

export default function SongPlayer() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();

  // ผู้ดูแลเปิดคิวของช่องอื่นได้ด้วยการใส่ #ch= ไม่งั้นใช้ช่องตัวเอง
  const chParam = useHashParam("ch");
  const channelId = chParam ?? (user && !user.anonymous ? user.uid : null);

  // ต้องมีข้อมูลช่องเพื่ออ่านเพลย์ลิสต์สำรอง — hook ต้องอยู่เหนือ early return
  const [channel, setChannel] = useState<Channel | null>(null);
  useEffect(() => {
    if (!channelId) return;
    return watchChannel(
      channelId,
      (c) => setChannel(c),
      () => setChannel(null),
    );
  }, [channelId]);

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
        description="เดินเอง — คนดูขอเพลงเข้ามาแล้วเล่นเลย เพลงจบก็ต่อเพลงถัดไปให้ เปิดหน้านี้ในเบราว์เซอร์ที่ล็อกอิน YouTube Premium ไว้ แล้วดึงเสียงเข้า OBS ทาง Desktop Audio"
      />
      <SongPlayerCore
        channelId={channelId}
        filler={channel?.songs?.filler}
        fillerMode={channel?.songs?.fillerMode ?? "off"}
      />
      <SongConsole channelId={channelId} channel={channel} />
    </div>
  );
}
