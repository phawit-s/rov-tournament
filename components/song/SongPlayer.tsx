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
import { thumbUrl, watchUrl } from "@/lib/song/youtube";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/song/yt-api";
import type { FillerTrack, SongRequest } from "@/lib/song/types";
import Button from "../ui/Button";
import MiniBtn, { MiniLink } from "../ui/MiniBtn";
import Panel, { PanelHeader } from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { toast } from "../ui/Toast";
import {
  IconChevronDown,
  IconMute,
  IconPause,
  IconPlay,
  IconSearch,
  IconSkip,
  IconTrash,
  IconVolume,
} from "../ui/icons";
import { Badge, EmptyState, Input, Skeleton } from "../tournament/ui";
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
                if (cur && playedOkRef.current) void advance(cur);
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
                onUnplayable?.(song.videoId, e.data);
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
  }, [advance, onUnplayable]);

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
    if (!p) return;
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

  const stage = (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {/* ตัวเล่นต้องอยู่ใน DOM ตลอด ไม่งั้นสร้าง player ใหม่ทุกครั้งที่เปลี่ยนเพลง */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ทึบเกือบสนิท ไม่ใช่โปร่ง 70% — ข้างหลังคือจอเปล่าของ YouTube ที่มีปุ่มเล่น
          สีแดงดวงใหญ่อยู่กลางจอ ถ้าปล่อยให้เห็นลางๆ มันจะทับข้อความพอดี
          แล้วดูเหมือนมีอะไรค้างรอให้กด ทั้งที่ตรงนั้นกดไปก็ไม่มีอะไรเกิดขึ้น */}
      {!playing && !apiError && active && (
        <div className="absolute inset-0 grid place-items-center bg-black/92 px-6 text-center">
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

      {/*
        คลิปเล่นไม่ได้ — บอกให้เห็นแล้วมีปุ่มข้ามให้ตรงนั้นเลย
        ไม่ข้ามให้เองเพราะกองสำรองที่เต็มไปด้วยคลิปแบบนี้จะโดนไล่ข้ามจนเกลี้ยง
        ซ่อนตอน blocked เพราะกรณีนั้นไม่ใช่ความผิดของคลิป กดเริ่มแล้วเล่นได้
      */}
      {failed && !blocked && playing && active && !apiError && (
        <div className="absolute inset-x-0 bottom-0 grid place-items-center bg-black/88 px-6 py-5 text-center backdrop-blur-sm">
          <p className="font-display text-sm text-ice">คลิปนี้เล่นในเว็บอื่นไม่ได้</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            เจ้าของคลิปปิดการฝังไว้ ต้องไปดูในเว็บ YouTube เท่านั้น
          </p>
          <Button size="sm" variant="ghost" onClick={() => void skip()} className="mt-3">
            ข้ามเพลงนี้
          </Button>
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

  /* ความยาวคลิปมาช้ากว่าตัวคลิปเสมอ ระหว่างที่ยังไม่รู้ให้แถบว่างไว้ ไม่ใช่ 0:00 ค้าง */
  const known = len > 0;
  const sliderMax = known ? Math.round(len) : 1;
  const sliderAt = known ? Math.min(Math.round(at), sliderMax) : 0;

  const controls = (
    <>
      {/* ---------- เพลงที่กำลังเล่น ---------- */}
      {playing ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge rgb="255 91 122" tone="live">
              กำลังเล่น
            </Badge>
            {playing.source === "filler" && (
              <span className="slug slug-2">เพลงสำรอง</span>
            )}
          </div>
          <h2
            className={`mt-2 font-display leading-snug font-light text-ice ${
              compact ? "text-base" : "text-xl"
            }`}
          >
            {playing.title}
          </h2>
          <p className="mt-1 truncate text-sm text-muted">
            {playing.author}
            {playing.source !== "filler" && ` · ขอโดย ${playing.byName}`}
          </p>
          {playing.message && (
            <p className="mt-2 text-sm text-iris/80">
              &ldquo;{playing.message}&rdquo;
            </p>
          )}
        </>
      ) : (
        <>
          <span className="slug slug-2">ว่างอยู่</span>
          <p className="mt-1.5 text-sm text-muted">
            {queued.length > 0 ? "กำลังเริ่มเพลงถัดไป…" : "ยังไม่มีใครขอเพลงเข้ามา"}
          </p>
        </>
      )}

      {/* ---------- แถบเวลา ----------
          เป็น input[type=range] จริง เลื่อนหาจุดในเพลงได้ และกดลูกศรจาก
          คีย์บอร์ดได้ในตัว ไม่ต้องเขียนตัวลากเอง */}
      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={sliderAt}
          disabled={!playing || !known}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full disabled:opacity-45"
          style={{ ["--fill" as string]: known ? sliderAt / sliderMax : 0 }}
          aria-label="ตำแหน่งในเพลง"
        />
        <div className="mt-1 flex items-baseline justify-between">
          <span className="num text-xs text-muted">
            {known ? formatClock(at) : "—"}
          </span>
          {/* เวลาที่เหลือคือตัวเลขที่คนคุมไลฟ์ต้องใช้จริง ไม่ใช่ความยาวคลิป */}
          <span className="num text-xs text-muted/75">
            {known ? `เหลือ ${formatClock(Math.max(0, len - at))}` : ""}
          </span>
        </div>
      </div>

      {/* ---------- ปุ่มควบคุม ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePause}
          disabled={!playing}
          aria-label={paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
          title={
            compact
              ? paused
                ? "เล่นต่อ"
                : "หยุดชั่วคราว"
              : paused
                ? "เล่นต่อ (Space)"
                : "หยุดชั่วคราว (Space)"
          }
          className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full accent-fill text-onaccent shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_34px_-18px_rgba(169,155,255,0.9)] transition-all duration-200 hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-none disabled:text-muted disabled:shadow-none disabled:ring-1 disabled:ring-[rgb(var(--hair)/var(--hair-a))]"
        >
          {/* ไม่มีเพลงอยู่ก็ต้องเป็นรูปสามเหลี่ยมเล่น ไม่ใช่รูปหยุด
              ปุ่มหยุดบนตัวเล่นที่ไม่ได้เล่นอะไรอยู่อ่านได้ว่า "กำลังเล่นอยู่" */}
          {playing && !paused ? (
            <IconPause className="h-5 w-5" />
          ) : (
            <IconPlay className="ml-0.5 h-5 w-5" />
          )}
        </button>

        <MiniBtn
          disabled={!playing}
          onClick={() => void skip()}
          title={compact ? "ข้ามเพลงนี้" : "ข้ามเพลงนี้ (N)"}
        >
          <IconSkip className="h-3.5 w-3.5" />
          ข้าม
        </MiniBtn>

        {/* ข้าม = เก็บไว้ในประวัติ ดึงกลับมาต่อคิวได้
            ลบทิ้ง = หายถาวร ไว้ใช้กับของที่ไม่อยากให้ค้างอยู่ในระบบเลย */}
        <MiniBtn danger disabled={!playing} onClick={() => void dropPlaying()}>
          <IconTrash className="h-3.5 w-3.5" />
          ลบทิ้ง
        </MiniBtn>

        {playing && <MiniLink href={playing.url}>YouTube</MiniLink>}

        <div className="ml-auto flex min-w-45 flex-1 items-center gap-1.5 sm:flex-none">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
            title={compact ? undefined : muted ? "เปิดเสียง (M)" : "ปิดเสียง (M)"}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-iris/12 hover:text-iris"
          >
            {muted || volume === 0 ? (
              <IconMute className="h-4 w-4" />
            ) : (
              <IconVolume className="h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className={`min-w-0 flex-1 ${muted ? "opacity-45" : ""}`}
            style={{ ["--fill" as string]: volume / 100 }}
            aria-label="ระดับเสียง"
          />
          <span className="num w-7 shrink-0 text-right text-xs text-muted">
            {volume}
          </span>
        </div>
      </div>

      {/* ---------- เพลงถัดไป + คีย์ลัด ---------- */}
      {!compact && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hair pt-3">
          <p className="min-w-0 truncate text-xs text-muted">
            {queued[0] ? (
              <>
                <span className="slug slug-2 mr-2">ถัดไป</span>
                {queued[0].title}
              </>
            ) : (
              "ไม่มีเพลงต่อคิว"
            )}
          </p>
          <p className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted/80">
            <Key>Space</Key> เล่น/หยุด
            <Key>N</Key> ข้าม
            <Key>M</Key> ปิดเสียง
            <Key>↑↓</Key> เสียง
          </p>
        </div>
      )}
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
    <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr] lg:items-start">
      <Panel variant="feature" className="overflow-hidden p-0">
        {stage}
        <div className="p-5">{controls}</div>
      </Panel>

      {/*
        แถบขวาเกาะอยู่กับที่ตอนเลื่อนหน้า และมีรางเลื่อนของตัวเองบนจอกว้าง

        หน้านี้ยาวกว่าจอเสมอ (มีคอนโซลต่อท้ายอีกก้อน) ถ้าปล่อยให้เลื่อนไปพร้อมกัน
        พอเลื่อนลงไปหาเพลงในคอนโซล คิวที่กำลังจะถึงก็หายไปจากจอด้วย
        ทั้งที่นั่นคือสิ่งที่ต้องเห็นตลอดเวลาระหว่างไลฟ์
      */}
      <div className="space-y-4 lg:sticky lg:top-19 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1">
        <Panel className="p-5">
          <PanelHeader
            eyebrow="Queue"
            title="คิวถัดไป"
            count={queued.length}
            action={
              queued.length > 0 ? (
                <span className="slug slug-2">กดที่เพลงเพื่อเล่นเลย</span>
              ) : undefined
            }
          />

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
                const seat = group.findIndex((x) => x.id === s.id);
                return (
                  <motion.li key={s.id} layout={!reduced}>
                    <QueueRow
                      no={i + 1}
                      videoId={s.videoId}
                      title={s.title}
                      sub={
                        s.source === "filler"
                          ? "จากเพลย์ลิสต์สำรอง"
                          : `ขอโดย ${s.byName}`
                      }
                      onClick={() => void playNow(s)}
                      onMove={(dir) =>
                        void moveSongInQueue(channelId, queued, s.id, dir)
                      }
                      onRemove={() => void removeSongRequest(channelId, s.id)}
                      canUp={seat > 0}
                      canDown={seat < group.length - 1}
                    />
                  </motion.li>
                );
              })}
            </ul>
          )}

          {done.length > 0 && (
            <p className="mt-4 text-xs text-muted">เล่นจบแล้ว {done.length} เพลง</p>
          )}
        </Panel>

        {/* ---------- กองสำรอง ----------
            พับไว้เป็นค่าเริ่มต้น กางเมื่ออยากเลือกเพลงเอง
            มีช่องค้นหาเมื่อกองใหญ่ — เลื่อนหาในกองร้อยเพลงระหว่างไลฟ์ไม่ไหว */}
        {!!filler?.length && (
          <Panel variant="quiet" className="p-5">
            <button
              type="button"
              onClick={() => setOpenFiller((v) => !v)}
              aria-expanded={openFiller}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left"
            >
              <span className="slug slug-2 shrink-0">
                {fillerMode === "off" ? "กองสำรอง (ปิดอยู่)" : "กองสำรอง"}
              </span>
              <span className="rule h-px flex-1" />
              <span className="num shrink-0 text-xs text-muted">{filler.length}</span>
              <IconChevronDown
                className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${
                  openFiller ? "rotate-180" : ""
                }`}
              />
            </button>

            <p className="mt-2 text-xs leading-relaxed text-muted">
              {fillerMode === "off"
                ? "โหมดสำรองปิดอยู่ ระบบจะไม่หยิบมาเล่นเอง แต่กดเลือกเพลงเองได้"
                : fillerMode === "shuffle"
                  ? "โหมดสุ่ม — บอกล่วงหน้าไม่ได้ว่าเพลงไหนจะมา กดเลือกเองได้"
                  : "โหมดตามลำดับ — เพลงที่ติดป้ายคือเพลงที่จะมาเป็นตัวถัดไป"}
            </p>

            {openFiller && (
              <>
                {filler.length > 8 && (
                  <div className="relative mt-3">
                    <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <Input
                      value={fillerQ}
                      onChange={(e) => setFillerQ(e.target.value)}
                      placeholder="ค้นในกองสำรอง"
                      className="w-full pl-9"
                    />
                  </div>
                )}

                {shownFiller.length === 0 ? (
                  <p className="mt-3 text-xs text-muted">ไม่เจอเพลงที่ตรงกับคำค้นนี้</p>
                ) : (
                  <ul className="mt-3 space-y-2">
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
                  </ul>
                )}
              </>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

/** ปุ่มคีย์บอร์ดในคำอธิบายคีย์ลัด */
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="num rounded-md border border-hair px-1.5 py-0.5 font-display text-eyebrow text-ice/70">
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
      toast(open ? "ปิดรับคิวแล้ว" : "เปิดรับคิวแล้ว", "success", 1800);
    } catch {
      toast("เปลี่ยนไม่สำเร็จ — ต้องเป็นเจ้าของช่องถึงจะแก้ได้", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge rgb={open ? "52 227 176" : "126 130 153"} tone={open ? "live" : "plain"}>
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
  dim?: boolean;
  marked?: boolean;
  /** ข้อความบอกว่ากดแล้วเกิดอะไร — คิวกับกองสำรองทำคนละอย่าง */
  hint?: string;
}) {
  /* ปุ่มซ้อนในปุ่มไม่ได้ ตัวแถวจึงเป็น div แล้วให้ส่วนเนื้อหาเป็นปุ่มกดเล่น
     ส่วนปุ่มเลื่อนลำดับวางเป็นพี่น้องข้างๆ */
  return (
    <div
      className={`hover-tile tile group flex items-center gap-1 rounded-xl pr-1.5 transition-colors ${
        marked ? "ring-1 ring-iris/45" : ""
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        title={hint}
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
        {marked && <span className="slug slug-2 shrink-0 text-iris">ถัดไป</span>}
      </button>

      {/* จอสัมผัสไม่มี hover — ปุ่มที่จางรอ hover เท่ากับปุ่มที่มองไม่เห็นบนมือถือ
          จึงโชว์เต็มบนจอเล็ก แล้วค่อยจางรอ hover เฉพาะจอที่มีเมาส์จริง */}
      {(onMove || onRemove) && (
        <div className="flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-40 sm:group-hover:opacity-100">
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
          ? "hover:bg-danger/12 hover:text-danger"
          : "hover:bg-iris/12 hover:text-iris"
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
      {/* คำอธิบายยาวๆ ย้ายไปอยู่ในกล่องที่พับได้ข้างล่าง

          หน้านี้เป็นหน้าที่เปิดค้างไว้ทั้งไลฟ์ ไม่ใช่หน้าที่เข้ามาอ่าน —
          ย่อหน้าสี่บรรทัดตรงหัวจึงกินที่ของตัวเล่นไปเปล่าๆ ทุกวินาทีหลังอ่านจบรอบแรก */}
      <PageHeading
        no="09"
        eyebrow="Player"
        title="เล่นเพลงตามคิว"
        description="เดินเอง — มีคนขอเพลงเข้ามาก็เล่นเลย เพลงจบก็ต่อให้เอง"
        action={<AcceptToggle channelId={channelId} channel={channel} />}
      />
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
              `"${gone.title.slice(0, 26)}" เจ้าของปิดการฝัง (รหัส ${code}) — เอาออกจากกองแล้ว`,
              "info",
              5000,
            ),
          );
        }}
      />
      <SongConsole channelId={channelId} channel={channel} />
      <SetupNote />
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
    <Panel variant="quiet" className="p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left"
      >
        <span className="slug slug-2 shrink-0">เอาเสียงเข้าไลฟ์ยังไง</span>
        <span className="rule h-px flex-1" />
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <p>
            เปิดหน้านี้ใน<strong className="text-ice/85">เบราว์เซอร์ปกติ</strong>ที่ล็อกอิน
            YouTube Premium ไว้ แล้วดึงเสียงเข้า OBS ทาง Desktop Audio
            หรือจับหน้าต่างนี้เป็น Window Capture
          </p>
          <p>
            อย่าเอาลิงก์หน้านี้ไปใส่ Browser Source ของ OBS —
            ตรงนั้นมีคุกกี้แยกของตัวเอง ไม่ได้ล็อกอิน YouTube จึงมีโฆษณาคั่นกลางเพลง
          </p>
          <p>
            ถ้าอยากให้คนดูเห็นว่ากำลังเล่นเพลงอะไร ใช้ widget เพลงที่หน้า Widget
            ซึ่งเป็นคนละลิงก์กับหน้านี้
          </p>
        </div>
      )}
    </Panel>
  );
}
