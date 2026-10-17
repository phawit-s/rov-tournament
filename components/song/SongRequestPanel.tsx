"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import { authStore, getAuthClient } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import type { Channel } from "@/lib/channel/types";
import { safeUrl } from "@/lib/safe";
import { removeSongRequest, submitSongRequest } from "@/lib/song/store";
import { canEmbed } from "@/lib/song/embeddable";
import { DEFAULT_SONG_CONFIG, type SongConfig, type SongRequest } from "@/lib/song/types";
import { lookupVideo, videoIdFrom, type YoutubeInfo } from "@/lib/song/youtube";
import Button from "../ui/Button";
import Cover from "../ui/Cover";
import { toast } from "../ui/Toast";
import { IconCheck, IconClose, IconExternal } from "../ui/icons";
import { Badge, Input, Skeleton } from "../ui/kit";

/** หน่วงก่อนถาม YouTube — คนวางลิงก์ทีเดียวจบ แต่คนพิมพ์เองจะยิงรัวถ้าไม่หน่วง */
const LOOKUP_DELAY = 500;

/**
 * สถานะช่องลิงก์
 * แยก "ลิงก์ผิดรูปแบบ" ออกจาก "หาคลิปไม่เจอ" เพราะทางแก้คนละเรื่อง
 * อันแรกคือวางผิดที่ อันหลังคือคลิปถูกลบ/ตั้งเป็นส่วนตัว
 */
type Preview =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "loading" }
  | { state: "missing" }
  /* เจ้าของคลิปปิดการฝังในเว็บอื่น — ต้องกันตั้งแต่ตรงนี้ ไม่ใช่ปล่อยเข้าคิว
     แล้วไปค้างกลางไลฟ์ (สแกนกองจริงเจอ 37 จาก 89 เพลงเป็นแบบนี้) */
  | { state: "blocked"; info: YoutubeInfo }
  | { state: "ok"; info: YoutubeInfo };

const NONE: Preview = { state: "none" };

/** uid ของคนที่เปิดหน้านี้ (รวมบัญชีนิรนามที่สร้างตอนส่งเพลง) */
function useMyUid(): string {
  useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  return authStore.user()?.uid ?? "";
}

/**
 * ฟอร์มขอเพลงสำหรับคนดู
 *
 * คนดูส่วนใหญ่ไม่มีบัญชี จึงล็อกอินนิรนามให้ตอนกดส่ง
 * ระบบยังได้ uid ไว้นับโควตาต่อคน และให้คนขอถอนเพลงของตัวเองได้
 */
export function RequestForm({
  channel,
  config: configIn,
  queue,
  queued,
}: {
  channel: Channel;
  config?: SongConfig;
  /** คิวที่ยังไม่จบทั้งหมด (กำลังเล่น + รอ) — ใช้เช็คเพดานก่อนส่ง */
  queue: SongRequest[];
  queued: SongRequest[];
}) {
  // อ่านชื่อจากบัญชี/โปรไฟล์เพื่อเติมช่อง "ชื่อ" ให้ล่วงหน้า
  useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot, profileStore.getServerSnapshot);
  const myUid = useMyUid();
  const calm = useReducedMotion();
  const hydrated = useHydrated();

  const config = configIn ?? { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const channelId = channel.id;

  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<Preview>(NONE);
  /** null = ยังไม่ได้แก้เอง ให้ใช้ชื่อจากบัญชี — จะได้ไม่ต้อง setState ใน effect */
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** คิวที่เท่าไหร่ของเพลงที่เพิ่งส่ง โชว์ค้างไว้จนกว่าจะส่งใบใหม่ */
  const [placed, setPlaced] = useState<number | null>(null);

  const timer = useRef<number | null>(null);
  /** ลำดับการถาม — คำตอบของลิงก์เก่าที่มาช้าต้องไม่ทับผลของลิงก์ใหม่ */
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const user = authStore.user();
  const profile = profileStore.profile();
  // บัญชีนิรนามมีชื่อ "ผู้ใช้" ซึ่งไม่ใช่ชื่อจริงของใคร อย่าเอามาเติมให้
  const suggestedName =
    profile?.gameName?.trim() || (user && !user.anonymous ? user.name.trim() : "") || "";
  const name = typedName ?? suggestedName;

  /** แกะไอดีทันทีเพื่อบอกว่าลิงก์ใช้ได้ไหม แล้วค่อยหน่วงไปถามชื่อคลิป */
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
        // โชว์ชื่อเพลงก่อน แล้วค่อยตรวจว่าฝังเล่นได้ไหมตามหลัง
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
      return `คุณมีเพลงรอคิวครบ ${config.maxPerUser} เพลงแล้ว รอให้เพลงของคุณเล่นก่อนค่อยขอเพิ่ม`;
    if (reason === "queue-full") return `คิวเต็ม ${config.maxQueue} เพลงแล้ว รอสักพักแล้วลองใหม่`;
    return "ส่งไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
  };

  // ใบที่ฝังไม่ได้ต้องส่งไม่ได้ ไม่ใช่แค่ขึ้นเตือนแล้วยังกดได้อยู่
  const info = preview.state === "ok" ? preview.info : null;
  const canSubmit = !!info && !!name.trim() && !busy;

  const submit = async () => {
    if (!info || !canSubmit) return;
    setBusy(true);
    setError(null);
    setPlaced(null);
    try {
      await authStore.ensureSignedIn();
      /* อ่าน uid จาก Firebase ตรงๆ — authStore อัปเดตผ่าน onAuthStateChanged
         ซึ่งอาจยังไม่ยิงกลับมาในจังหวะที่ ensureSignedIn เพิ่ง resolve */
      const uid = getAuthClient()?.currentUser?.uid ?? user?.uid ?? "";
      if (!uid) {
        setError("เข้าระบบไม่สำเร็จ ลองกดส่งอีกครั้ง");
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
        setError(reasonText(result.reason));
        return;
      }

      // snapshot ปัจจุบันยังไม่มีเพลงใหม่ ลำดับของมันจึงเป็นตัวถัดไป
      setPlaced(queued.length + 1);
      setLink("");
      setPreview(NONE);
      toast("ส่งเข้าคิวแล้ว", "success");
    } catch {
      setError("ส่งไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const note = channel.songs?.note?.trim();
  const mineWaiting = queue.filter(
    (s) => s.byUid === myUid && (s.status === "queued" || s.status === "playing"),
  ).length;
  const left = config.maxPerUser ? Math.max(0, config.maxPerUser - mineWaiting) : null;

  /*
    ปุ่มวางจากคลิปบอร์ด — คนส่วนใหญ่เพิ่งก๊อปลิงก์จากแอป YouTube มาหมาดๆ
    การกดค้างในช่องแล้วเล็งเมนู "วาง" บนมือถือคือขั้นที่พลาดง่ายที่สุดของทั้งหน้า
    (เช็คหลัง hydrate เท่านั้น Safari เก่ากับ Firefox ไม่มี readText ปุ่มก็แค่ไม่โผล่)
  */
  const canPaste = hydrated && typeof navigator?.clipboard?.readText === "function";

  const pasteLink = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast("คลิปบอร์ดว่างอยู่ ก๊อปลิงก์จาก YouTube มาก่อน", "info");
        return;
      }
      onLink(text);
    } catch {
      toast("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด วางลิงก์ในช่องเองได้เลย", "info");
    }
  };

  const linkBad =
    preview.state === "invalid" || preview.state === "missing" || preview.state === "blocked";

  return (
    <section aria-labelledby="request-title">
      <h2 id="request-title" className="text-title font-bold">
        ขอเพลง
      </h2>
      {/* ข้อความของเจ้าของช่อง — โชว์เฉพาะตอนที่เขียนเองจริงๆ ค่าเริ่มต้นพูดซ้ำกับช่องกรอก */}
      {note && note !== DEFAULT_SONG_CONFIG.note && (
        <p className="mt-2 max-w-xl whitespace-pre-line text-muted">{note}</p>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="song-link" className="sr-only">
            ลิงก์ YouTube
          </label>
          <div className="flex gap-2">
            <Input
              id="song-link"
              value={link}
              onChange={(e) => onLink(e.target.value)}
              placeholder="วางลิงก์ YouTube"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="min-h-13 min-w-0 flex-1 text-base"
              aria-invalid={linkBad}
              aria-describedby="song-link-status"
            />
            {canPaste && (
              <Button variant="secondary" onClick={() => void pasteLink()} className="min-h-13">
                วาง
              </Button>
            )}
          </div>

          <div id="song-link-status" aria-live="polite" className="mt-3 empty:hidden">
            {preview.state === "invalid" && (
              <p className="text-sm text-danger">
                ลิงก์นี้ไม่ใช่ลิงก์ YouTube ลองก๊อปจากปุ่มแชร์ของคลิปอีกครั้ง
              </p>
            )}
            {preview.state === "missing" && (
              <p className="text-sm text-danger">หาคลิปนี้ไม่เจอ อาจถูกลบหรือตั้งเป็นส่วนตัวไว้</p>
            )}
            {preview.state === "blocked" && (
              <p className="text-sm text-danger">
                เจ้าของคลิปนี้ไม่ให้เล่นนอก YouTube จึงขอไม่ได้ ลองหาเพลงเดียวกันจากช่องอื่น
                เช่นเวอร์ชัน Lyrics หรือ Audio
              </p>
            )}
            {preview.state === "loading" && (
              <div className="flex items-center gap-3">
                <Skeleton className="aspect-video w-24 shrink-0 rounded-thumb" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                </div>
              </div>
            )}
            {preview.state === "ok" && (
              <div className="flex items-center gap-3">
                <Cover videoId={preview.info.videoId} size="sm" className="w-24" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 leading-snug font-medium">{preview.info.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-open">
                    <IconCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
                    ขอเพลงนี้ได้
                  </p>
                </div>
                <a
                  href={safeUrl(preview.info.url) ?? undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="เปิดคลิปนี้ใน YouTube"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
                >
                  <IconExternal className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="song-by" className="mb-1.5 block text-sm font-medium">
            ชื่อของคุณ
          </label>
          <Input
            id="song-by"
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="ชื่อนี้จะขึ้นบนจอไลฟ์"
            maxLength={40}
            autoComplete="nickname"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <AnimatePresence initial={false}>
          {placed != null && (
            <motion.p
              key="placed"
              initial={{ opacity: 0, y: calm ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-field bg-open/10 px-4 py-3 text-open"
            >
              ส่งเข้าคิวแล้ว เพลงของคุณอยู่คิวที่{" "}
              <span className="num font-bold">{placed}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <Button onClick={submit} loading={busy} disabled={!canSubmit} size="lg" className="w-full">
          ส่งเข้าคิว
        </Button>
        {left != null && (
          <p className="text-center text-sm text-muted">
            {left === 0
              ? "คุณมีเพลงรอคิวครบแล้ว รอให้เพลงของคุณเล่นก่อนค่อยขอเพิ่ม"
              : `คุณขอได้อีก ${left} เพลง`}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * คิวถัดไป — รายการแบบเพลย์ลิสต์ เลขลำดับคือคิวจริง
 * คนขอถอนเพลงของตัวเองได้ตอนที่ยังรอคิว (กติกาฝั่งเซิร์ฟเวอร์บังคับเรื่องนี้อยู่แล้ว)
 */
export function QueueList({
  channelId,
  queued,
  loading = false,
}: {
  channelId: string;
  queued: SongRequest[];
  loading?: boolean;
}) {
  const myUid = useMyUid();
  const calm = useReducedMotion();
  const [pulling, setPulling] = useState<string | null>(null);

  const pull = async (song: SongRequest) => {
    setPulling(song.id);
    try {
      await removeSongRequest(channelId, song.id);
      toast("ถอนเพลงออกจากคิวแล้ว", "success", 1800);
    } catch {
      toast("ถอนไม่ได้ เพลงอาจถึงคิวเล่นไปแล้ว", "error");
    } finally {
      setPulling(null);
    }
  };

  return (
    <section aria-labelledby="queue-title">
      <h2 id="queue-title" className="text-title font-bold">
        คิวถัดไป
        {!loading && <span className="num ml-2 font-normal text-muted">{queued.length}</span>}
      </h2>

      {loading ? (
        <div className="mt-4 space-y-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="aspect-video w-20 rounded-thumb" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : queued.length === 0 ? (
        <p className="mt-3 text-muted">ยังไม่มีเพลงรอคิว เพลงที่คุณขอตอนนี้จะได้เล่นถัดไปเลย</p>
      ) : (
        <ol className="rows mt-2">
          <AnimatePresence initial={false}>
            {queued.map((song, i) => {
              const mine = song.byUid === myUid;
              return (
                <motion.li
                  key={song.id}
                  layout={!calm}
                  initial={{ opacity: 0, y: calm ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="num w-7 shrink-0 text-center font-semibold text-muted">
                    {i + 1}
                  </span>
                  <Cover videoId={song.videoId} size="sm" className="w-20 sm:w-24" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 leading-snug font-medium">{song.title}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted">
                      <span className="truncate">
                        {song.source === "filler" ? "เพลงสำรองของช่อง" : `ขอโดย ${song.byName}`}
                      </span>
                      {mine && <Badge tone="ink">ของคุณ</Badge>}
                    </p>
                  </div>
                  {mine && (
                    <button
                      type="button"
                      disabled={pulling === song.id}
                      onClick={() => void pull(song)}
                      aria-label={`ถอน ${song.title} ออกจากคิว`}
                      title="ถอนออกจากคิว"
                      className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
