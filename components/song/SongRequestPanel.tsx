"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { authStore, getAuthClient } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc, safeUrl } from "@/lib/safe";
import { splitQueue, submitSongRequest, watchSongQueue } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type SongRequest } from "@/lib/song/types";
import {
  lookupVideo,
  thumbUrl,
  videoIdFrom,
  type YoutubeInfo,
} from "@/lib/song/youtube";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { IconExternal } from "../ui/icons";
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
}: {
  channel: Channel;
  bare?: boolean;
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

  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<Preview>(NONE);
  /** null = ยังไม่ได้แก้เอง ให้ใช้ชื่อจากบัญชี — เก็บแบบนี้จะได้ไม่ต้อง setState ใน effect */
  const [typedName, setTypedName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** คิวที่เท่าไหร่ของเพลงที่เพิ่งส่งไป โชว์ค้างไว้จนกว่าจะส่งใบใหม่ */
  const [placed, setPlaced] = useState<number | null>(null);

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
      void lookupVideo(videoId).then((info) => {
        if (token !== seq.current) return;
        setPreview(info ? { state: "ok", info } : { state: "missing" });
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

  const info = preview.state === "ok" ? preview.info : null;
  const canSubmit = !!info && !!name.trim() && !busy;

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
          message: message.trim() || undefined,
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
      setMessage("");
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

  const form = (
    <>
      {note && (
        <div className="tally mb-5 rounded-xl tile px-4 py-3">
          <p className="slug slug-2">กติกาของช่องนี้</p>
          <p className="mt-1 text-sm leading-relaxed text-ice/85">{note}</p>
        </div>
      )}

      {/* ---------- ฟอร์ม ---------- */}
      <div className="space-y-5">
        {/* ช่องลิงก์เป็นพระเอกของหน้า ทำให้ใหญ่กว่าช่องอื่นชัดๆ
            คำอธิบายย้ายไปไว้ใต้ช่อง หัวข้อจะได้เหลือบรรทัดเดียวเท่ากันทุกช่อง */}
        <div>
          <label
            htmlFor="song-link"
            className="mb-2 block font-display text-lg font-light text-ice"
          >
            วางลิงก์เพลงที่อยากขอ
          </label>
          <Input
            id="song-link"
            value={link}
            onChange={(e) => onLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3.5 text-base"
            aria-invalid={preview.state === "invalid" || preview.state === "missing"}
          />
          <p className="mt-2 text-xs text-muted">
            ก๊อปจากแอป YouTube มาวางได้เลย รองรับ youtu.be และ Shorts
          </p>

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
                  <p className="text-xs text-[#e79a9a]">
                    ลิงก์ไม่ถูกต้อง วางลิงก์ YouTube หรือไอดีคลิป
                  </p>
                )}
                {preview.state === "missing" && (
                  <p className="text-xs text-[#e79a9a]">
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
                  <div className="sunken hairline-top flex items-center gap-3.5 rounded-xl p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={safeImageSrc(preview.info.thumb) ?? ""}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-24 shrink-0 rounded-lg object-cover sm:w-28"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-snug text-ice">
                        {preview.info.title}
                      </p>
                      {preview.info.author && (
                        <p className="mt-1 truncate text-xs text-muted">
                          {preview.info.author}
                        </p>
                      )}
                    </div>
                    <a
                      href={safeUrl(preview.info.url) ?? undefined}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="เปิดคลิปใน YouTube"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-champagne"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="song-by"
              className="mb-2 block text-sm font-medium text-ice/85"
            >
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
          <div>
            <label
              htmlFor="song-msg"
              className="mb-2 block text-sm font-medium text-ice/85"
            >
              ข้อความถึงสตรีมเมอร์{" "}
              <span className="font-normal text-muted">(ไม่บังคับ)</span>
            </label>
            <Input
              id="song-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เปิดเพลงนี้หน่อยยย"
              maxLength={120}
            />
          </div>
        </div>

        {error && <p className="text-sm text-[#e79a9a]">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-5">
          <Button
            onClick={submit}
            loading={busy}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            ส่งเข้าคิว
          </Button>
          {placed != null ? (
            <motion.p
              initial={{ opacity: 0, y: calm ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-muted"
            >
              ส่งแล้ว — เพลงของคุณอยู่คิวที่{" "}
              <span className="num text-champagne">{placed}</span>
            </motion.p>
          ) : (
            left != null && (
              <p className="text-sm text-muted">
                ขอได้อีก <span className="num text-champagne">{left}</span> เพลง
              </p>
            )
          )}
        </div>
      </div>
    </>
  );

  const list = (
    <div className="space-y-3">
        <p className="slug slug-2">Now playing</p>

        {playing ? (
          <SongNowPlaying song={playing} mine={playing.byUid === myUid} calm={!!calm} />
        ) : (
          <p className="text-sm text-muted">ยังไม่มีเพลงที่กำลังเล่น</p>
        )}

        <p className="slug slug-2 pt-2">Up next</p>

        {queued.length === 0 ? (
          <EmptyState
            title="คิวยังว่าง"
            description="วางลิงก์แล้วกดส่ง เพลงของคุณจะได้เล่นเป็นเพลงถัดไป"
          />
        ) : (
          <ul className="space-y-2">
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
                    <Badge rgb="207 167 101" className="hidden sm:inline-flex">
                      ของคุณ
                    </Badge>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
    </div>
  );

  /* หน้าขอเพลงโดยเฉพาะ — ฟอร์มอยู่ซ้าย คิวอยู่ขวา มองเห็นพร้อมกันได้บนจอกว้าง */
  if (bare) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
        <Panel variant="feature" className="p-6 sm:p-7">
          {form}
        </Panel>
        <Panel className="p-6 lg:sticky lg:top-6">{list}</Panel>
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
          <Badge rgb="224 86 107" hex="#e0566b" tone={calm ? "plain" : "live"}>
            กำลังเล่น
          </Badge>
          {mine && <Badge rgb="207 167 101">ของคุณ</Badge>}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ice">{song.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">ขอโดย {song.byName}</p>
      </div>
    </Panel>
  );
}
