"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import { authStore, getAuthClient } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc, safeUrl } from "@/lib/safe";
import {
  removeSongRequest,
  splitQueue,
  submitSongRequest,
  watchSongQueue,
} from "@/lib/song/store";
import { canEmbed } from "@/lib/song/embeddable";
import { DEFAULT_SONG_CONFIG, type SongRequest } from "@/lib/song/types";
import {
  lookupVideo,
  thumbUrl,
  videoIdFrom,
  type YoutubeInfo,
} from "@/lib/song/youtube";
import Button from "../ui/Button";
import MiniBtn from "../ui/MiniBtn";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { IconCheck, IconCopy, IconExternal, IconPlay } from "../ui/icons";
import { Badge, EmptyState, Input, Skeleton } from "../tournament/ui";

/** อ้างอิงคงที่ ไม่งั้น setQueue ตอนไม่มีหลังบ้าน/ตอน error จะรีเรนเดอร์ไม่จบ */
const EMPTY: SongRequest[] = [];

/** หน่วงก่อนถาม YouTube — คนวางลิงก์ทีเดียวจบ แต่คนพิมพ์เองจะยิงรัวถ้าไม่หน่วง */
const LOOKUP_DELAY = 500;

/**
 * สถานะช่องลิงก์
 * แยก "ลิงก์ผิดรูปแบบ" ออกจาก "หาคลิปไม่เจอ" เพราะทางแก้คนละเรื่องกัน
 * อันแรกคือวางผิดที่ อันหลังคือคลิปถูกลบ/ตั้งเป็นส่วนตัว
 */
type Preview =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "loading" }
  | { state: "missing" }
  /* เจ้าของคลิปปิดการฝังในเว็บอื่น — ต้องกันตั้งแต่ตรงนี้ ไม่ใช่ปล่อยเข้าคิว
     แล้วไปค้างกลางไลฟ์ (สแกนกองจริงเจอ 37 จาก 89 เพลงเป็นแบบนี้)
     รู้ได้ทางเดียวคือลองโหลดจริง — oEmbed ตอบ 200 เหมือนกันหมด */
  | { state: "blocked"; info: YoutubeInfo }
  | { state: "ok"; info: YoutubeInfo };

const NONE: Preview = { state: "none" };

/**
 * ฟอร์มขอเพลงสำหรับคนดู
 *
 * คนดูส่วนใหญ่ไม่มีบัญชีในเว็บนี้ จึงล็อกอินนิรนามให้ตอนกดส่ง
 * ระบบยังได้ uid ไว้นับโควตาต่อคนและให้สตรีมเมอร์แบนคนกวนได้
 *
 * ตัวนี้เป็นทั้งฟอร์มและคิวในใบเดียว ใช้บนหน้าขอเพลงโดยเฉพาะ (/song/)
 * แยกออกมาจากหน้าสนับสนุนแล้ว เพราะขอเพลงกับโอนเงินเป็นคนละเรื่องกัน
 * เอามารวมใบเดียวคนอ่านไม่ออกว่าตกลงหน้านี้ให้ทำอะไร
 */
export default function SongRequestPanel({
  channel,
  /** true = อยู่บนหน้าของตัวเอง ไม่ต้องมีหัวใบซ้ำกับหัวหน้า */
  bare = false,
  onPlayingChange,
}: {
  channel: Channel;
  bare?: boolean;
  /**
   * บอกหน้าแม่ว่าตอนนี้เพลงไหนกำลังเล่น — หน้าแม่เอาไปทำฉากหลัง
   *
   * ส่งขึ้นไปแทนที่จะให้หน้าแม่เปิด listener ของตัวเอง เพราะคิวชุดเดียวกัน
   * ไม่ควรถูกฟังสองรอบ (เปลืองโควตาอ่านของ Firestore ไปเท่าตัวโดยไม่ได้อะไร)
   */
  onPlayingChange?: (videoId: string | null) => void;
}) {
  // อ่านชื่อจากบัญชี/โปรไฟล์เพื่อเติมช่อง "ชื่อผู้ขอ" ให้ล่วงหน้า
  useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const calm = useReducedMotion();
  const hydrated = useHydrated();

  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<Preview>(NONE);
  /** null = ยังไม่ได้แก้เอง ให้ใช้ชื่อจากบัญชี — เก็บแบบนี้จะได้ไม่ต้อง setState ใน effect */
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** คิวที่เท่าไหร่ของเพลงที่เพิ่งส่งไป โชว์ค้างไว้จนกว่าจะส่งใบใหม่ */
  const [placed, setPlaced] = useState<number | null>(null);
  /** ใบที่กำลังถอนอยู่ กันกดรัว */
  const [pulling, setPulling] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  /** ลำดับการถาม — คำตอบของลิงก์เก่าที่มาช้าต้องไม่ทับผลของลิงก์ใหม่ */
  const seq = useRef(0);

  const enabled = channel.songs?.enabled === true;
  const channelId = channel.id;

  const config = useMemo(
    () => ({ ...DEFAULT_SONG_CONFIG, ...channel.songs }),
    [channel.songs],
  );

  // ฟังคิว — setState อยู่ใน callback ของ subscription ไม่ใช่ในตัว effect
  useEffect(() => {
    if (!enabled || !channelId) return;
    return watchSongQueue(channelId, setQueue, {
      onlyOpen: true,
      onError: () => setQueue(EMPTY),
    });
  }, [enabled, channelId]);

  // ตัวจับเวลาที่ค้างอยู่ต้องตายไปกับคอมโพเนนต์ ไม่งั้น setState หลัง unmount
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const user = authStore.user();
  const profile = profileStore.profile();
  // บัญชีนิรนามมี displayName เป็น "ผู้ใช้" ซึ่งไม่ใช่ชื่อจริงของใคร อย่าเอามาเติมให้
  const suggestedName =
    profile?.gameName?.trim() || (user && !user.anonymous ? user.name.trim() : "") || "";
  const name = typedName ?? suggestedName;

  const { playing, queued } = splitQueue(queue);
  const myUid = user?.uid ?? "";

  /* แจ้งหน้าแม่เมื่อ "คลิปที่เล่นอยู่" เปลี่ยน — ผูก deps กับ videoId ไม่ใช่ทั้งใบ
     ใบคำขอเป็นอ็อบเจกต์ใหม่ทุกสแนปช็อต ถ้าใส่ทั้งใบจะยิงซ้ำทุกครั้งที่คิวขยับ */
  const playingVideoId = playing?.videoId ?? null;
  useEffect(() => {
    onPlayingChange?.(playingVideoId);
  }, [playingVideoId, onPlayingChange]);

  /**
   * ทุกอย่างเกิดใน onChange ของช่องกรอก ไม่ใช่ใน effect ที่คอยดูค่า
   * แกะไอดีทันทีเพื่อบอกว่าลิงก์ใช้ได้ไหม แล้วค่อยหน่วงไปถามชื่อคลิป
   */
  const onLink = (raw: string) => {
    setLink(raw);
    setError(null);
    if (timer.current != null) window.clearTimeout(timer.current);
    const token = ++seq.current;

    const text = raw.trim();
    if (!text) {
      setPreview(NONE);
      return;
    }
    const videoId = videoIdFrom(text);
    if (!videoId) {
      setPreview({ state: "invalid" });
      return;
    }

    setPreview({ state: "loading" });
    timer.current = window.setTimeout(() => {
      void lookupVideo(videoId).then(async (info) => {
        if (token !== seq.current) return;
        if (!info) {
          setPreview({ state: "missing" });
          return;
        }
        /* โชว์ชื่อเพลงก่อนเลย แล้วค่อยตรวจว่าฝังเล่นได้ไหมตามหลัง
           การตรวจใช้เวลาไม่ถึงครึ่งวินาที แต่ถ้ารอให้เสร็จก่อนค่อยโชว์
           คนวางลิงก์จะเห็นช่องว่างนานขึ้นโดยไม่ได้อะไรเพิ่ม */
        setPreview({ state: "ok", info });
        const verdict = await canEmbed(info.videoId);
        if (token !== seq.current) return;
        // ตอบไม่ได้ = ปล่อยผ่าน ห้ามกันเพลงดีๆ ทิ้งเพราะเน็ตสะดุด
        if (verdict === "blocked") setPreview({ state: "blocked", info });
      });
    }, LOOKUP_DELAY);
  };

  const reasonText = (reason: "duplicate" | "too-many" | "queue-full" | "failed") => {
    if (reason === "duplicate") return "เพลงนี้อยู่ในคิวแล้ว ลองเพลงอื่นดู";
    if (reason === "too-many")
      return `คุณมีเพลงในคิวครบ ${config.maxPerUser} เพลงแล้ว รอเพลงเล่นจบก่อน`;
    if (reason === "queue-full")
      return `คิวเต็มแล้ว (${config.maxQueue} เพลง) รอสักครู่แล้วลองใหม่`;
    return "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง";
  };

  // ใบที่ฝังไม่ได้ต้องส่งไม่ได้ ไม่ใช่แค่ขึ้นเตือนแล้วยังกดได้อยู่
  const info = preview.state === "ok" ? preview.info : null;
  const canSubmit = !!info && !!name.trim() && !busy;

  /** ถอนเพลงของตัวเองออกจากคิว — ทำได้เฉพาะใบที่ยังไม่ถึงคิวเล่น */
  const pull = async (song: SongRequest) => {
    setPulling(song.id);
    try {
      await removeSongRequest(channelId, song.id);
      toast("ถอนเพลงออกจากคิวแล้ว", "success", 1800);
      // ถอนแล้วโควตาคืน ตัวเลข "ขอได้อีกกี่เพลง" จะขยับเองจาก snapshot
      setPlaced(null);
    } catch {
      toast("ถอนไม่สำเร็จ — เพลงอาจถึงคิวเล่นไปแล้ว", "error");
    } finally {
      setPulling(null);
    }
  };

  const submit = async () => {
    if (!info || !canSubmit) return;
    setBusy(true);
    setError(null);
    setPlaced(null);
    try {
      await authStore.ensureSignedIn();
      /*
        อ่าน uid จาก Firebase ตรงๆ ไม่ผ่าน authStore
        เพราะ authStore อัปเดตผ่าน onAuthStateChanged ซึ่งอาจยังไม่ยิงกลับมา
        ในจังหวะที่ ensureSignedIn เพิ่ง resolve — จะได้ uid ว่างแล้วโดนกติกาปฏิเสธ
      */
      const uid = getAuthClient()?.currentUser?.uid ?? user?.uid ?? "";
      if (!uid) {
        setError("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
        toast("เข้าสู่ระบบไม่สำเร็จ", "error");
        return;
      }

      const result = await submitSongRequest(
        channelId,
        {
          videoId: info.videoId,
          title: info.title,
          author: info.author,
          url: info.url,
          byUid: uid,
          byName: name.trim(),
        },
        queue,
        config,
      );

      if (!result.ok) {
        const text = reasonText(result.reason);
        setError(text);
        toast(text, "error");
        return;
      }

      // คิวจาก snapshot ปัจจุบันยังไม่มีเพลงใหม่ ลำดับของมันจึงเป็นตัวถัดไป
      setPlaced(queued.length + 1);
      setLink("");
      setPreview(NONE);
      toast("ส่งเพลงเข้าคิวแล้ว", "success");
    } catch {
      setError("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      toast("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  // ช่องที่ไม่ได้เปิดระบบขอเพลงไม่ต้องเห็นอะไรเลย (hook ทั้งหมดถูกเรียกไปแล้วด้านบน)
  if (!enabled) return null;

  const note = channel.songs?.note?.trim();
  /** เพลงของเราที่ยังค้างคิวอยู่ ใช้บอกโควตาที่เหลือแบบตรงไปตรงมา */
  const mineWaiting = queue.filter(
    (s) => s.byUid === myUid && (s.status === "queued" || s.status === "playing"),
  ).length;
  const left = config.maxPerUser ? Math.max(0, config.maxPerUser - mineWaiting) : null;

  /*
    ปุ่มวางจากคลิปบอร์ด

    คนส่วนใหญ่เข้าหน้านี้จากการสแกน QR บนไลฟ์ด้วยมือถือ ซึ่งเพิ่งกดก๊อปลิงก์
    มาจากแอป YouTube หมาดๆ — การกดค้างในช่องแล้วเล็งเมนู "วาง" บนมือถือ
    เป็นขั้นที่พลาดง่ายที่สุดของทั้งหน้า มีปุ่มให้กดทีเดียวจบดีกว่า

    เช็คหลัง hydrate เท่านั้น เพราะฝั่งเซิร์ฟเวอร์ไม่มี navigator
    (Safari รุ่นเก่ากับ Firefox ไม่มี readText ปุ่มก็จะไม่โผล่ ไม่ได้พัง)
  */
  const canPaste =
    hydrated && typeof navigator?.clipboard?.readText === "function";

  const pasteLink = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast("คลิปบอร์ดว่าง — ก๊อปลิงก์จาก YouTube มาก่อน", "info");
        return;
      }
      onLink(text);
    } catch {
      toast("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — วางเองในช่องได้เลย", "info");
    }
  };

  const form = (
    <>
      {/* สรุปสถานะคิวไว้หัวฟอร์ม — คนที่เพิ่งสแกน QR เข้ามาจะได้รู้ตั้งแต่บรรทัดแรก
          ว่าคิวยาวแค่ไหนและตัวเองขอได้อีกกี่เพลง ก่อนจะเสียเวลาหาลิงก์ */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl tile px-4 py-3">
        <Stat label="คิวตอนนี้" value={`${queued.length} เพลง`} />
        {left != null && (
          <Stat label="คุณขอได้อีก" value={`${left} เพลง`} tone={left === 0 ? "out" : "on"} />
        )}
        <Stat
          label="กำลังเล่น"
          value={playing ? playing.title : "ยังไม่มีเพลง"}
          className="min-w-0 flex-1 basis-40"
          truncate
        />
      </div>

      {/*
        กติกาของช่อง — โชว์เฉพาะตอนที่เจ้าของช่องเขียนเองจริงๆ

        ค่าเริ่มต้นของระบบคือ "วางลิงก์ YouTube ได้เลย เพลงจะเข้าคิวรอสตรีมเมอร์เปิด"
        ซึ่งพูดเรื่องเดียวกับหัวข้อขั้นที่ 1 กับ placeholder ในช่องเป๊ะๆ
        ช่องที่ไม่เคยแก้ข้อความนี้จึงได้กล่องข้อความซ้ำซ้อนมาฟรีๆ หนึ่งกล่อง
      */}
      {note && note !== DEFAULT_SONG_CONFIG.note && (
        <div
          className="tally mb-5 rounded-xl tile px-4 py-3"
          style={{ ["--st" as string]: "var(--st-next)" }}
        >
          <p className="slug slug-2">กติกาของช่องนี้</p>
          <p className="mt-1 text-sm leading-relaxed text-ice/85">{note}</p>
        </div>
      )}

      {/* ---------- ฟอร์ม ---------- */}
      <div className="space-y-6">
        {/* ช่องลิงก์เป็นพระเอกของหน้า ทำให้ใหญ่กว่าช่องอื่นชัดๆ
            คำอธิบายย้ายไปไว้ใต้ช่อง หัวข้อจะได้เหลือบรรทัดเดียวเท่ากันทุกช่อง */}
        <div>
          <Step no={1}>
            <label htmlFor="song-link" className="cursor-pointer">
              วางลิงก์เพลงที่อยากขอ
            </label>
          </Step>

          <div className="flex gap-2">
            <Input
              id="song-link"
              value={link}
              onChange={(e) => onLink(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 px-4 py-3.5 text-base"
              aria-invalid={preview.state === "invalid" || preview.state === "missing"}
            />
            {canPaste && (
              <MiniBtn
                onClick={() => void pasteLink()}
                title="วางลิงก์จากคลิปบอร์ด"
                className="shrink-0 px-3.5"
              >
                <IconCopy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">วาง</span>
              </MiniBtn>
            )}
          </div>


          {/* ผลตรวจลิงก์ — จองที่ไว้ให้การ์ดพรีวิว เลย์เอาต์จะได้ไม่กระตุกตอนโหลดเสร็จ */}
          <div className="mt-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={preview.state}
                initial={{ opacity: 0, y: calm ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: calm ? 0 : -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {preview.state === "invalid" && (
                  <p className="text-xs text-danger">
                    ลิงก์ไม่ถูกต้อง วางลิงก์ YouTube หรือไอดีคลิป
                  </p>
                )}
                {preview.state === "blocked" && (
                  <p className="text-xs leading-relaxed text-danger">
                    เจ้าของคลิปนี้ปิดไม่ให้เล่นนอกเว็บ YouTube — ขอเพลงนี้ไม่ได้
                    ลองหาคลิปเดียวกันจากช่องอื่น เช่นเวอร์ชัน Lyrics หรือ Audio
                  </p>
                )}
                {preview.state === "missing" && (
                  <p className="text-xs text-danger">
                    หาคลิปนี้ไม่เจอ อาจถูกลบหรือตั้งเป็นส่วนตัว
                  </p>
                )}
                {preview.state === "loading" && (
                  <div className="sunken hairline-top flex items-center gap-3.5 rounded-xl p-3">
                    <Skeleton className="aspect-video w-24 shrink-0 rounded-lg sm:w-28" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-4/5 rounded-md" />
                      <Skeleton className="h-3 w-2/5 rounded-md" />
                    </div>
                  </div>
                )}
                {preview.state === "ok" && (
                  /* ขีดเขียวชิดซ้าย = ลิงก์นี้ใช้ได้แล้ว กดส่งได้เลย
                     เป็นสัญญาณเดียวกับที่ใช้บอกสถานะทั้งเว็บ ไม่ต้องเรียนรู้ใหม่ */
                  <div
                    className="tally sunken hairline-top flex items-center gap-3.5 rounded-xl p-3 pl-4"
                    style={{ ["--st" as string]: "var(--st-win)" }}
                  >
                    <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg sm:w-28">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={safeImageSrc(preview.info.thumb) ?? ""}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <IconPlay className="h-5 w-5 text-white/85" />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-snug text-ice">
                        {preview.info.title}
                      </p>
                      {preview.info.author && (
                        <p className="mt-1 truncate text-xs text-muted">
                          {preview.info.author}
                        </p>
                      )}
                      <p
                        className="mt-1.5 inline-flex items-center gap-1 text-xs"
                        style={{ color: "rgb(var(--st-win))" }}
                      >
                        <IconCheck className="h-3 w-3" strokeWidth={2} />
                        เพลงนี้ขอได้
                      </p>
                    </div>
                    <a
                      href={safeUrl(preview.info.url) ?? undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="เปิดคลิปใน YouTube"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-iris"
                    >
                      <IconExternal className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* หัวข้อทั้งสองช่องเป็นบรรทัดเดียวเท่ากัน ช่องกรอกถึงจะอยู่ระดับเดียวกัน
            คำว่า "ไม่บังคับ" ย้ายไปอยู่ในหัวข้อแทนที่จะเป็นบรรทัดที่สอง */}
        <div>
          <Step no={2}>บอกหน่อยว่าใครขอ</Step>
          <label htmlFor="song-by" className="sr-only">
            ชื่อผู้ขอ
          </label>
          <Input
            id="song-by"
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="ชื่อที่จะขึ้นจอ"
            maxLength={40}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {/*
          ปุ่มส่งเต็มความกว้างบนมือถือและใหญ่กว่าปุ่มอื่นในหน้า

          หน้านี้มีงานให้ทำอย่างเดียวคือส่งเพลง ปุ่มจึงไม่ต้องแย่งน้ำหนักกับใคร
          และข้อความบอกผลย้ายมาอยู่ "เหนือ" ปุ่ม ไม่ใช่ข้างๆ — บนมือถือของที่อยู่
          ข้างปุ่มจะตกไปอยู่ใต้ปุ่มซึ่งเลยขอบจอไปแล้วตอนกดส่ง
        */}
        <div className="space-y-3 border-t border-hair pt-5">
          <AnimatePresence mode="wait" initial={false}>
            {placed != null && (
              <motion.p
                key="placed"
                initial={{ opacity: 0, y: calm ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="tally rounded-xl tile px-4 py-3 text-sm text-ice/85"
                style={{ ["--st" as string]: "var(--st-win)" }}
              >
                ส่งแล้ว — เพลงของคุณอยู่คิวที่{" "}
                <span className="num font-display text-iris">{placed}</span>
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={submit}
              loading={busy}
              disabled={!canSubmit}
              size="lg"
              className="w-full sm:w-auto"
            >
              ส่งเข้าคิว
            </Button>
            {left === 0 ? (
              <p className="text-sm text-muted">
                คิวของคุณเต็มแล้ว รอเพลงเล่นจบก่อนถึงจะขอเพิ่มได้
              </p>
            ) : (
              left != null && (
                <p className="text-sm text-muted">
                  ขอได้อีก <span className="num text-iris">{left}</span> เพลง
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );

  const list = (
    /* flex-1 กับ min-h-0 คู่กันคือสิ่งที่ทำให้ลิสต์ยืดเต็มใบได้จริง —
       ขาด min-h-0 เมื่อไหร่ ลูกที่ยาวเกินจะดันกล่องให้สูงกว่าพี่น้องแทนที่จะเลื่อน */
    <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="slug slug-2">Now playing</p>

        {playing ? (
          <SongNowPlaying song={playing} mine={playing.byUid === myUid} calm={!!calm} />
        ) : (
          <p className="text-sm text-muted">ยังไม่มีเพลงที่กำลังเล่น</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <span className="slug slug-2 shrink-0">Up next</span>
          <span className="rule h-px flex-1" />
          <span className="num shrink-0 text-xs text-muted">{queued.length}</span>
        </div>

        {queued.length === 0 ? (
          <EmptyState title="คิวยังว่าง" />
        ) : (
          <ul className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
            <AnimatePresence initial={false}>
              {queued.map((song, i) => (
                <motion.li
                  key={song.id}
                  layout={!calm}
                  initial={{ opacity: 0, y: calm ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: calm ? 1 : 0.98 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="tile hairline-top flex items-center gap-3 rounded-xl p-2.5"
                >
                  <span
                    className="fig text-outline w-9 shrink-0 text-center text-4xl select-none"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safeImageSrc(thumbUrl(song.videoId)) ?? ""}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-16 shrink-0 rounded-md object-cover sm:w-20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug text-ice">
                      {song.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      ขอโดย {song.byName}
                    </p>
                  </div>
                  {song.byUid === myUid && (
                    <>
                      <Badge rgb="169 155 255" className="hidden sm:inline-flex">
                        ของคุณ
                      </Badge>
                      {/* ถอนได้เฉพาะของตัวเองที่ยังรอคิว — กติกาฝั่งเซิร์ฟเวอร์
                          บังคับเรื่องนี้อยู่แล้ว ตรงนี้แค่ไม่โชว์ปุ่มให้สับสน */}
                      <button
                        type="button"
                        disabled={pulling === song.id}
                        onClick={() => void pull(song)}
                        title="ถอนเพลงนี้ออกจากคิว"
                        aria-label="ถอนเพลงนี้ออกจากคิว"
                        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/12 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
    </div>
  );

  /*
    หน้าขอเพลงโดยเฉพาะ — ฟอร์มซ้าย คิวขวา สองใบกว้างเท่ากันและสูงเท่ากัน

    ของเดิมซ้ายกว้างกว่านิดหน่อย (1.05 : 0.95) แล้ว items-start ปล่อยให้ใบขวา
    สูงตามเนื้อหาของตัวเอง — พอคิวมีสองเพลง ใบขวาเลยเตี้ยกว่าใบซ้ายครึ่งจอ
    เหลือรูโหว่ใหญ่ๆ ข้างขวา ซึ่งเป็นสิ่งแรกที่ตาไปเกาะเวลาเปิดหน้านี้บนคอม

    1fr เท่ากันสองใบ + items-stretch แก้ทั้งสองเรื่องพร้อมกัน
    แล้วให้ลิสต์คิวยืดกินที่ว่างที่เหลือในใบขวาแทนที่จะทิ้งว่าง
  */
  if (bare) {
    return (
      <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
        <Panel variant="feature" className="flex flex-col p-6 sm:p-7">
          {form}
        </Panel>
        <Panel className="flex flex-col p-6 sm:p-7">{list}</Panel>
      </div>
    );
  }

  return (
    <Panel className="p-6 sm:p-7">
      <Panel.Header eyebrow="Song request" title="ขอเพลง" count={queued.length} />
      {form}
      <span className="rule my-6 block h-px" />
      {list}
    </Panel>
  );
}

/**
 * หัวข้อขั้นตอนพร้อมเลขวงกลม
 *
 * ฟอร์มนี้มีสองขั้นจริงๆ (หาลิงก์ / บอกชื่อ) แต่ของเดิมเป็นหัวข้อลอยๆ สองอัน
 * ที่อ่านแล้วไม่รู้ว่ามีทั้งหมดกี่ขั้นและอยู่ขั้นไหน เลขวงกลมตอบให้ในพริบตา
 */
function Step({ no, children }: { no: number; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-iris/12 font-display text-eyebrow text-iris ring-1 ring-iris/30">
        {no}
      </span>
      <span className="font-display text-base font-light text-ice">{children}</span>
    </div>
  );
}

/** ตัวเลขสรุปหนึ่งช่องในแถบหัวฟอร์ม */
function Stat({
  label,
  value,
  tone = "on",
  truncate = false,
  className = "",
}: {
  label: string;
  value: string;
  tone?: "on" | "out";
  truncate?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="slug slug-2">{label}</p>
      <p
        className={`mt-0.5 text-sm ${truncate ? "truncate" : ""} ${
          tone === "out" ? "text-muted" : "text-ice"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** เพลงที่กำลังเล่น — ใบเดียวของหน้าที่ได้ขีดสถานะ --st-live กับป้ายจุดเต้น */
function SongNowPlaying({
  song,
  mine,
  calm,
}: {
  song: SongRequest;
  mine: boolean;
  calm: boolean;
}) {
  return (
    <Panel
      variant="quiet"
      state="live"
      interactive={false}
      className="flex items-center gap-3.5 p-3 pl-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeImageSrc(thumbUrl(song.videoId)) ?? ""}
        alt=""
        loading="lazy"
        className="aspect-video w-24 shrink-0 rounded-lg object-cover sm:w-28"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge rgb="255 91 122" hex="var(--color-live)" tone={calm ? "plain" : "live"}>
            กำลังเล่น
          </Badge>
          {mine && <Badge rgb="169 155 255">ของคุณ</Badge>}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ice">{song.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">ขอโดย {song.byName}</p>
      </div>
    </Panel>
  );
}
