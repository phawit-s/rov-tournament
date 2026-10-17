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
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useSiteRole } from "@/hooks/useRole";
import { stageStyle, useArtPalette } from "@/hooks/useSong";
import { authStore } from "@/lib/backend/firebase";
import { watchAllChannels, watchChannel, watchMyChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc, safeUrl } from "@/lib/safe";
import {
  claimPlayerLock,
  playerInstanceId,
  type LockHandle,
  type LockState,
} from "@/lib/song/player-lock";
import { pickFiller } from "@/lib/song/filler";
import { saveFillerList, setSongsEnabled } from "@/lib/song/config";
import {
  addSongToQueue,
  moveSongInQueue,
  removeSongRequest,
  setSongDuration,
  setSongStatus,
  splitQueue,
  watchSongQueue,
} from "@/lib/song/store";
import { formatClock } from "@/lib/song/progress";
import { watchUrl } from "@/lib/song/youtube";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/song/yt-api";
import type { FillerTrack, SongRequest } from "@/lib/song/types";
import Button from "../ui/Button";
import Cover from "../ui/Cover";
import { toast } from "../ui/Toast";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconClose,
  IconExternal,
  IconMore,
  IconMusic,
  IconMute,
  IconPause,
  IconPlay,
  IconSearch,
  IconSkip,
  IconToTop,
  IconTrash,
  IconVolume,
} from "../ui/icons";
import { Badge, EmptyState, Skeleton } from "../ui/kit";
import SongConsole from "./SongConsole";
import { EqBars } from "./Stage";

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

/**
 * ระดับเสียงที่จำไว้ — ไม่เคยตั้ง = 70
 *
 * ต้องเช็ค null แยกก่อนแปลงเป็นตัวเลข เพราะ Number(null) เท่ากับ 0 ไม่ใช่ NaN
 * ด่านตรวจข้างล่างจึงปล่อยผ่านเป็น "เสียง 0" แทนที่จะตกไปใช้ค่าเริ่มต้น
 * ผลคือเครื่องที่เพิ่งเปิดหน้านี้ครั้งแรกได้ตัวเล่นที่เงียบสนิทโดยไม่มีอะไรบอก
 */
function readVolume(): number {
  if (typeof window === "undefined") return 70;
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored === null) return 70;
  const raw = Number(stored);
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
  onUnplayable,
}: {
  channelId: string;
  /** true = ฝังอยู่ในหน้าอื่น ไม่ต้องโชว์คิวซ้ำกับที่หน้านั้นมีอยู่แล้ว */
  compact?: boolean;
  /** เพลย์ลิสต์สำรอง — ใส่มาแล้วคิวจะไม่มีวันว่างจนเงียบทั้งไลฟ์ */
  filler?: FillerTrack[];
  fillerMode?: "off" | "order" | "shuffle";
  /** เพลงสำรองใบนี้ฝังเล่นไม่ได้ — ให้หน้าแม่เขี่ยออกจากกองถาวร */
  onUnplayable?: (videoId: string, code: number) => void;
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
  /** YouTube บอกว่าคลิปนี้เล่นไม่ได้ — ค้างไว้รอคนกดข้าม ไม่ข้ามให้เอง */
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  /** มีอีกแท็บเล่นอยู่ไหม — ถ้ามี แท็บนี้ต้องเงียบ ไม่งั้นเสียงซ้อนกันออกไลฟ์ */
  const [lock, setLock] = useState<LockState>("leader");
  /**
   * ตำแหน่งที่เล่นอยู่กับความยาวคลิป — ถามตัวเล่นเอาเอง ไม่ได้เขียนลงคลาวด์
   *
   * มีไว้ให้คนคุมคิวเห็นว่าเพลงเหลืออีกกี่นาที จะได้กะจังหวะพูดแทรกหรือ
   * ตัดเข้าเกมถูก ของเดิมไม่มีเลย ต้องเดาเอาจากความรู้สึก
   */
  const [clock, setClock] = useState<{ id: string; at: number; len: number } | null>(
    null,
  );
  /**
   * กองสำรองพับเก็บไว้ก่อน + มีช่องค้นหา
   *
   * ของเดิมกางทั้งกองไว้ใต้คิวเสมอ ซึ่งกองจริงมีเป็นร้อยเพลง — คิวที่ต้อง
   * กดจริงเลยถูกดันหายไปจากจอ และการหาเพลงที่อยากเปิดก็ได้แต่เลื่อนหาเอง
   */
  const [openFiller, setOpenFiller] = useState(false);
  const [fillerQ, setFillerQ] = useState("");

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
  /**
   * คลิปที่โหลดล่าสุดเคยเล่นจริงแล้วหรือยัง
   *
   * ใช้แยก "จบเพลงจริง" ออกจาก "ยิงจบตั้งแต่ 0 วินาทีเพราะเล่นไม่ได้"
   * ซึ่งหน้าตาเหมือนกันเป๊ะถ้าดูแค่ตัวอีเวนต์
   */
  const playedOkRef = useRef(false);
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
  /* เก็บ id ของใบที่วัดเวลามาไว้ด้วย แล้วอ่านออกมาเป็นค่าที่คำนวณได้
     ถ้าเก็บเป็นตัวเลขเปล่าๆ ต้องมีคนคอยล้างค่าตอนเปลี่ยนเพลง ซึ่งทำได้แค่
     ใน effect — แล้วนั่นคือ setState ในตัว effect ที่ทำให้เรนเดอร์ซ้อนกันฟรีๆ */
  const at = clock && clock.id === playingId ? clock.at : 0;
  const len = clock && clock.id === playingId ? clock.len : 0;
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

  /*
    ★ callback ต้องเข้าถึงผ่าน ref เท่านั้น ห้ามใส่เป็น dependency ของตัวเล่น ★

    ตัวเล่น YouTube ถูกสร้างใน effect ที่ cleanup แล้วเรียก destroy() —
    dependency ตัวไหนเปลี่ยน แปลว่า iframe ถูกรื้อทิ้งแล้วสร้างใหม่กลางเพลง
    ซึ่ง YouTube จะขึ้น "An error occurred. Please try again later."

    onUnplayable ถูกส่งมาเป็น arrow function เขียนสดในหน้าแม่ จึงเป็นคนละตัว
    ทุกครั้งที่หน้าแม่รีเรนเดอร์ — และหน้าแม่รีเรนเดอร์ทุกครั้งที่เอกสารช่อง
    เปลี่ยน เช่นตอนลบเพลงออกจากกองสำรอง ผลคือแตะคิวทีเดียวเพลงที่ฟังอยู่ดับ
  */
  const advanceRef = useRef(advance);
  const unplayableRef = useRef(onUnplayable);
  useEffect(() => {
    advanceRef.current = advance;
    unplayableRef.current = onUnplayable;
  });

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
    )
      .catch((err) => {
        /* เงียบไปเฉยๆ แปลว่าคิวจะว่างทั้งไลฟ์โดยไม่มีใครรู้ว่าทำไม
           ทั้งที่กองสำรองมีเพลงรออยู่เต็ม */
        console.error("เติมเพลงสำรองเข้าคิวไม่สำเร็จ", err);
      })
      .finally(() => {
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
                setFailed(false);
                playedOkRef.current = true;
                if (blockTimerRef.current) {
                  window.clearTimeout(blockTimerRef.current);
                  blockTimerRef.current = null;
                }
              }
              if (e.data === YT_STATE.PAUSED) setPaused(true);

              /*
                คลิปจบเอง = ไปเพลงถัดไป

                แต่ต้องเคยเล่นจริงก่อน — คลิปที่เจ้าของห้ามฝังจำนวนมากยิง "จบแล้ว"
                ตั้งแต่วินาทีที่ 0 ทั้งที่ไม่เคยเล่นอะไรเลย ถ้าเชื่อตามนั้น
                มันจะข้ามเพลงถัดไปทันที แล้วเพลงถัดไปก็ยิงแบบเดียวกันอีก
                กลายเป็นไล่ข้ามรวดเดียวจนคิวหมดภายในไม่กี่วินาที
              */
              if (e.data === YT_STATE.ENDED) {
                const cur = loadedRef.current;
                if (cur && playedOkRef.current) void advanceRef.current(cur);
              }
            },
            /*
              YouTube บอกว่าคลิปนี้เล่นไม่ได้ — จัดการต่างกันตามที่มาของเพลง

              เพลงสำรอง: เป็นขยะในกองที่เราเป็นคนใส่เอง เอาออกจากกองถาวร
              แล้วไปเพลงถัดไป ถ้าปล่อยไว้มันจะวนกลับมาค้างซ้ำที่เดิมไม่จบ
              (สแกนกองจริงแล้วพบว่า 37 จาก 89 เพลงติดรหัส 150 = เจ้าของปิดการฝัง)

              เพลงที่คนดูขอมา: ห้ามข้ามให้เอง เป็นของที่เขาตั้งใจขอมาครั้งเดียว
              ค้างไว้แล้วขึ้นข้อความให้คนดูแลตัดสินใจกดข้ามเอง
            */
            onError: (e) => {
              const cur = loadedRef.current;
              const song = cur
                ? stateRef.current.queue.find((x) => x.id === cur)
                : undefined;
              if (cur && song?.source === "filler") {
                unplayableRef.current?.(song.videoId, e.data);
                /* ลบใบทิ้งเลย ไม่ใช่ปิดเป็น "เล่นจบแล้ว" — มันไม่เคยเล่น
                   ใส่ไว้ในประวัติก็มีแต่จะรกโดยไม่ได้บอกอะไร
                   พอใบหาย ตัวดันคิวจะหยิบเพลงถัดไปขึ้นมาให้เอง */
                void removeSongRequest(stateRef.current.channelId, cur);
                return;
              }
              setFailed(true);
            },
            /* หมายเหตุ: loadedRef เก็บ id ใบคำขอ ไม่ใช่ videoId
               advance จึงเทียบใบต่อใบได้ตรงตัว แม้คลิปเดียวกันถูกขอซ้ำ
               และห้ามเรียก advance โดยไม่ส่ง id — ไม่มี id แล้วมันจะข้าม
               "เพลงที่กำลังเล่นอยู่ตอนนี้" ซึ่งอาจไม่ใช่ใบที่มีปัญหาแล้วก็ได้ */
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
    // สร้างครั้งเดียวตลอดอายุหน้า — เหตุผลอยู่ที่ advanceRef/unplayableRef ด้านบน
  }, []);

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
    playedOkRef.current = false;
    setFailed(false);
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

  /*
    เดินนาฬิกาของแถบเวลา — ถามตัวเล่นวินาทีละครั้ง

    ถามเฉพาะตอนมีเพลงเล่นอยู่จริง ไม่มีเพลงก็ไม่มี timer เดินทิ้งไว้ทั้งไลฟ์
    ค่านี้ไม่ได้ถูกเขียนขึ้นคลาวด์เลย — widget คำนวณความคืบหน้าเองจาก
    playedAt + duration อยู่แล้ว ตัวนี้มีไว้ให้คนหน้าจอนี้ดูเท่านั้น
  */
  useEffect(() => {
    if (!ready || !playingId) return;
    const tick = () => {
      const p = playerRef.current;
      if (!p) return;
      setClock({
        id: playingId,
        at: p.getCurrentTime?.() ?? 0,
        len: p.getDuration?.() ?? 0,
      });
    };
    /* อ่านครั้งแรกผ่าน timeout 0 ไม่ใช่เรียกตรงๆ ในตัว effect
       (เรียกตรงๆ = setState ในตัว effect ซึ่งบังคับให้เรนเดอร์รอบพิเศษทันที)
       ผลที่ได้เหมือนกันคือเลขขึ้นตั้งแต่เฟรมแรกๆ ไม่ต้องรอครบวินาที */
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ready, playingId]);

  /* ---------- ทางออกฉุกเฉิน ---------- */
  const start = () => {
    setBlocked(false);
    manualPauseRef.current = false;
    playerRef.current?.playVideo();
  };

  const togglePause = () => {
    const p = playerRef.current;
    /* แท็บที่ไม่ได้ถือสิทธิ์เล่น (อีกแท็บเล่นอยู่) ห้ามสั่งเล่นเอง
       ไม่งั้นเสียงจากสองแท็บซ้อนกันออกไลฟ์ — ต้องกด "ย้ายมาเล่นที่นี่" ก่อน
       (ข้าม/ลบยังกดได้ เพราะแค่เปลี่ยนคิวกลาง แท็บที่เล่นอยู่จะตามเอง) */
    if (!p || !active) return;
    // จำเจตนาไว้ ไม่งั้นตัวปรับให้ตรงกับคิวจะสั่งเล่นต่อทับทันที
    manualPauseRef.current = !paused;
    if (paused) p.playVideo();
    else p.pauseVideo();
  };

  /** ลากแถบเวลาไปตรงไหนก็ได้ — อัปเดตเลขบนจอทันที ไม่ต้องรอ tick ถัดไป */
  const seek = (sec: number) => {
    if (playingId) setClock({ id: playingId, at: sec, len });
    playerRef.current?.seekTo?.(sec, true);
  };

  /*
    ปิดเสียงเฉพาะที่ตัวเล่น ไม่ได้ลากระดับเสียงลงศูนย์

    ต้องแยกกันเพราะปิดเสียงคือ "ชั่วคราว ขอพูดแทรกแป๊บนึง" พอเปิดกลับมา
    ต้องได้ระดับเดิมเป๊ะ ถ้าใช้วิธีลากลงศูนย์ ค่าเดิมจะหายไปพร้อมกัน
  */
  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.unMute?.();
    else p.mute();
    setMuted(!muted);
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

  /**
   * เลือกเพลงจากกองสำรอง = ต่อท้ายคิว ไม่ใช่ตัดเพลงที่กำลังเล่นทิ้ง
   *
   * ของเดิมกดแล้วสั่งเล่นทันที ซึ่งแปลว่าเพลงที่คนดูขอมาและกำลังเล่นอยู่
   * ถูกปิดเป็น "เล่นจบแล้ว" กลางเพลงโดยไม่มีใครสั่ง — คนขอที่นั่งรออยู่
   * ก็เห็นเพลงตัวเองหายไปเฉยๆ ทั้งที่สตรีมเมอร์แค่อยากหมายตาเพลงไว้เล่นต่อ
   *
   * ถ้าตอนนั้นไม่มีเพลงเล่นอยู่จริงๆ ตัวเดินคิวอัตโนมัติจะดันขึ้นมาเล่นให้เอง
   * อยู่แล้ว จึงไม่ต้องมีทางลัดสั่งเล่นตรงนี้
   */
  const queueTrack = async (track: FillerTrack) => {
    if (!uid) return;
    try {
      await addSongToQueue(
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
      toast(`ต่อคิว "${track.title.slice(0, 30)}" แล้ว`, "success", 1800);
    } catch {
      toast("ต่อคิวไม่สำเร็จ", "error");
    }
  };

  /*
    คีย์ลัดตอนไลฟ์ — มีเฉพาะหน้าเต็ม

    ตอนกำลังไลฟ์ มืออีกข้างอยู่บนเมาส์เกม การต้องเล็งปุ่มเล็กๆ บนจออีกใบ
    ทุกครั้งที่อยากข้ามเพลงหรือหรี่เสียงลงไปพูดแทรก ช้ากว่าที่คิดมาก

    เก็บตัวสั่งงานล่าสุดไว้ใน ref แทนที่จะใส่ใน deps — ไม่งั้นต้องถอด
    แล้วผูก listener ใหม่ทุกครั้งที่คิวขยับหรือเลื่อนระดับเสียงหนึ่งขีด
    และห้ามทำงานตอนโฟกัสอยู่ในช่องกรอก ไม่งั้นพิมพ์เว้นวรรคในคำค้นแล้วเพลงหยุด
  */
  const keysRef = useRef({ togglePause, skip, toggleMute });
  // เขียนใน effect ไม่ใช่ตอนเรนเดอร์ — แตะ ref ระหว่างเรนเดอร์ผิดกฎ purity
  useEffect(() => {
    keysRef.current = { togglePause, skip, toggleMute };
  });

  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === " " || key === "k") keysRef.current.togglePause();
      else if (key === "n") void keysRef.current.skip();
      else if (key === "m") keysRef.current.toggleMute();
      else if (e.key === "ArrowUp") setVolume((v) => Math.min(100, v + 5));
      else if (e.key === "ArrowDown") setVolume((v) => Math.max(0, v - 5));
      else return;

      // กันหน้าเลื่อนตอนกด Space และกันลูกศรไปขยับ scroll
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  /*
    เพลงสำรองที่จะมาถึงคิวต่อไป

    โหมดเรียงลำดับบอกได้แน่นอนว่าเพลงไหนมาก่อน จึงติดป้ายให้เห็น
    โหมดสุ่มบอกไม่ได้ — จะเดาให้ดูก็เท่ากับโกหก เลยไม่ติดป้ายเลย
  */
  const nextFillerId =
    fillerMode === "order" && filler?.length
      ? (pickFiller(filler, queue, "order")?.videoId ?? null)
      : null;

  /** กองสำรองที่ตรงกับคำค้น — ค้นทั้งชื่อเพลงและชื่อช่อง */
  const shownFiller = useMemo(() => {
    const list = filler ?? [];
    const q = fillerQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) =>
      `${t.title} ${t.author}`.toLowerCase().includes(q),
    );
  }, [filler, fillerQ]);

  /* สีของเวทีดูดมาจากปกเพลงที่กำลังเล่น (docs/DESIGN.md ข้อ 1) ไม่มีเพลง = เทาเรียบ */
  const palette = useArtPalette(playing?.videoId);
  const fillerOn = fillerMode !== "off" && !!filler?.length;

  /* ความยาวคลิปมาช้ากว่าตัวคลิปเสมอ ระหว่างที่ยังไม่รู้ให้แถบว่างไว้ ไม่ใช่ 0:00 ค้าง */
  const known = len > 0;
  const sliderMax = known ? Math.round(len) : 1;
  const sliderAt = known ? Math.min(Math.round(at), sliderMax) : 0;
  const youtube = playing ? safeUrl(playing.url) : null;

  /*
    จอวิดีโอ — แผ่นบังทุกแผ่นอยู่ "ในกรอบวิดีโอ" ไม่ใช่ทับทั้งเวที
    กรอบจึงสูงเท่าเดิมทุกสถานะ หน้าไม่กระโดดตอนเปลี่ยนสถานะ
    แผ่นบังใช้สีพื้นของธีม (ขาว/ดำ) ปุ่มข้างในจึงใช้ปุ่มชุดเดียวกับทั้งเว็บได้
  */
  const video = (
    <div className="@container relative aspect-video w-full overflow-hidden rounded-art bg-black">
      {/* ตัวเล่นต้องอยู่ใน DOM ตลอด ไม่งั้นสร้าง player ใหม่ทุกครั้งที่เปลี่ยนเพลง */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ทึบสนิท ไม่ใช่โปร่ง — ข้างหลังคือจอเปล่าของ YouTube ที่มีปุ่มเล่น
          สีแดงดวงใหญ่อยู่กลางจอ ถ้าปล่อยให้เห็นลางๆ มันจะทับข้อความพอดี
          แล้วดูเหมือนมีอะไรค้างรอให้กด ทั้งที่ตรงนั้นกดไปก็ไม่มีอะไรเกิดขึ้น
          (ข้อความว่าคิวว่าง/กำลังเริ่มเพลงอยู่ใต้จอ ตรงที่ชื่อเพลงจะขึ้น) */}
      {!playing && !apiError && active && (
        <div className="absolute inset-0 grid place-items-center bg-canvas text-faint" aria-hidden>
          <IconMusic className="h-10 w-10" strokeWidth={1.4} />
        </div>
      )}

      {/* อีกแท็บถือสิทธิ์เล่นอยู่ — แท็บนี้เงียบไว้ กันเสียงซ้อน */}
      {!active && !apiError && (
        <Veil
          title="อีกหน้าต่างกำลังเล่นอยู่"
          body="หน้าต่างนี้ปิดเสียงไว้ไม่ให้ซ้อนกัน คิวยังเดินต่อจากหน้าต่างนั้นตามปกติ"
        >
          {/* ต้องผ่าน takeOver ของตัวคุมล็อก ไม่ใช่ setLock เอง
              ไม่งั้นสถานะข้างในโมดูลกับบนจอจะไม่ตรงกัน แล้วสองแท็บจะเล่นซ้อน */}
          <Button className="mt-4" onClick={() => lockRef.current?.takeOver()}>
            ย้ายมาเล่นที่นี่
          </Button>
        </Veil>
      )}

      {/*
        คลิปเล่นไม่ได้ — บอกให้เห็นแล้วมีปุ่มข้ามให้ตรงนั้นเลย
        ไม่ข้ามให้เองเพราะกองสำรองที่เต็มไปด้วยคลิปแบบนี้จะโดนไล่ข้ามจนเกลี้ยง
        ซ่อนตอน blocked เพราะกรณีนั้นไม่ใช่ความผิดของคลิป กดเริ่มแล้วเล่นได้
      */}
      {failed && !blocked && playing && active && !apiError && (
        <Veil
          tone="danger"
          title="เล่นคลิปนี้ไม่ได้"
          body="เจ้าของคลิปอาจปิดการเล่นนอก YouTube ไว้ หรือคลิปถูกลบไปแล้ว กดข้ามแล้วตัวเล่นจะไปเพลงถัดไป เพลงนี้ยังอยู่ในประวัติ"
        >
          <Button className="mt-4" onClick={() => void skip()}>
            ข้ามเพลงนี้
          </Button>
        </Veil>
      )}

      {/* แผ่นแตะครั้งเดียว โผล่เฉพาะตอนเบราว์เซอร์ไม่ยอมให้เล่นเอง
          กดได้ทั้งกรอบ ไม่ต้องเล็งปุ่ม */}
      {blocked && playing && active && !apiError && (
        <button
          type="button"
          onClick={start}
          className="absolute inset-0 flex cursor-pointer overflow-y-auto bg-canvas p-5 text-center"
        >
          <span className="m-auto block max-w-sm">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ink text-onink @md:h-20 @md:w-20">
              <IconPlay className="ml-1 h-7 w-7 @md:h-9 @md:w-9" />
            </span>
            <span className="mt-3 block text-lg font-bold">แตะเพื่อเริ่มเล่น</span>
            <span className="mt-1 hidden text-sm text-muted @[20rem]:block">
              เบราว์เซอร์ไม่ให้เล่นเสียงเองจนกว่าจะมีคนแตะหน้านี้สักครั้ง
              แตะครั้งเดียว หลังจากนั้นเพลงเดินเองยาว ไม่ต้องกดอีก
            </span>
          </span>
        </button>
      )}

      {apiError && (
        <Veil
          tone="danger"
          essential
          title="โหลดตัวเล่น YouTube ไม่ได้"
          body="ตัวบล็อกโฆษณาหรือส่วนขยายบางตัวบล็อกสคริปต์ของ YouTube ไว้ ปิดตัวบล็อกเฉพาะเว็บนี้แล้วรีเฟรชหน้า"
        />
      )}
    </div>
  );

  /* สถานะสั้นๆ เหนือชื่อเพลง — แถบเสียงเต้นเฉพาะตอนที่หน้าต่างนี้ส่งเสียงอยู่จริง */
  const status = !active ? (
    <span>เล่นอยู่ในหน้าต่างอื่น</span>
  ) : blocked ? (
    <span>รอแตะเพื่อเริ่มเล่น</span>
  ) : failed ? (
    <span className="text-danger">เล่นคลิปนี้ไม่ได้</span>
  ) : paused ? (
    <span>หยุดชั่วคราว</span>
  ) : (
    <span className="inline-flex items-center gap-2">
      <EqBars />
      กำลังเล่น
    </span>
  );

  const nowPlaying = playing ? (
    <div key={playing.id} className="rise-in min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {status}
        {playing.source === "filler" && <Badge>เพลงสำรอง</Badge>}
        {playing.source === "tiktok" && <Badge>จากแชท TikTok</Badge>}
      </div>
      <h2
        className={`mt-2 line-clamp-2 font-bold wrap-break-word ${
          compact ? "text-title" : "text-title sm:text-headline"
        }`}
      >
        {playing.title}
      </h2>
      {playing.author && <p className="mt-1 truncate text-muted">{playing.author}</p>}
      {playing.source !== "filler" && (
        <p className="mt-1 truncate text-sm text-muted">
          ขอโดย <span className="font-medium text-ink">{playing.byName}</span>
        </p>
      )}
      {playing.message && (
        <p className="mt-3 max-w-prose wrap-break-word text-ink/80">&ldquo;{playing.message}&rdquo;</p>
      )}
    </div>
  ) : (
    <div className="min-w-0">
      <p className="text-title font-bold">
        {queued.length > 0
          ? "กำลังเริ่มเพลงถัดไป"
          : fillerOn
            ? "กำลังหยิบเพลงสำรองมาเล่น"
            : "คิวว่าง"}
      </p>
      <p className="mt-1 text-muted">
        {queued.length > 0
          ? queued[0].title
          : fillerOn
            ? "เพลงสำรองจะเล่นไปเรื่อยๆ จนกว่าจะมีคนขอเพลงเข้ามา"
            : "มีคนขอเพลงเข้ามาเมื่อไหร่ ตัวเล่นจะเริ่มเองทันที"}
      </p>
    </div>
  );

  /* ---------- แถบเวลา ----------
     เป็น input[type=range] จริง เลื่อนหาจุดในเพลงได้ และกดลูกศรจาก
     คีย์บอร์ดได้ในตัว ไม่ต้องเขียนตัวลากเอง (ตัวที่เห็นเป็นแค่ภาพวาดทับ ดู Slider) */
  const progress = (
    <div className="mt-4">
      <Slider
        label="ตำแหน่งในเพลง"
        value={sliderAt}
        max={sliderMax}
        disabled={!playing || !known}
        onChange={seek}
      />
      <div className="num -mt-1.5 flex items-baseline justify-between px-2 text-xs text-muted">
        <span>{known ? formatClock(at) : "—"}</span>
        {/* เวลาที่เหลือคือตัวเลขที่คนคุมไลฟ์ต้องใช้จริง ไม่ใช่ความยาวคลิป */}
        <span>{known ? `เหลือ ${formatClock(Math.max(0, len - at))}` : ""}</span>
      </div>
    </div>
  );

  /* ปุ่มบนเวทีใช้พื้นโปร่งจากสีตัวหนังสือ ไม่ใช่เทาทึบ — เข้ากับสีปกทุกเพลงและทั้งสองธีม */
  const onStage =
    "cursor-pointer bg-ink/8 transition-[background-color,transform] duration-150 hover:bg-ink/14 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100";

  const transport = (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePause}
          disabled={!playing || !active}
          aria-label={playing && !paused ? "หยุดชั่วคราว" : "เล่นต่อ"}
          title={
            compact
              ? paused
                ? "เล่นต่อ"
                : "หยุดชั่วคราว"
              : paused
                ? "เล่นต่อ (Space)"
                : "หยุดชั่วคราว (Space)"
          }
          className={`grid shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-onink transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100 ${
            compact ? "h-14 w-14" : "h-16 w-16"
          }`}
        >
          {/* ไม่มีเพลงอยู่ก็ต้องเป็นรูปสามเหลี่ยมเล่น ไม่ใช่รูปหยุด
              ปุ่มหยุดบนตัวเล่นที่ไม่ได้เล่นอะไรอยู่อ่านได้ว่า "กำลังเล่นอยู่" */}
          {playing && !paused ? (
            <IconPause className="h-7 w-7" />
          ) : (
            <IconPlay className="ml-1 h-7 w-7" />
          )}
        </button>

        <button
          type="button"
          disabled={!playing}
          onClick={() => void skip()}
          aria-label="ข้ามเพลงนี้"
          title={compact ? "ข้ามเพลงนี้" : "ข้ามเพลงนี้ (N)"}
          className={`grid h-13 w-13 shrink-0 place-items-center rounded-full text-ink ${onStage}`}
        >
          <IconSkip className="h-6 w-6" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* ข้าม = เก็บไว้ในประวัติ ดึงกลับมาต่อคิวได้
            ลบทิ้ง = หายถาวร ไว้ใช้กับของที่ไม่อยากให้ค้างอยู่ในระบบเลย */}
        <button
          type="button"
          disabled={!playing}
          onClick={() => void dropPlaying()}
          title="ลบเพลงนี้ทิ้งถาวร ไม่เก็บไว้ในประวัติ"
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-danger ${onStage}`}
        >
          <IconTrash className="h-4 w-4" />
          ลบทิ้ง
        </button>

        {youtube && (
          <a
            href={youtube}
            target="_blank"
            rel="noreferrer noopener"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-ink ${onStage}`}
          >
            <IconExternal className="h-4 w-4" />
            เปิดใน YouTube
          </a>
        )}
      </div>

      <div className="flex w-full items-center gap-1 sm:ml-auto sm:w-64">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
          title={compact ? undefined : muted ? "เปิดเสียง (M)" : "ปิดเสียง (M)"}
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-ink/8"
        >
          {muted || volume === 0 ? (
            <IconMute className="h-5 w-5" />
          ) : (
            <IconVolume className="h-5 w-5" />
          )}
        </button>
        <Slider
          label="ระดับเสียง"
          value={volume}
          max={100}
          dim={muted}
          onChange={setVolume}
          className="min-w-0 flex-1"
        />
        <span className="num w-8 shrink-0 text-right text-sm text-muted">{volume}</span>
      </div>
    </div>
  );

  const stage = (
    <section
      aria-label="เพลงที่กำลังเล่น"
      className={`min-w-0 rounded-stage p-3 ${compact ? "sm:p-4" : "sm:p-5 lg:col-start-1 lg:row-start-1"}`}
      style={stageStyle(palette, !!playing)}
    >
      {video}
      <div className="px-1 pt-5 pb-1 sm:px-2">
        {nowPlaying}
        {progress}
        {transport}

        {/* ---------- เพลงถัดไป + คีย์ลัด ---------- */}
        {!compact && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ink/10 pt-4">
            <p className="min-w-0 flex-1 truncate text-sm text-muted">
              {queued[0] ? (
                <>
                  ถัดไป <span className="font-medium text-ink">{queued[0].title}</span>
                </>
              ) : (
                "ไม่มีเพลงต่อคิว"
              )}
            </p>
            {/* คีย์ลัดใช้ได้เฉพาะคนที่มีคีย์บอร์ด จอเล็กไม่ต้องเห็น */}
            <p className="hidden shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:flex">
              <span>
                <Key>Space</Key> เล่น/หยุด
              </span>
              <span>
                <Key>N</Key> ข้าม
              </span>
              <span>
                <Key>M</Key> ปิดเสียง
              </span>
              <span>
                <Key>↑↓</Key> เสียง
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );

  /* ---------- ฝังในหน้าอื่น ---------- */
  if (compact) return stage;

  /*
    ---------- หน้าเต็ม ----------
    คืนเป็นสองก้อนให้กริดของหน้า /player/ จัดวาง: เวทีอยู่คอลัมน์ซ้ายแถวแรก
    คิวอยู่คอลัมน์ขวาคร่อมทุกแถว คอนโซลของหน้าแม่จึงต่อใต้เวทีได้
    โดยที่คิวยังเกาะอยู่ข้างๆ (บนจอแคบเรียงลงมา: เวที คิว คอนโซล)
  */
  return (
    <>
      {stage}

      {/*
        แถบขวาเกาะอยู่กับที่ตอนเลื่อนหน้า และมีรางเลื่อนของตัวเองบนจอกว้าง

        หน้านี้ยาวกว่าจอเสมอ (มีคอนโซลต่อท้ายอีกก้อน) ถ้าปล่อยให้เลื่อนไปพร้อมกัน
        พอเลื่อนลงไปหาเพลงในคอนโซล คิวที่กำลังจะถึงก็หายไปจากจอด้วย
        ทั้งที่นั่นคือสิ่งที่ต้องเห็นตลอดเวลาระหว่างไลฟ์
      */}
      <aside className="min-w-0 lg:sticky lg:top-22 lg:col-start-2 lg:row-span-full lg:-mx-2 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-2 lg:pb-2">
        <section aria-labelledby="player-queue-title">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="player-queue-title" className="text-title font-bold">
              คิวถัดไป
              <span className="num ml-2 font-normal text-muted">{queued.length}</span>
            </h2>
            {queued.length > 0 && <p className="text-sm text-muted">กดเพลงเพื่อเล่นทันที</p>}
          </div>

          {queued.length === 0 ? (
            <p className="mt-3 text-muted">
              ยังไม่มีใครขอเพลง{" "}
              {fillerOn
                ? "ตัวเล่นจะหยิบจากเพลงสำรองมาเล่นให้เอง"
                : "ตั้งเพลงสำรองไว้ที่แท็บเพลงสำรอง ไลฟ์จะได้ไม่เงียบ"}
            </p>
          ) : (
            <ol className="rows @container mt-3">
              {queued.map((s, i) => {
                /* เลื่อนได้เฉพาะในกลุ่มเดียวกัน เพลงที่คนขอกับเพลงสำรองอยู่คนละชั้น
                   ปุ่มจึงต้องดูจากตำแหน่งในกลุ่ม ไม่ใช่ตำแหน่งในคิวรวม */
                const group = queued.filter(
                  (x) => (x.source === "filler") === (s.source === "filler"),
                );
                const seat = group.findIndex((x) => x.id === s.id);
                return (
                  <motion.li key={s.id} layout={!reduced}>
                    <QueueRow
                      no={i + 1}
                      videoId={s.videoId}
                      title={s.title}
                      sub={
                        s.source === "filler"
                          ? "เพลงสำรอง"
                          : s.source === "tiktok"
                            ? `ขอโดย ${s.byName} ผ่าน TikTok`
                            : `ขอโดย ${s.byName}`
                      }
                      onClick={() => void playNow(s)}
                      onMove={(dir) => void moveSongInQueue(channelId, queued, s.id, dir)}
                      onRemove={() => void removeSongRequest(channelId, s.id)}
                      canUp={seat > 0}
                      canDown={seat < group.length - 1}
                    />
                  </motion.li>
                );
              })}
            </ol>
          )}

          {done.length > 0 && (
            <p className="mt-4 text-sm text-muted">เล่นจบแล้ว {done.length} เพลง</p>
          )}
        </section>

        {/* ---------- เพลงสำรอง ----------
            พับไว้เป็นค่าเริ่มต้น กางเมื่ออยากเลือกเพลงเอง
            มีช่องค้นหาเมื่อกองใหญ่ — เลื่อนหาในกองร้อยเพลงระหว่างไลฟ์ไม่ไหว */}
        {!!filler?.length && (
          <section aria-labelledby="player-filler-title" className="mt-8 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setOpenFiller((v) => !v)}
              aria-expanded={openFiller}
              aria-controls="player-filler-list"
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 text-left"
            >
              <span id="player-filler-title" className="min-w-0 flex-1 text-lg font-bold">
                เพลงสำรอง
                <span className="num ml-2 font-normal text-muted">{filler.length}</span>
              </span>
              {fillerMode === "off" && <Badge>ปิดอยู่</Badge>}
              <IconChevronDown
                className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${
                  openFiller ? "rotate-180" : ""
                }`}
              />
            </button>

            <p className="text-sm text-muted">
              {fillerMode === "off"
                ? "ตัวเล่นจะไม่หยิบมาเล่นเอง แต่กดเลือกเพลงไปต่อคิวได้"
                : fillerMode === "shuffle"
                  ? "สุ่มเล่นตอนคิวว่าง บอกล่วงหน้าไม่ได้ว่าเพลงไหนจะมา กดเลือกเพลงไปต่อคิวเองได้"
                  : "เล่นตามลำดับตอนคิวว่าง เพลงที่ติดป้าย “ถัดไป” คือเพลงที่จะมาต่อ"}
            </p>

            {openFiller && (
              <div id="player-filler-list" className="mt-4">
                {filler.length > 8 && (
                  <label className="flex min-h-11 items-center gap-2.5 rounded-full bg-fill px-4">
                    <IconSearch className="h-4 w-4 shrink-0 text-muted" />
                    <span className="sr-only">ค้นในเพลงสำรอง</span>
                    <input
                      value={fillerQ}
                      onChange={(e) => setFillerQ(e.target.value)}
                      placeholder="ค้นชื่อเพลงหรือชื่อช่อง"
                      className="min-w-0 grow bg-transparent outline-none placeholder:text-faint"
                    />
                  </label>
                )}

                {shownFiller.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    ไม่เจอเพลงสำรองที่มีคำว่า &ldquo;{fillerQ.trim()}&rdquo;
                  </p>
                ) : (
                  <ol className="rows @container mt-2">
                    {shownFiller.map((t) => (
                      <li key={t.videoId}>
                        <QueueRow
                          no={filler.indexOf(t) + 1}
                          videoId={t.videoId}
                          title={t.title}
                          sub={t.author}
                          dim
                          marked={t.videoId === nextFillerId}
                          hint="กดเพื่อต่อคิว"
                          onClick={() => void queueTrack(t)}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </section>
        )}
      </aside>
    </>
  );
}

/* =========================================================================
   ชิ้นส่วนของตัวเล่น
   ========================================================================= */

/**
 * แผ่นบังในกรอบวิดีโอ — บอกสถานะที่ทำให้ตัวเล่นยังไม่ส่งเสียง
 *
 * จอเล็ก (กรอบแคบกว่า 20rem) ซ่อนคำอธิบาย เหลือหัวข้อกับปุ่ม ไม่งั้นล้นกรอบ
 * ยกเว้นแผ่นที่ไม่มีปุ่ม (essential) คำอธิบายคือทางแก้ทางเดียว ต้องโชว์เสมอ
 * จัดกลางด้วย m-auto ในกล่องเลื่อนได้ ล้นเมื่อไหร่ยังเลื่อนขึ้นไปอ่านหัวได้
 */
function Veil({
  title,
  body,
  tone,
  essential = false,
  children,
}: {
  title: string;
  body?: ReactNode;
  tone?: "danger";
  essential?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex overflow-y-auto bg-canvas p-5 text-center">
      <div className="m-auto max-w-sm">
        <p className={`text-lg font-bold ${tone === "danger" ? "text-danger" : ""}`}>{title}</p>
        {body && (
          <p className={`mt-1 text-sm text-muted ${essential ? "" : "hidden @[20rem]:block"}`}>
            {body}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * แถบเลื่อน (เวลาในเพลง / ระดับเสียง)
 *
 * ตัวที่รับนิ้ว/เมาส์/คีย์บอร์ดคือ input[type=range] ของจริงที่โปร่งใสวางทับ
 * ส่วนที่เห็นเป็นรางบางกับจุดกลมที่วาดเอง หน้าตาจึงเหมือนกันทุกเบราว์เซอร์และทั้งสองธีม
 * รางวาดหดเข้าข้างละ 8px ให้ตรงกับระยะที่จุดของ range จริงวิ่งได้ (ครึ่งหนึ่งของจุด)
 * กล่องสูง 44px ให้แตะโดนง่าย แม้รางที่เห็นจะบางแค่ 6px
 */
function Slider({
  label,
  value,
  max,
  onChange,
  disabled = false,
  dim = false,
  className = "",
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** จางลงแต่ยังเลื่อนได้ — ระดับเสียงตอนกดปิดเสียงไว้ */
  dim?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`relative h-11 rounded-full has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink ${
        disabled ? "opacity-40" : dim ? "opacity-50" : ""
      } ${className}`}
    >
      <span className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/15">
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${pct}%` }} />
        {!disabled && (
          <span
            aria-hidden
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
            style={{ left: `${pct}%` }}
          />
        )}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** ปุ่มคีย์บอร์ดในคำอธิบายคีย์ลัด */
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="num mr-1 inline-grid min-w-6 place-items-center rounded-thumb border border-ink/15 px-1.5 font-sans text-xs font-medium text-ink">
      {children}
    </kbd>
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
      toast(open ? "ปิดรับเพลงแล้ว" : "เปิดรับเพลงแล้ว", "success", 1800);
    } catch {
      toast("เปลี่ยนไม่สำเร็จ ต้องล็อกอินด้วยบัญชีเจ้าของช่องถึงจะแก้ได้", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {open ? (
        <Badge tone="open" dot>
          เปิดรับเพลงอยู่
        </Badge>
      ) : (
        <Badge>ปิดรับเพลงอยู่</Badge>
      )}
      <Button variant={open ? "danger" : "primary"} loading={busy} onClick={() => void flip()}>
        {open ? "ปิดรับเพลง" : "เปิดรับเพลง"}
      </Button>
    </div>
  );
}

/**
 * แถวเพลงในคิว — กดได้ทั้งแถวเพื่อเล่นเพลงนั้นทันที
 * เป็น button ทั้งใบ ไม่ใช่ปุ่มเล็กมุมขวา จะได้กดง่ายตอนรีบระหว่างไลฟ์
 *
 * ปุ่มเลื่อนลำดับ/เอาออกวางเรียงท้ายแถวเมื่อรายการกว้างพอ (≥ 26rem)
 * ถ้าแคบกว่านั้น (มือถือ คอลัมน์แคบ) ปุ่มทั้งชุดพับไว้หลังปุ่ม "…"
 * ไม่งั้นปุ่มสี่ปุ่มขนาดนิ้วแตะจะเบียดชื่อเพลงจนเหลือไม่กี่ตัวอักษร
 * ต้องมี @container อยู่ที่รายการชั้นนอก (ดู <ol> ของคิว)
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
  hint = "กดเพื่อเล่นเพลงนี้เลย",
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
  /** เพลงที่ยังไม่ได้เข้าคิว (กองสำรอง) — เลขลำดับเบาลง */
  dim?: boolean;
  marked?: boolean;
  /** ข้อความบอกว่ากดแล้วเกิดอะไร — คิวกับกองสำรองทำคนละอย่าง */
  hint?: string;
}) {
  const [tools, setTools] = useState(false);
  const hasTools = !!(onMove || onRemove);

  /* inline = ชุดที่เรียงท้ายแถว — เครื่องที่ใช้เมาส์ได้ปุ่มเล็กลง (เล็งได้แม่นอยู่แล้ว)
     ชื่อเพลงในคอลัมน์คิวจะได้ไม่ถูกเบียดเหลือไม่กี่ตัวอักษร จอสัมผัสยังได้ 44px เต็ม */
  const buttons = (inline: boolean) => {
    const size = inline ? "pointer-fine:h-9 pointer-fine:w-8" : "";
    return (
      <>
        {onMove && (
          <>
            <RowBtn
              label="ดันขึ้นหัวคิว"
              disabled={!canUp}
              onClick={() => onMove("top")}
              className={size}
            >
              <IconToTop className="h-4.5 w-4.5" />
            </RowBtn>
            <RowBtn
              label="เลื่อนขึ้น"
              disabled={!canUp}
              onClick={() => onMove("up")}
              className={size}
            >
              <IconArrowUp className="h-4.5 w-4.5" />
            </RowBtn>
            <RowBtn
              label="เลื่อนลง"
              disabled={!canDown}
              onClick={() => onMove("down")}
              className={size}
            >
              <IconArrowDown className="h-4.5 w-4.5" />
            </RowBtn>
          </>
        )}
        {onRemove && (
          <RowBtn label="เอาออกจากคิว" onClick={onRemove} danger className={size}>
            <IconClose className="h-4.5 w-4.5" />
          </RowBtn>
        )}
      </>
    );
  };

  /* ปุ่มซ้อนในปุ่มไม่ได้ ตัวแถวจึงเป็น div แล้วให้ส่วนเนื้อหาเป็นปุ่มกดเล่น
     ส่วนปุ่มเลื่อนลำดับวางเป็นพี่น้องข้างๆ */
  return (
    <div className="group py-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClick}
          title={hint}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-field py-2 pr-2 pl-1 text-left transition-colors hover:bg-fill"
        >
          <span
            className={`num w-6 shrink-0 text-center text-muted ${dim ? "font-normal" : "font-semibold"}`}
          >
            {no}
          </span>
          <Cover videoId={videoId} size="sm" className="w-16" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 leading-snug font-medium wrap-break-word">{title}</span>
            <span className="mt-0.5 block truncate text-sm text-muted">{sub}</span>
          </span>
          {marked && <Badge tone="ink">ถัดไป</Badge>}
        </button>

        {hasTools && (
          <>
            {/* จอสัมผัสไม่มี hover — ปุ่มที่จางรอ hover เท่ากับปุ่มที่มองไม่เห็นบนมือถือ
                จึงจางรอเฉพาะเครื่องที่มีเมาส์จริง (pointer: fine) */}
            <div className="hidden shrink-0 items-center transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-fine:opacity-40 @[26rem]:flex">
              {buttons(true)}
            </div>
            <RowBtn
              label={tools ? "ซ่อนปุ่มจัดลำดับ" : "เลื่อนลำดับหรือเอาออก"}
              onClick={() => setTools((v) => !v)}
              expanded={tools}
              className="@[26rem]:hidden"
            >
              <IconMore className="h-5 w-5" />
            </RowBtn>
          </>
        )}
      </div>

      {hasTools && tools && (
        <div className="flex justify-end gap-1 pb-1 @[26rem]:hidden">{buttons(false)}</div>
      )}
    </div>
  );
}

function RowBtn({
  label,
  disabled = false,
  onClick,
  children,
  danger = false,
  expanded,
  className = "",
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted ${
        danger ? "hover:bg-fill hover:text-danger" : "hover:bg-fill hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* =========================================================================
   หน้า /player/ — ตัวเล่นเต็มจอ ไว้เปิดทิ้งไว้อีกจอ
   ========================================================================= */

/* อ้างอิงคงที่ ไม่งั้น setState ตอน error จะสร้างอาร์เรย์ใหม่แล้วรีเรนเดอร์ไม่จบ */
const NO_CHANNELS: Channel[] = [];

export default function SongPlayer() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const { admin } = useSiteRole();
  const uid = user && !user.anonymous ? user.uid : null;

  /*
    เลือกช่องที่จะเล่นยังไง

    #ch= ในลิงก์ชนะเสมอ — เป็นทั้งที่คั่นหน้าและทางที่ผู้ดูแลใช้เปิดคิวช่องคนอื่น
    ไม่มี #ch= ก็ดูจากช่องที่ "คนนี้แตะได้จริง":
      ผู้ดูแล   → ทุกช่องในระบบ จึงต้องให้เลือกก่อนเสมอ (เดาแทนไม่ได้ว่าจะเล่นของใคร)
      สตรีมเมอร์ → เฉพาะช่องตัวเอง มีช่องเดียวก็เข้าตัวเล่นเลย ไม่ต้องกดผ่านหน้าเลือก
  */
  const chParam = useHashParam("ch");
  const [mine, setMine] = useState<Channel[]>(NO_CHANNELS);
  const [minesLoaded, setMinesLoaded] = useState(false);

  useEffect(() => {
    if (!uid || chParam) return;
    return watchMyChannels(
      uid,
      (list) => {
        setMine(list);
        setMinesLoaded(true);
      },
      () => {
        setMine(NO_CHANNELS);
        setMinesLoaded(true);
      },
    );
  }, [uid, chParam]);

  const autoId = !admin && mine.length === 1 ? mine[0].id : null;
  const channelId = chParam ?? autoId;

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

  if (!uid) {
    return (
      <EmptyState
        title="ยังไม่รู้ว่าจะเล่นคิวของช่องไหน"
        description="ล็อกอินด้วยบัญชีเจ้าของช่อง หรือใส่รหัสช่องต่อท้ายลิงก์เป็น #ch=รหัสช่อง"
      />
    );
  }

  if (!channelId) {
    return <ChannelPicker admin={admin} mine={mine} loaded={minesLoaded} />;
  }

  return (
    <div>
      {/* หัวหน้าสั้นที่สุดเท่าที่ทำได้ — คำอธิบายยาวๆ ย้ายไปอยู่ในกล่องที่พับได้ข้างล่าง

          หน้านี้เป็นหน้าที่เปิดค้างไว้ทั้งไลฟ์ ไม่ใช่หน้าที่เข้ามาอ่าน —
          ย่อหน้าสี่บรรทัดตรงหัวจึงกินที่ของตัวเล่นไปเปล่าๆ ทุกวินาทีหลังอ่านจบรอบแรก */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-headline font-bold wrap-break-word">
            {channel?.name ? `คิวของ ${channel.name}` : "เล่นเพลงตามคิว"}
          </h1>
          <p className="mt-1.5 max-w-prose text-muted">
            มีคนขอเพลงเข้ามาก็เล่นเลย เพลงจบก็ต่อเพลงถัดไปเอง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ทางกลับไปหน้าเลือกช่อง — โผล่เฉพาะคนที่มีให้เลือกจริงมากกว่าหนึ่งช่อง */}
          {(admin || mine.length > 1) && (
            <Button
              variant="secondary"
              onClick={() => {
                window.location.hash = "";
              }}
            >
              เปลี่ยนช่อง
            </Button>
          )}
          <AcceptToggle channelId={channelId} channel={channel} />
        </div>
      </header>

      {/*
        กริดหลัก — จอกว้าง: ซ้าย = เวที แล้วต่อด้วยคอนโซล / ขวา = คิว (เกาะจอ)
        จอแคบ: เวที คิว คอนโซล เรียงลงมาตามลำดับใน DOM
        SongPlayerCore คืนเวทีกับคิวเป็นสองก้อนแยกกันให้กริดนี้วางเอง
        แถวสุดท้ายเป็น 1fr ให้ช่องว่างส่วนเกิน (ตอนคิวยาวกว่าฝั่งซ้าย) ไปกองท้ายสุด
        ไม่ไปถ่างระยะระหว่างเวทีกับคอนโซล
        items-start ไม่งั้นแต่ละก้อนจะถูกยืดให้สูงเท่าแถวแล้วเหลือพื้นที่ว่างโล่ง
        (และคิวที่ถูกยืดจะเกาะจอแบบ sticky ไม่ได้)
      */}
      <div className="mt-6 grid gap-x-10 gap-y-10 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:items-start xl:grid-cols-[minmax(0,1fr)_30rem]">
        <SongPlayerCore
          channelId={channelId}
          filler={channel?.songs?.filler}
          fillerMode={channel?.songs?.fillerMode ?? "off"}
          onUnplayable={(videoId, code) => {
            /*
              เพลงสำรองที่ฝังไม่ได้ = ขยะในกองที่เราใส่เอง เขี่ยออกถาวร
              ถ้าไม่เอาออก โหมดสุ่มจะวนกลับมาเจอใบเดิมค้างซ้ำที่เดิมไม่จบ
              (กองจริงของช่องนี้มี 37 จาก 89 เพลงที่เจ้าของปิดการฝัง)
            */
            const list = channel?.songs?.filler ?? [];
            const gone = list.find((t) => t.videoId === videoId);
            if (!gone) return;
            void saveFillerList(
              channelId,
              list.filter((t) => t.videoId !== videoId),
            ).then(() =>
              toast(
                `เอา "${gone.title.slice(0, 26)}" ออกจากเพลงสำรองแล้ว เจ้าของคลิปปิดการฝังไว้ (รหัส ${code})`,
                "info",
                5000,
              ),
            );
          }}
        />
        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
          <SongConsole channelId={channelId} channel={channel} />
          <SetupNote />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   หน้าเลือกช่อง — ด่านแรกของผู้ดูแล (สตรีมเมอร์ช่องเดียวไม่เจอหน้านี้)
   ========================================================================= */

function ChannelPicker({
  admin,
  mine,
  loaded,
}: {
  admin: boolean;
  mine: Channel[];
  loaded: boolean;
}) {
  const [all, setAll] = useState<Channel[]>(NO_CHANNELS);
  const [allLoaded, setAllLoaded] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!admin) return;
    return watchAllChannels(
      (list) => {
        setAll(list);
        setAllLoaded(true);
      },
      () => {
        setAll(NO_CHANNELS);
        setAllLoaded(true);
      },
    );
  }, [admin]);

  const list = admin ? all : mine;
  const ready = admin ? allLoaded : loaded;

  const found = useMemo(() => {
    const text = q.trim().toLocaleLowerCase("th");
    if (!text) return list;
    return list.filter((c) =>
      [c.name, c.handle].filter(Boolean).some((v) => v!.toLocaleLowerCase("th").includes(text)),
    );
  }, [list, q]);

  /* ช่องที่เปิดคิวขอเพลงไว้ต้องมาก่อน — หน้านี้มีไว้เล่นเพลง ไม่ใช่ไว้ดูรายชื่อช่อง */
  const sorted = useMemo(() => {
    const on = found.filter((c) => c.songs?.enabled);
    const off = found.filter((c) => !c.songs?.enabled);
    return [...on, ...off];
  }, [found]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-headline font-bold">จะเล่นคิวของช่องไหน</h1>
      <p className="mt-1.5 max-w-prose text-muted">
        {admin
          ? "คุณเป็นผู้ดูแลระบบ เปิดคิวของช่องไหนก็ได้ เลือกช่องแล้วตัวเล่นจะเปิดขึ้นมา"
          : "เลือกช่องที่จะเปิดตัวเล่น"}
      </p>

      {admin && list.length > 8 && (
        <label className="mt-6 flex min-h-11 w-full items-center gap-2.5 rounded-full bg-fill px-4 sm:w-80">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <span className="sr-only">ค้นหาช่อง</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อช่องหรือ @handle"
            className="min-w-0 grow bg-transparent outline-none placeholder:text-faint"
          />
        </label>
      )}

      <div className="mt-6">
        {!ready ? (
          <div className="rows" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3.5">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title={q ? `ไม่เจอช่องที่มีคำว่า "${q.trim()}"` : "ยังไม่มีช่องให้เล่น"}
            description={
              q
                ? "ลองพิมพ์แค่บางส่วนของชื่อช่อง หรือชื่อหลัง @"
                : admin
                  ? "ช่องจะขึ้นที่นี่หลังเจ้าของช่องบันทึกการตั้งค่าครั้งแรก"
                  : "ตั้งค่าช่องของคุณให้เสร็จก่อน แล้วกลับมาเปิดตัวเล่นที่นี่"
            }
            action={
              !admin ? (
                <Link
                  href="/studio/channel/"
                  className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
                >
                  ไปตั้งค่าช่อง
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="rows -mx-3">
            {sorted.map((c) => {
              const on = !!c.songs?.enabled;
              const avatar = c.avatar ? safeImageSrc(c.avatar) : null;
              return (
                <li key={c.id} className="py-1">
                  <button
                    type="button"
                    /* เก็บช่องที่เลือกไว้ใน #ch= จะได้คั่นหน้าไว้เปิดตรงคราวหน้าได้ */
                    onClick={() => {
                      window.location.hash = `ch=${c.id}`;
                    }}
                    className="flex min-h-16 w-full cursor-pointer items-center gap-4 rounded-field px-3 py-2.5 text-left transition-colors hover:bg-fill"
                  >
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-full bg-fill object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fill text-lg font-bold text-muted">
                        {(c.name || c.handle || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {c.name || c.handle || c.id}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {c.handle ? `@${c.handle}` : c.id}
                      </span>
                    </span>

                    {on ? (
                      <Badge tone="open" dot>
                        เปิดรับเพลง
                      </Badge>
                    ) : (
                      <Badge>ปิดรับเพลง</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * วิธีเอาเสียงเข้าไลฟ์ — พับไว้ ไม่ใช่ย่อหน้าค้างอยู่กลางหน้า
 *
 * เป็นเรื่องที่ต้องอ่านครั้งเดียวตอนตั้งระบบ แล้วไม่ต้องอ่านอีกเลย
 * แต่ถ้าไม่มีเลยก็จะมีคนเอาลิงก์หน้านี้ไปใส่ Browser Source แล้วงงว่าทำไมมีโฆษณา
 */
function SetupNote() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-sheet bg-fill px-5 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="player-setup-note"
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1 font-bold">เอาเสียงเข้าไลฟ์ยังไง</span>
        <IconChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div id="player-setup-note" className="max-w-prose space-y-3 pb-5 text-muted">
          <p>
            เปิดหน้านี้ใน<strong className="font-semibold text-ink">เบราว์เซอร์ปกติ</strong>
            ที่ล็อกอิน YouTube Premium ไว้ แล้วดึงเสียงเข้า OBS ทาง Desktop Audio
            หรือจับหน้าต่างนี้เป็น Window Capture
          </p>
          <p>
            อย่าเอาลิงก์หน้านี้ไปใส่ Browser Source ของ OBS
            ตรงนั้นมีคุกกี้แยกของตัวเอง ไม่ได้ล็อกอิน YouTube จึงมีโฆษณาคั่นกลางเพลง
          </p>
          <p>
            ถ้าอยากให้คนดูเห็นว่ากำลังเล่นเพลงอะไร ใช้ widget เพลงจากหน้า{" "}
            <Link
              href="/studio/widgets/"
              className="font-medium text-ink underline underline-offset-2"
            >
              ลิงก์สำหรับ OBS
            </Link>{" "}
            ซึ่งเป็นคนละลิงก์กับหน้านี้
          </p>
        </div>
      )}
    </section>
  );
}
