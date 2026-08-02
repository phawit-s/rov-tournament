"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
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
import { setSongsEnabled } from "@/lib/song/config";
import {
  addSongToQueue,
  moveSongInQueue,
  removeSongRequest,
  setSongDuration,
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
import { toast } from "../ui/Toast";
import { Badge, EmptyState, Skeleton } from "../tournament/ui";
import SongConsole from "./SongConsole";

/**
 * ตัวเล่นเพลงตามคิว — เดินเอง ไม่ต้องมีใครกด
 *
 * คิวมาถึง = เล่นเลย เพลงจบ = ต่อเพลงถัดไปเอง
 * ปุ่มที่เหลือ (ข้าม/หยุด) เป็นทางออกฉุกเฉิน ไม่ใช่ทางเดินปกติ
 *
 * ข้ามเองเฉพาะตอน YouTube บอกมาตรงๆ ว่าคลิปเสีย (onError) เท่านั้น
 * เคยมีตัวเฝ้าเวลาที่ข้ามคลิปซึ่งเงียบเกิน 12 วินาทีด้วย แต่ถอดออกแล้ว —
 * มันแยกไม่ออกว่าคลิปเสียหรือตัวเล่นเองเริ่มอะไรไม่ได้ พอเจอกรณีหลัง
 * มันไล่ข้ามทีละ 13 วินาทีจนคิวหมดทั้งแถว
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
  /** กำลังกดเลือกเพลงอยู่ — ตัวเดินคิวอัตโนมัติต้องหยุดรอ ไม่งั้นแย่งกันจนได้ผิดเพลง */
  const manualRef = useRef(false);
  /** เพลงที่กำลังยิงคำสั่งโปรโมตอยู่ กัน snapshot ยิงซ้ำแล้วเขียนซ้ำ */
  const promotingRef = useRef<string | null>(null);
  const blockTimerRef = useRef<number | null>(null);
  /** บอกเรื่องเขียนความยาวคลิปไม่ผ่านไปแล้วหรือยัง กันเตือนซ้ำทุกเพลง */
  const durationSentRef = useRef<string | null>(null);

  const stateRef = useRef({ channelId, queue, active: true });
  useEffect(() => {
    stateRef.current = { channelId, queue, active: lock === "leader" };
  }, [channelId, queue, lock]);

  const { playing, queued, done } = useMemo(() => splitQueue(queue), [queue]);
  /* แยกออกมาเป็นค่าพื้นฐาน เพราะ playing เป็นอ็อบเจกต์ใหม่ทุกสแนปช็อต
     ถ้าใส่ทั้งก้อนใน deps เอฟเฟกต์จะรีสตาร์ตทุกครั้งที่คิวขยับแม้เพลงไม่เปลี่ยน */
  const playingId = playing?.id ?? null;
  const playingDuration = playing?.duration ?? 0;
  /** แท็บนี้เป็นคนคุมคิวจริงไหม ผู้ชมห้ามทั้งเล่นและห้ามเดินคิว */
  const active = lock === "leader";
  /** กติกาบังคับให้ byUid ตรงกับคนที่เขียน ยังไม่รู้ว่าใครล็อกอินก็เขียนอะไรไม่ได้ */
  const uid = authStore.user()?.uid ?? null;

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
    // คนกำลังกดเลือกเพลงอยู่ ห้ามแทรก ไม่งั้นเขากดเพลงหนึ่งแล้วได้อีกเพลง
    if (manualRef.current) return;
    const next = queued[0];
    if (!next || promotingRef.current === next.id) return;
    promotingRef.current = next.id;
    void setSongStatus(channelId, next.id, "playing", queue).catch(() => {
      // เขียนไม่ผ่าน (เน็ตหลุด/สิทธิ์) — ปลดล็อกไว้ให้ลองใหม่รอบหน้า
      promotingRef.current = null;
    });
  }, [channelId, active, playing, queued, queue]);

  /**
   * เติมเพลงสำรองไว้ล่วงหน้าหนึ่งเพลงเสมอเมื่อคิวว่าง
   *
   * ตั้งใจเติมตั้งแต่ตอนที่ยังมีเพลงเล่นอยู่ ไม่ใช่รอให้เงียบก่อนค่อยหา
   * เพราะถ้ารอ ทั้งจอผู้ดูแลและ widget จะขึ้นว่า "คิวว่าง" ตลอดเวลา
   * ทั้งที่มีกองสำรองรออยู่ร้อยเพลง คนดูแลจะไม่มีทางรู้ว่าอะไรกำลังจะมา
   *
   * ใส่เป็นใบจริงในคิว ไม่ได้เล่นลอยๆ และเพราะ splitQueue จัดให้เพลงสำรอง
   * อยู่ท้ายแถวเสมอ พอมีคนขอเข้ามาเพลงของเขาจะแทรกขึ้นก่อนใบสำรองใบนี้เอง
   */
  const fillingRef = useRef(false);
  useEffect(() => {
    if (!channelId || !active || queued.length > 0) return;
    if (fillerMode === "off" || !filler?.length || fillingRef.current) return;
    // คนกำลังกดเลือกเพลงอยู่ อย่าเพิ่งเติมมาแย่งคิว
    if (manualRef.current) return;

    const pick = pickFiller(filler, queue, fillerMode);
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
    /*
      uid ต้องอยู่ใน deps ด้วย

      Firebase ใช้เวลาสักครู่กว่าจะบอกว่าใครล็อกอินอยู่ ถ้าเอฟเฟกต์นี้รันตอนที่ยังไม่รู้
      มันจะออกไปเฉยๆ แล้วไม่มีอะไรมาปลุกให้ลองใหม่ เพราะตัวอื่นใน deps ไม่ขยับเลย
      (คิวว่างอยู่แล้ว จึงไม่มี snapshot ใหม่มาเปลี่ยน queue) ผลคือกองสำรองไม่ถูกเติม
      ทั้งที่มีเพลงรออยู่เป็นร้อย และหน้าจอค้างว่าที่ "คิวถัดไป 0" ไปตลอด
    */
  }, [channelId, active, uid, queued.length, queue, filler, fillerMode]);

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

    /*
      ใบเดิม — สั่งเล่นต่อเฉพาะตอนที่ "เราเป็นคนสั่งหยุดไว้เอง" เท่านั้น

      ห้ามสั่งเล่นทุกครั้งที่เห็นว่าคลิปไม่ขยับ เพราะคลิปที่เจ้าของห้ามฝัง
      จะวนอยู่ที่ บัฟเฟอร์ → ยังไม่เริ่ม ตลอดโดยไม่ยิง error ออกมา
      ถ้าไล่กดเล่นซ้ำทุกรอบ มันจะบัฟเฟอร์ใหม่ไม่จบ เห็นเป็นวงกลมหมุนค้างบนจอ
      คลิปที่เริ่มไม่ได้จริงๆ ให้ตัวเฝ้าเวลาด้านล่างจัดการข้ามไปแทน
    */
    if (playing.id === loadedRef.current) {
      if (manualPauseRef.current) return;
      if (p.getPlayerState() === YT_STATE.PAUSED) p.playVideo();
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

    /*
      ไม่มีตัวข้ามอัตโนมัติแล้ว — เคยมีตัวเฝ้าเวลา 12 วินาทีที่ข้ามคลิปที่ยังไม่เริ่มเล่น
      แต่มันแยกไม่ออกว่า "คลิปนี้เสีย" หรือ "ตัวเล่นเริ่มอะไรไม่ได้เลยตอนนี้"
      พอเจอกรณีหลัง มันไล่ข้ามทีละ 13 วินาทีจนคิวหมดเกลี้ยง (เกิดกับของจริงมาแล้ว)

      คลิปที่เริ่มไม่ได้จึงค้างอยู่กับที่ ให้คนดูแลกดข้ามเอง — เสียเวลาไม่กี่วินาที
      แลกกับการไม่เผาคิวที่คนดูอุตส่าห์ขอมาทิ้งทั้งแถว
    */
  }, [ready, active, playing, advance]);

  /*
    ตามเก็บความยาวคลิปให้ widget

    มีแต่ตัวเล่นที่รู้ความยาวคลิป (oEmbed ไม่บอก) widget เอาไปคู่กับ playedAt
    แล้วคำนวณแถบความคืบหน้าเอง จึงไม่ต้องส่งเวลาปัจจุบันมาทุกวินาที

    ทำไมต้องตามเก็บแทนที่จะอ่านทีเดียวตอนเหตุการณ์ "เริ่มเล่น" ยิง:
    วิธีนั้นมีนัดเดียว พลาดแล้วพลาดเลย ทั้งที่พลาดได้หลายทาง — แท็บเพิ่งได้สิทธิ์
    คุมคิวหลังเพลงเริ่มไปแล้ว, รีเฟรชหน้ากลางเพลง, หรือเขียนไม่ผ่านชั่วคราว
    ตัวนี้ยิงซ้ำจนกว่าจะได้ แล้วหยุดเองเมื่อสแนปช็อตกลับมาพร้อมค่า
  */
  useEffect(() => {
    if (!active || !channelId || !playingId) return;
    if (playingDuration && playingDuration > 0) return;

    let timer = 0;
    let tries = 0;
    const tick = () => {
      // เปลี่ยนเพลงไปแล้วระหว่างรอ = เลิกยุ่งกับใบเก่า
      if (loadedRef.current !== playingId) return;
      const secs = playerRef.current?.getDuration?.() ?? 0;
      if (secs > 0) {
        setSongDuration(channelId, playingId, secs).catch((err) => {
          /* เงียบไปเฉยๆ แปลว่าแถบเวลาบน widget จะไม่ขึ้นโดยไม่มีใครรู้สาเหตุ
             บอกครั้งเดียวพอ ไม่ใช่ทุกเพลง */
          if (durationSentRef.current !== "แจ้งแล้ว") {
            durationSentRef.current = "แจ้งแล้ว";
            console.error("เขียนความยาวคลิปไม่สำเร็จ", err);
            toast("บันทึกความยาวเพลงไม่ได้ แถบเวลาบน widget จะไม่ขึ้น", "error");
          }
        });
        return;
      }
      if (++tries < 8) timer = window.setTimeout(tick, 1500);
    };
    timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [active, channelId, playingId, playingDuration]);

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

  /**
   * ลบเพลงที่กำลังเล่นทิ้งถาวร
   *
   * ต้องดันเพลงถัดไปขึ้นมาก่อนค่อยลบ ไม่งั้นจะมีช่วงที่ไม่มีอะไรเล่นอยู่เลย
   * แล้วตัวเดินคิวอัตโนมัติจะรีบไปหยิบเพลงสำรองมาแทรกแทนเพลงที่ควรได้คิว
   */
  const dropPlaying = async () => {
    if (!playing) return;
    const doomed = playing.id;
    manualRef.current = true;
    try {
      if (queued.length > 0) {
        await setSongStatus(channelId, queued[0].id, "playing", queue);
      }
      await removeSongRequest(channelId, doomed);
    } finally {
      manualRef.current = false;
    }
  };

  /**
   * คลิกเพลง = ให้เล่นเพลงนั้นเลย
   *
   * ห้ามทำเป็นสองจังหวะ (ปิดเพลงเดิมก่อน แล้วค่อยเปิดตัวใหม่) เด็ดขาด
   * ระหว่างสองจังหวะนั้นจะไม่มีเพลงไหนเล่นอยู่เลยแม้แต่เสี้ยววินาที
   * ตัวเดินคิวอัตโนมัติเห็นแบบนั้นก็จะรีบดันเพลงหัวคิวขึ้นมาแทน
   * ผลคือกดเพลงหนึ่งแล้วได้อีกเพลงหนึ่ง — เป็นอาการที่เจอตอนกดจากกองสำรอง
   * เพราะมีเพลงสำรองที่เติมล่วงหน้าไว้รออยู่หัวคิวพอดี
   *
   * setSongStatus ตอนตั้งเป็น "playing" ปิดเพลงที่ค้างอยู่ให้ในชุดเดียวกันแล้ว
   * จึงเรียกครั้งเดียวพอ และต้องกันตัวเดินคิวไม่ให้แทรกระหว่างที่ยังทำไม่เสร็จ
   */
  const pickAndPlay = async (job: () => Promise<string | null>) => {
    manualRef.current = true;
    try {
      const id = await job();
      if (id) await setSongStatus(channelId, id, "playing", stateRef.current.queue);
    } finally {
      manualRef.current = false;
    }
  };

  const playNow = (song: SongRequest) => {
    if (song.id === playing?.id) return Promise.resolve();
    return pickAndPlay(async () => song.id);
  };

  const playTrackNow = (track: FillerTrack) =>
    pickAndPlay(async () => {
      if (!uid) return null;
      return addSongToQueue(
        channelId,
        {
          videoId: track.videoId,
          title: track.title,
          author: track.author,
          url: watchUrl(track.videoId),
          byUid: uid,
          byName: "เพลย์ลิสต์สำรอง",
        },
        "filler",
      );
    });

  /*
    เพลงสำรองที่จะมาถึงคิวต่อไป

    โหมดเรียงลำดับบอกได้แน่นอนว่าเพลงไหนมาก่อน จึงติดป้ายให้เห็น
    โหมดสุ่มบอกไม่ได้ — จะเดาให้ดูก็เท่ากับโกหก เลยไม่ติดป้ายเลย
  */
  const nextFillerId =
    fillerMode === "order" && filler?.length
      ? (pickFiller(filler, queue, "order")?.videoId ?? null)
      : null;

  const stage = (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {/* ตัวเล่นต้องอยู่ใน DOM ตลอด ไม่งั้นสร้าง player ใหม่ทุกครั้งที่เปลี่ยนเพลง */}
      <div ref={mountRef} className="absolute inset-0" />

      {!playing && !apiError && active && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
          <div>
            <p className="slug">รอเพลง</p>
            <p className="mt-2 text-sm text-muted">
              {fillerMode !== "off" && filler?.length
                ? "กำลังหยิบเพลงจากกองสำรองมาเล่น…"
                : "คิวว่างอยู่ — มีคนขอเพลงเข้ามาเมื่อไหร่ ตัวเล่นจะเริ่มเองทันที"}
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
        {/* ข้าม = เก็บไว้ในประวัติ ดึงกลับมาต่อคิวได้
            ลบทิ้ง = หายถาวร ไว้ใช้กับของที่ไม่อยากให้ค้างอยู่ในระบบเลย */}
        <Button
          size="sm"
          variant="ghost"
          disabled={!playing}
          onClick={() => void dropPlaying()}
        >
          ลบเพลงนี้ทิ้ง
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
          style={{ ["--fill" as string]: volume / 100 }}
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

  /* ---------- หน้าเต็ม ----------
     items-start ไม่งั้นการ์ดขวาจะถูกยืดให้สูงเท่าตัวเล่นแล้วเหลือพื้นที่ว่างโล่ง */
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <Panel variant="feature" className="overflow-hidden p-0">
        {stage}
        <div className="p-5">{controls}</div>
      </Panel>

      <Panel className="p-5">
        <PanelHeader eyebrow="Queue" title="คิวถัดไป" count={queued.length} />

        {!ready && !apiError && <Skeleton className="h-16 w-full" />}

        {queued.length === 0 ? (
          <p className="text-sm text-muted">
            ยังไม่มีใครขอเพลง —{" "}
            {fillerMode === "off" || !filler?.length
              ? "เปิดเพลย์ลิสต์สำรองไว้จะได้ไม่เงียบ"
              : "ระบบจะหยิบจากกองสำรองข้างล่างมาเล่นให้เอง"}
          </p>
        ) : (
          <ul className="space-y-2">
            {queued.map((s, i) => {
              /* เลื่อนได้เฉพาะในกลุ่มเดียวกัน เพลงที่คนขอกับเพลงสำรองอยู่คนละชั้น
                 ปุ่มจึงต้องดูจากตำแหน่งในกลุ่ม ไม่ใช่ตำแหน่งในคิวรวม */
              const group = queued.filter(
                (x) => (x.source === "filler") === (s.source === "filler"),
              );
              const at = group.findIndex((x) => x.id === s.id);
              return (
                <motion.li key={s.id} layout={!reduced}>
                  <QueueRow
                    no={i + 1}
                    videoId={s.videoId}
                    title={s.title}
                    sub={
                      s.source === "filler" ? "จากเพลย์ลิสต์สำรอง" : `ขอโดย ${s.byName}`
                    }
                    onClick={() => void playNow(s)}
                    onMove={(dir) =>
                      void moveSongInQueue(channelId, queued, s.id, dir)
                    }
                    onRemove={() => void removeSongRequest(channelId, s.id)}
                    canUp={at > 0}
                    canDown={at < group.length - 1}
                  />
                </motion.li>
              );
            })}
          </ul>
        )}

        {/* ---------- กองสำรอง ----------
            โชว์ทั้งกองไปเลย นี่คือที่เดียวที่คนดูแลจะเห็นว่ามีอะไรให้เล่นบ้าง
            และคลิกเลือกเพลงที่อยากเปิดตอนนี้ได้จากตรงนี้ */}
        {!!filler?.length && (
          <>
            <div className="mt-5 flex items-center gap-3">
              <span className="slug slug-2 shrink-0">
                {fillerMode === "off" ? "กองสำรอง (ปิดอยู่)" : "กองสำรอง"}
              </span>
              <span className="rule h-px flex-1" />
              <span className="num shrink-0 text-xs text-muted">{filler.length}</span>
            </div>

            <p className="mt-2 text-xs text-muted">
              {fillerMode === "off"
                ? "โหมดสำรองปิดอยู่ ระบบจะไม่หยิบมาเล่นเอง แต่กดเลือกเพลงเองได้"
                : fillerMode === "shuffle"
                  ? "โหมดสุ่ม — บอกล่วงหน้าไม่ได้ว่าเพลงไหนจะมา กดเลือกเองได้"
                  : "โหมดตามลำดับ — เพลงที่ติดป้ายคือเพลงที่จะมาเป็นตัวถัดไป"}
            </p>

            <ul className="no-scrollbar mt-3 max-h-96 space-y-2 overflow-y-auto">
              {filler.map((t, i) => (
                <li key={t.videoId}>
                  <QueueRow
                    no={i + 1}
                    videoId={t.videoId}
                    title={t.title}
                    sub={t.author}
                    dim
                    marked={t.videoId === nextFillerId}
                    onClick={() => void playTrackNow(t)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {done.length > 0 && (
          <p className="mt-4 text-xs text-muted">เล่นจบแล้ว {done.length} เพลง</p>
        )}
      </Panel>
    </div>
  );
}

/**
 * ปุ่มเปิด/ปิดรับคิวจากคนดู
 *
 * เขียนลงเอกสารช่องตรงๆ มีผลทันที ไม่ต้องไปกด "เผยแพร่ช่อง" ที่หน้าตั้งค่า
 * เพราะปุ่มนี้ใช้ตอนกำลังไลฟ์ — ปิดแล้วต้องปิดเดี๋ยวนั้น ไม่ใช่ปิดแล้วยังมีคนส่งเข้ามาได้อีก
 *
 * ปิดรับคิวไม่ได้แปลว่าหยุดเพลง เพลงที่ค้างอยู่ในคิวกับกองสำรองยังเดินต่อตามปกติ
 */
function AcceptToggle({
  channelId,
  channel,
}: {
  channelId: string;
  channel: Channel | null;
}) {
  const [busy, setBusy] = useState(false);
  const open = channel?.songs?.enabled === true;

  // ยังโหลดข้อมูลช่องไม่เสร็จ อย่าเพิ่งโชว์ปุ่มที่บอกสถานะผิด
  if (!channel) return null;

  const flip = async () => {
    setBusy(true);
    try {
      await setSongsEnabled(channelId, !open);
      toast(open ? "ปิดรับคิวแล้ว" : "เปิดรับคิวแล้ว", "success", 1800);
    } catch {
      toast("เปลี่ยนไม่สำเร็จ — ต้องเป็นเจ้าของช่องถึงจะแก้ได้", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge rgb={open ? "77 181 145" : "146 151 172"} tone={open ? "live" : "plain"}>
        {open ? "เปิดรับคิวอยู่" : "ปิดรับคิวแล้ว"}
      </Badge>
      <Button
        size="sm"
        variant={open ? "danger" : "primary"}
        loading={busy}
        onClick={() => void flip()}
      >
        {open ? "ปิดรับคิว" : "เปิดรับคิว"}
      </Button>
    </div>
  );
}

/**
 * แถวเพลงในคิว — กดได้ทั้งแถวเพื่อเล่นเพลงนั้นทันที
 * เป็น button ทั้งใบ ไม่ใช่ปุ่มเล็กมุมขวา จะได้กดง่ายตอนรีบระหว่างไลฟ์
 */
function QueueRow({
  no,
  videoId,
  title,
  sub,
  onClick,
  onMove,
  onRemove,
  canUp = false,
  canDown = false,
  dim = false,
  marked = false,
}: {
  no: number;
  videoId: string;
  title: string;
  sub: string;
  onClick: () => void;
  /** ไม่ส่งมา = แถวนี้เลื่อนลำดับไม่ได้ (เช่นกองสำรองที่ยังไม่เข้าคิว) */
  onMove?: (dir: "up" | "down" | "top") => void;
  /** ไม่ส่งมา = แถวนี้เอาออกจากคิวไม่ได้ */
  onRemove?: () => void;
  canUp?: boolean;
  canDown?: boolean;
  dim?: boolean;
  marked?: boolean;
}) {
  /* ปุ่มซ้อนในปุ่มไม่ได้ ตัวแถวจึงเป็น div แล้วให้ส่วนเนื้อหาเป็นปุ่มกดเล่น
     ส่วนปุ่มเลื่อนลำดับวางเป็นพี่น้องข้างๆ */
  return (
    <div
      className={`hover-tile tile group flex items-center gap-1 rounded-xl pr-1.5 transition-colors ${
        marked ? "ring-1 ring-champagne/45" : ""
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        title="กดเพื่อเล่นเพลงนี้เลย"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left"
      >
        <span
          className={`fig text-outline w-6 shrink-0 text-center text-lg ${
            dim ? "opacity-60" : ""
          }`}
        >
          {no}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(videoId, "mq")}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
          className="h-9 w-16 shrink-0 rounded object-cover"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ice">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        {marked && <span className="slug slug-2 shrink-0 text-champagne">ถัดไป</span>}
      </button>

      {(onMove || onRemove) && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100">
          {onMove && (
            <>
              <MoveBtn
                label="ขึ้นบนสุด"
                disabled={!canUp}
                onClick={() => onMove("top")}
              >
                ⤒
              </MoveBtn>
              <MoveBtn label="เลื่อนขึ้น" disabled={!canUp} onClick={() => onMove("up")}>
                ↑
              </MoveBtn>
              <MoveBtn
                label="เลื่อนลง"
                disabled={!canDown}
                onClick={() => onMove("down")}
              >
                ↓
              </MoveBtn>
            </>
          )}
          {onRemove && (
            <MoveBtn label="เอาออกจากคิว" disabled={false} onClick={onRemove} danger>
              ✕
            </MoveBtn>
          )}
        </div>
      )}
    </div>
  );
}

function MoveBtn({
  label,
  disabled,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-7 cursor-pointer place-items-center rounded-lg text-sm text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted ${
        danger
          ? "hover:bg-[#e79a9a]/12 hover:text-[#e79a9a]"
          : "hover:bg-champagne/12 hover:text-champagne"
      }`}
    >
      {children}
    </button>
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
        action={<AcceptToggle channelId={channelId} channel={channel} />}
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
