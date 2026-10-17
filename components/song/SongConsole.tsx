"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { authStore } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { FILLER_LIMIT } from "@/lib/song/filler";
import { saveFillerList, saveFillerMode } from "@/lib/song/config";
import { importPlaylist, playlistIdFrom } from "@/lib/song/playlist";
import { searchSongs, type SearchHit } from "@/lib/song/search";
import { addSongToQueue, watchRecentFinished } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type FillerTrack, type SongRequest } from "@/lib/song/types";
import { lookupVideo, thumbUrl, videoIdFrom, watchUrl } from "@/lib/song/youtube";
import type { YoutubeInfo } from "@/lib/song/youtube";
import ActionMenu from "../ui/ActionMenu";
import Button, { Spinner } from "../ui/Button";
import Cover from "../ui/Cover";
import Tabs from "../ui/Tabs";
import { toast } from "../ui/Toast";
import { IconCheck, IconMinusCircle, IconPlus } from "../ui/icons";
import { Badge, EmptyState, Input, Skeleton } from "../ui/kit";

const EMPTY: SongRequest[] = [];
const LOOKUP_DELAY = 450;

export type ConsoleTab = "add" | "history" | "filler";
type Tab = ConsoleTab;

/**
 * แผงควบคุมของสตรีมเมอร์บนหน้าเล่นเพลง
 *
 * สามอย่างที่ต้องทำได้จากหน้านี้โดยไม่ต้องเปิดหน้าอื่น
 *   1. ใส่เพลงเองตอนอยากเปิดอะไรของตัวเอง
 *   2. ดูเพลงที่เล่นจบไปแล้ว แล้วดึงกลับมาต่อคิวใหม่ได้
 *   3. ตั้งเพลย์ลิสต์สำรอง ไว้เล่นตอนไม่มีใครขอ ไลฟ์จะได้ไม่เงียบ
 */
export default function SongConsole({
  channelId,
  channel,
  tab: tabIn,
  onTabChange,
}: {
  channelId: string;
  channel: Channel | null;
  /** คุมแท็บจากข้างนอกได้ — ปุ่ม "จัดการ" ของสรุปเพลงสำรองท้ายคิวพามาแท็บเพลงสำรอง */
  tab?: Tab;
  onTabChange?: (tab: Tab) => void;
}) {
  const [tabOwn, setTabOwn] = useState<Tab>("add");
  const tab = tabIn ?? tabOwn;
  const setTab = (next: Tab) => {
    setTabOwn(next);
    onTabChange?.(next);
  };
  /*
    ประวัติอ่านเฉพาะตอนเปิดแท็บประวัติ และอ่านแค่ 50 ใบล่าสุด

    ของเดิมฟังทุกใบที่เคยขอตลอดเวลาที่ตัวเล่นเปิดอยู่ (ช่องที่ไลฟ์ทุกคืนมีเป็นพันใบ)
    แล้วเรนเดอร์ทั้งหมดพร้อมรูปปกตอนเปิดแท็บ — หน้าค้างบนเครื่องที่ไม่แรง
  */
  const [history, setHistory] = useState<{ id: string; items: SongRequest[] } | null>(null);

  useEffect(() => {
    if (!channelId || tab !== "history") return;
    return watchRecentFinished(
      channelId,
      (items) => setHistory({ id: channelId, items }),
      50,
      () => setHistory({ id: channelId, items: EMPTY }),
    );
  }, [channelId, tab]);

  const songs = { ...DEFAULT_SONG_CONFIG, ...channel?.songs };
  const filler = songs.filler ?? [];
  const done = history?.id === channelId ? history.items : null;

  return (
    <section aria-label="ใส่เพลงและตั้งเพลงสำรอง">
      {/* *:min-h-11 — ยืดทุกช่องของแท็บให้สูง 44px แตะด้วยนิ้วได้ (ตัวแท็บเองสูง 36px) */}
      <Tabs
        label="เครื่องมือของสตรีมเมอร์"
        grow={false}
        className="w-fit max-w-full *:min-h-11"
        value={tab}
        onChange={setTab}
        items={[
          { key: "add", label: "ใส่เพลง" },
          { key: "history", label: "ประวัติ" },
          { key: "filler", label: "เพลงสำรอง", count: filler.length || null },
        ]}
      />

      <div className="mt-6">
        {tab === "add" && (
          <AddSong channelId={channelId} searchEndpoint={songs.searchEndpoint?.trim()} />
        )}

        {tab === "history" &&
          (done ? (
            <History channelId={channelId} done={done} />
          ) : (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}

        {tab === "filler" && (
          <Filler
            channelId={channelId}
            tracks={filler}
            mode={songs.fillerMode ?? "off"}
            canEdit={!!channel}
          />
        )}
      </div>
    </section>
  );
}

/** หัวข้อของแต่ละกลุ่มในแท็บ — หนา แล้วตามด้วยคำอธิบายสั้นสีรอง */
function BlockTitle({
  children,
  hint,
  htmlFor,
  id,
}: {
  children: ReactNode;
  hint?: ReactNode;
  /** ใส่เมื่อหัวข้อนี้คือชื่อของช่องกรอก */
  htmlFor?: string;
  id?: string;
}) {
  return (
    <div className="mb-3">
      {htmlFor ? (
        <label htmlFor={htmlFor} id={id} className="block text-lg font-bold">
          {children}
        </label>
      ) : (
        <h3 id={id} className="text-lg font-bold">
          {children}
        </h3>
      )}
      {hint && <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p>}
    </div>
  );
}

/* =========================================================================
   ช่องวางลิงก์ที่ใช้ซ้ำได้ — มีพรีวิวคลิปในตัว
   ========================================================================= */

function LinkBox({
  label,
  hint,
  actionLabel,
  onPick,
}: {
  label: string;
  hint: string;
  actionLabel: string;
  onPick: (info: YoutubeInfo) => Promise<void> | void;
}) {
  const inputId = useId();
  const [link, setLink] = useState("");
  const [info, setInfo] = useState<YoutubeInfo | null>(null);
  const [state, setState] = useState<"none" | "loading" | "invalid" | "missing" | "ok">(
    "none",
  );
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (raw: string) => {
    setLink(raw);
    if (timer.current != null) window.clearTimeout(timer.current);
    const token = ++seq.current;

    const text = raw.trim();
    if (!text) {
      setState("none");
      setInfo(null);
      return;
    }
    const videoId = videoIdFrom(text);
    if (!videoId) {
      setState("invalid");
      setInfo(null);
      return;
    }
    setState("loading");
    timer.current = window.setTimeout(() => {
      void lookupVideo(videoId).then((found) => {
        if (token !== seq.current) return;
        setInfo(found);
        setState(found ? "ok" : "missing");
      });
    }, LOOKUP_DELAY);
  };

  const go = async () => {
    if (!info) return;
    setBusy(true);
    try {
      await onPick(info);
      // ล้างช่องเฉพาะตอนสำเร็จ ล้มเหลวแล้วต้องเหลือลิงก์ไว้ให้กดซ้ำได้
      setLink("");
      setInfo(null);
      setState("none");
    } catch {
      /* ผู้เรียกแจ้งสาเหตุไปแล้ว ตรงนี้แค่กันไม่ให้กลายเป็น unhandled rejection */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BlockTitle htmlFor={inputId} hint={hint}>
        {label}
      </BlockTitle>
      <Input
        id={inputId}
        value={link}
        onChange={(e) => onChange(e.target.value)}
        placeholder="วางลิงก์ YouTube"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={state === "invalid" || state === "missing"}
        aria-describedby={`${inputId}-status`}
      />

      <div id={`${inputId}-status`} aria-live="polite" className="mt-3 empty:hidden">
        {state === "invalid" && (
          <p className="text-sm text-danger">
            ลิงก์นี้ไม่ใช่ลิงก์ YouTube ลองก๊อปจากปุ่มแชร์ของคลิปอีกครั้ง
          </p>
        )}
        {state === "missing" && (
          <p className="text-sm text-danger">หาคลิปนี้ไม่เจอ อาจถูกลบหรือตั้งเป็นส่วนตัวไว้</p>
        )}
        {state === "loading" && (
          <div className="flex items-center gap-3">
            <Skeleton className="aspect-video w-24 shrink-0 rounded-thumb" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          </div>
        )}
        {state === "ok" && info && (
          <div className="flex items-center gap-3">
            <Cover videoId={info.videoId} size="sm" className="w-24" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 leading-snug font-medium">{info.title}</p>
              <p className="mt-0.5 truncate text-sm text-muted">{info.author}</p>
            </div>
          </div>
        )}
      </div>

      <Button onClick={go} disabled={!info} loading={busy} className="mt-4 w-full sm:w-auto">
        {actionLabel}
      </Button>
    </div>
  );
}

/* =========================================================================
   ใส่เพลงเอง
   ========================================================================= */

function AddSong({
  channelId,
  searchEndpoint,
}: {
  channelId: string;
  searchEndpoint?: string;
}) {
  const searchId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const queue = async (info: {
    videoId: string;
    title: string;
    author: string;
  }) => {
    const user = authStore.user();
    if (!user) {
      toast("ต้องล็อกอินก่อนถึงจะใส่เพลงได้", "error");
      return;
    }
    /*
      ต้องเช็คว่าเขียนลงจริงก่อนค่อยบอกว่าสำเร็จ

      addSongToQueue คืน null เงียบๆ ได้ (ยังต่อฐานข้อมูลไม่ติด) และโยน error ได้
      (สิทธิ์/เน็ต) ของเดิมเด้ง "ใส่คิวแล้ว" ทุกกรณี คนกดเลยนึกว่าเพลงเข้าคิวแล้ว
      แต่ไม่มีอะไรเกิดขึ้น แล้วไปสงสัยว่าตัวเล่นพัง ทั้งที่เพลงไม่เคยถูกบันทึกเลย
    */
    let newId: string | null = null;
    try {
      newId = await addSongToQueue(
        channelId,
        {
          videoId: info.videoId,
          title: info.title,
          author: info.author,
          url: watchUrl(info.videoId),
          byUid: user.uid,
          byName: "สตรีมเมอร์",
        },
        "streamer",
      );
    } catch (err) {
      console.error("ใส่เพลงเข้าคิวไม่สำเร็จ", err);
      toast(
        `ใส่คิวไม่สำเร็จ ลองกดอีกครั้ง (${err instanceof Error ? err.message : err})`,
        "error",
        7000,
      );
      return;
    }
    if (!newId) {
      toast("ใส่คิวไม่สำเร็จ ต่อฐานข้อมูลไม่ติด รีเฟรชหน้าแล้วลองใหม่", "error", 7000);
      return;
    }

    setAdded(info.videoId);
    toast("ใส่คิวแล้ว", "success", 1600);
    window.setTimeout(() => setAdded(null), 1600);
  };

  const run = async () => {
    if (!searchEndpoint || !q.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await searchSongs(searchEndpoint, q);
    if (res.ok) setHits(res.items);
    else {
      setHits(null);
      setErr(res.reason);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-10">
      {/* ---------- ค้นหา ---------- */}
      {searchEndpoint ? (
        <div>
          <BlockTitle htmlFor={searchId}>ค้นหาเพลง</BlockTitle>
          <div className="flex gap-2">
            <Input
              id={searchId}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
              placeholder="ชื่อเพลงหรือชื่อศิลปิน"
              enterKeyHint="search"
              className="min-w-0 flex-1"
            />
            <Button
              variant="secondary"
              onClick={() => void run()}
              loading={busy}
              disabled={!q.trim()}
            >
              ค้นหา
            </Button>
          </div>

          {err && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {err}
            </p>
          )}

          {hits?.length === 0 && (
            <p className="mt-3 text-muted">
              ไม่เจอเพลงที่ตรงกับคำค้นนี้ ลองพิมพ์ให้สั้นลง หรือใส่ชื่อศิลปินด้วย
            </p>
          )}

          {!!hits?.length && (
            <ul className="rows mt-4 max-h-112 overflow-y-auto overscroll-contain">
              {hits.map((h) => {
                const isAdded = added === h.videoId;
                return (
                  <li key={h.videoId} className="py-1">
                    <button
                      type="button"
                      onClick={() => void queue(h)}
                      title="กดเพื่อใส่คิว"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-field p-2 text-left transition-colors hover:bg-fill"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={safeImageSrc(h.thumb ?? thumbUrl(h.videoId, "mq")) ?? ""}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-20 shrink-0 rounded-thumb bg-fill object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 leading-snug font-medium">{h.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-muted">
                          {h.author}
                        </span>
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 px-2 text-sm font-medium ${
                          isAdded ? "text-open" : "text-ink"
                        }`}
                      >
                        {isAdded ? (
                          <IconCheck className="h-4 w-4" strokeWidth={2.2} />
                        ) : (
                          <IconPlus className="h-4 w-4" strokeWidth={2} />
                        )}
                        {isAdded ? "ใส่แล้ว" : "ใส่คิว"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-sheet bg-fill p-5">
          <p className="font-bold">ยังค้นหาเพลงจากตรงนี้ไม่ได้</p>
          <p className="mt-1 max-w-prose text-sm text-muted">
            การค้นหาต้องใช้คีย์ YouTube Data API ซึ่งฝังไว้ในหน้าเว็บไม่ได้ (ใครเปิดดูก็หยิบไปใช้ได้)
            ใส่คีย์ไว้ใน Worker แล้ววางลิงก์ Worker ในช่อง &ldquo;ลิงก์ Worker สำหรับค้นหา&rdquo;
            ที่หน้าตั้งค่าช่องในสตูดิโอ ช่องค้นหาจะขึ้นตรงนี้เอง ระหว่างนี้วางลิงก์เพลงด้านล่างได้
          </p>
        </div>
      )}

      <LinkBox
        label="วางลิงก์เพลงที่อยากเปิด"
        hint="เพลงจะต่อท้ายคิว ถ้าคิวว่างอยู่ก็เล่นต่อทันที"
        actionLabel="ใส่คิว"
        onPick={async (info) => {
          const user = authStore.user();
          if (!user) {
            toast("ต้องล็อกอินก่อนถึงจะใส่เพลงได้", "error");
            return;
          }
          await addSongToQueue(
            channelId,
            {
              videoId: info.videoId,
              title: info.title,
              author: info.author,
              url: info.url,
              byUid: user.uid,
              byName: "สตรีมเมอร์",
            },
            "streamer",
          );
          toast("ใส่คิวแล้ว", "success");
        }}
      />
    </div>
  );
}

/* =========================================================================
   ประวัติ — ดึงกลับมาต่อคิวใหม่ได้
   ========================================================================= */

function History({ channelId, done }: { channelId: string; done: SongRequest[] }) {
  const [working, setWorking] = useState<string | null>(null);

  if (done.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีเพลงที่เล่นจบ"
        description="เพลงที่เล่นจบหรือถูกข้ามจะมาอยู่ที่นี่ กดต่อคิวใหม่ได้ทุกเมื่อ"
      />
    );
  }

  const requeue = async (song: SongRequest) => {
    const user = authStore.user();
    if (!user) {
      toast("ต้องล็อกอินก่อนถึงจะต่อคิวได้", "error");
      return;
    }
    setWorking(song.id);
    try {
      /* สร้างใบใหม่ ไม่ได้พลิกใบเก่ากลับเป็นคิว
         ประวัติจะได้ไม่หายไปจากรายการ และนับได้ว่าเพลงนี้ถูกเปิดกี่รอบ */
      await addSongToQueue(
        channelId,
        {
          videoId: song.videoId,
          title: song.title,
          author: song.author,
          url: song.url || watchUrl(song.videoId),
          byUid: user.uid,
          byName: song.byName || "สตรีมเมอร์",
        },
        "streamer",
      );
      toast(`ต่อคิว "${song.title.slice(0, 30)}" แล้ว`, "success");
    } catch {
      toast("ต่อคิวไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setWorking(null);
    }
  };

  return (
    <ul className="rows">
      {done.map((song) => (
        <li key={song.id} className="flex items-center gap-3 py-3">
          <Cover videoId={song.videoId} size="sm" className="w-16 sm:w-20" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 leading-snug font-medium">{song.title}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted">
              {song.status === "rejected" && <Badge>ถูกข้าม</Badge>}
              <span className="truncate">
                {song.source === "filler" ? "เพลงสำรอง" : `ขอโดย ${song.byName}`}
              </span>
            </p>
          </div>
          <Button
            variant="secondary"
            loading={working === song.id}
            onClick={() => void requeue(song)}
          >
            ต่อคิว
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* =========================================================================
   นำเข้าทั้งเพลย์ลิสต์จาก YouTube
   ========================================================================= */

function ImportPlaylist({
  existing,
  onImported,
}: {
  existing: FillerTrack[];
  onImported: (merged: FillerTrack[]) => Promise<void>;
}) {
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listId = playlistIdFrom(url);
  const isMix = !!listId && listId.startsWith("RD");

  const run = async () => {
    if (!listId) return;
    setBusy(true);
    setError(null);
    setStep("กำลังเปิดเพลย์ลิสต์…");

    /* ---- ขั้นที่ 1: อ่านรายชื่อเพลงจาก YouTube ---- */
    let fresh: FillerTrack[];
    try {
      const room = Math.max(0, FILLER_LIMIT - existing.length);
      if (room === 0) {
        setError(`เพลงสำรองเต็ม ${FILLER_LIMIT} เพลงแล้ว ลบบางเพลงออกก่อนค่อยนำเข้า`);
        return;
      }

      const found = await importPlaylist(listId, room, (done, total) =>
        setStep(`กำลังอ่านชื่อเพลง ${done}/${total}…`),
      );

      const have = new Set(existing.map((t) => t.videoId));
      fresh = found.filter((t) => !have.has(t.videoId));
      if (fresh.length === 0) {
        setError("ทุกเพลงในเพลย์ลิสต์นี้อยู่ในเพลงสำรองแล้ว");
        return;
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "yt-api-blocked"
          ? "โหลดตัวเล่นของ YouTube ไม่ได้ ตัวบล็อกโฆษณาบางตัวบล็อกไว้ ปิดตัวบล็อกเฉพาะเว็บนี้แล้วลองใหม่"
          : code === "playlist-not-public"
            ? /* เจอบ่อยสุดและงงสุด: เจ้าของกดลิงก์เข้าดูได้ปกติเลยไม่คิดว่าติดตรงนี้
                 ต้องบอกให้ชัดว่า "ไม่จำกัด" ยังไม่พอ ต้อง "สาธารณะ" เท่านั้น */
              "เพลย์ลิสต์นี้ยังไม่ได้ตั้งเป็นสาธารณะ กดลิงก์เข้าดูเองได้ก็จริง แต่ตัวเล่นฝังของ YouTube โหลดได้เฉพาะเพลย์ลิสต์สาธารณะ เปลี่ยนความเป็นส่วนตัวจาก “ไม่จำกัด” เป็น “สาธารณะ” แล้วลองใหม่"
            : code === "playlist-timeout"
              ? "อ่านเพลย์ลิสต์ไม่ทัน ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้เช็คว่าลิงก์ถูกต้อง"
              : "เปิดเพลย์ลิสต์นี้ไม่ได้ เช็คว่าเพลย์ลิสต์ตั้งเป็นสาธารณะแล้วลองใหม่",
      );
      return;
    } finally {
      setBusy(false);
      setStep(null);
    }

    /*
      ---- ขั้นที่ 2: บันทึกขึ้นคลาวด์ ----
      แยกออกมาจากขั้นแรก เพราะสองขั้นนี้พังคนละสาเหตุ ถ้ารวม try เดียวกัน
      "บันทึกไม่ผ่าน" จะไปโผล่เป็น "เพลย์ลิสต์นี้ไม่เปิดสาธารณะ" ซึ่งพาไปแก้ผิดทาง
      และห้ามเด้ง "เพิ่มสำเร็จ" ถ้าขั้นนี้ยังไม่ผ่าน — ผู้ใช้จะนึกว่าเซฟแล้ว
      แล้วรู้ตัวอีกทีตอนเปิดอีกเครื่องแล้วกองว่างเปล่า
    */
    try {
      await onImported([...existing, ...fresh]);
    } catch {
      // ตัวบันทึกแจ้งสาเหตุจริงไปแล้ว ตรงนี้แค่ไม่ต้องบอกว่าสำเร็จ
      setError("อ่านเพลย์ลิสต์ได้ แต่บันทึกลงช่องไม่สำเร็จ ลองกดดึงเพลงอีกครั้ง");
      return;
    }
    setUrl("");
    toast(`เพิ่ม ${fresh.length} เพลงจากเพลย์ลิสต์แล้ว`, "success");
  };

  return (
    <div>
      <BlockTitle
        htmlFor={inputId}
        hint={
          <>
            วางลิงก์เพลย์ลิสต์ หรือลิงก์คลิปที่มี <code>&amp;list=</code> ต่อท้ายก็ได้
            ระบบจะดึงรายชื่อเพลงมาใส่เพลงสำรองให้ ไม่มีเสียงดังระหว่างนำเข้า
            <br />
            {/* บอกไว้ตั้งแต่ต้น ไม่ต้องรอให้ลองแล้วพัง 15 วินาทีก่อนถึงจะรู้ */}
            เพลย์ลิสต์ต้องตั้งเป็น <strong className="font-semibold text-ink">สาธารณะ</strong>{" "}
            แบบ &ldquo;ไม่จำกัด&rdquo; กดลิงก์เข้าดูได้ก็จริง แต่ตัวเล่นฝังของ YouTube โหลดไม่ได้
          </>
        }
      >
        นำเข้าทั้งเพลย์ลิสต์
      </BlockTitle>
      <Input
        id={inputId}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder="วางลิงก์เพลย์ลิสต์ YouTube"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!url.trim() && !listId}
      />

      <div aria-live="polite" className="mt-3 space-y-2 empty:hidden">
        {!!url.trim() && !listId && (
          <p className="text-sm text-danger">
            ลิงก์นี้ไม่มีรหัสเพลย์ลิสต์ ต้องมี <code>list=</code> อยู่ในลิงก์
          </p>
        )}

        {isMix && (
          <p className="max-w-prose text-sm text-muted">
            นี่คือเพลย์ลิสต์แบบ Mix ที่ YouTube ทำให้อัตโนมัติ
            รายการที่ได้จะเป็นภาพ ณ ตอนนำเข้า ไม่อัปเดตตามทีหลัง
          </p>
        )}

        {error && (
          <p role="alert" className="max-w-prose text-sm text-danger">
            {error}
          </p>
        )}
        {step && (
          <p className="num flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5" />
            {step}
          </p>
        )}
      </div>

      <Button
        onClick={() => void run()}
        disabled={!listId}
        loading={busy}
        variant="secondary"
        className="mt-4 w-full sm:w-auto"
      >
        ดึงเพลงจากเพลย์ลิสต์
      </Button>
    </div>
  );
}

/* =========================================================================
   เพลย์ลิสต์สำรอง
   ========================================================================= */

const MODES: { key: "off" | "order" | "shuffle"; label: string; hint: string }[] = [
  { key: "off", label: "ปิด", hint: "คิวว่างก็ปล่อยเงียบ" },
  { key: "order", label: "ตามลำดับ", hint: "ไล่จากบนลงล่างแล้ววนใหม่" },
  { key: "shuffle", label: "สุ่ม", hint: "เลี่ยงเพลงที่เพิ่งเล่นไป" },
];

function Filler({
  channelId,
  tracks,
  mode,
  canEdit,
}: {
  channelId: string;
  tracks: FillerTrack[];
  mode: "off" | "order" | "shuffle";
  canEdit: boolean;
}) {
  const [busy, setBusy] = useState(false);

  /*
    บันทึกกองสำรองขึ้นช่องบนคลาวด์

    ต้องโยน error ต่อ ไม่ใช่กลืนไว้เอง — ผู้เรียกบางรายมีขั้นตอนต่อจากนี้
    (ตัวนำเข้าเพลย์ลิสต์เด้ง "เพิ่มสำเร็จ") ถ้ากลืนไว้ มันจะบอกว่าสำเร็จ
    ทั้งที่ไม่มีอะไรขึ้นเซิร์ฟเวอร์เลย แล้วผู้ใช้จะรู้ตัวอีกทีตอนเปิดอีกเครื่อง

    บอกสาเหตุจริงจาก Firestore ด้วย ไม่ใช่เดาว่า "ไม่ใช่เจ้าของช่อง" อย่างเดียว
    เพราะเขียนไม่ผ่านได้หลายทาง (เน็ตหลุด / กติกาเปลี่ยน / ล็อกอินคนละบัญชี)
    แล้วแคชในเครื่องของ Firestore ยังโชว์รายการค้างไว้เหมือนเซฟสำเร็จอีก
  */
  const save = async (next: FillerTrack[]) => {
    setBusy(true);
    try {
      await saveFillerList(channelId, next);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      console.error("บันทึกกองสำรองไม่สำเร็จ", err);
      toast(`บันทึกเพลงสำรองไม่สำเร็จ ลองใหม่อีกครั้ง (${why})`, "error", 7000);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  /*
    ต่อเพลงสำรองเข้าคิวเดี๋ยวนี้ — อยากเปิดเพลงนี้ช่วงไหนก็หยิบมาต่อเอง ไม่ต้องรอสุ่ม
    ติดป้ายเป็นเพลงสำรอง (source filler) จึงยังอยู่ท้ายคิว เพลงที่คนดูขอแซงขึ้นก่อนได้
    (เดิมอยู่ในรายการเพลงสำรองชุดที่สองข้างคิว ย้ายมารวมที่นี่ที่เดียว)
  */
  const queueNow = async (track: FillerTrack) => {
    const uid = authStore.user()?.uid;
    if (!uid) {
      toast("ต้องล็อกอินก่อนถึงจะต่อคิวได้", "error");
      return;
    }
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
      toast("ต่อคิวไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    }
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="filler-mode-title">
        <BlockTitle
          id="filler-mode-title"
          hint="คิวว่างเมื่อไหร่ ตัวเล่นจะหยิบเพลงสำรองมาต่อให้เอง พอมีคนขอเพลงเข้ามา เพลงของเขาจะแทรกขึ้นก่อนเพลงสำรองที่ยังไม่ได้เล่น"
        >
          เล่นเพลงสำรองแบบไหน
        </BlockTitle>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() =>
                  void saveFillerMode(channelId, m.key).catch((err) => {
                    /* ปุ่มจะเด้งกลับค่าเดิมเองเมื่อสแนปช็อตไม่เปลี่ยน
                       ถ้าไม่บอกสาเหตุ ผู้ใช้จะนึกว่าปุ่มเสีย */
                    console.error("เปลี่ยนโหมดเล่นสำรองไม่สำเร็จ", err);
                    toast(
                      `เปลี่ยนโหมดไม่สำเร็จ ลองใหม่อีกครั้ง (${err instanceof Error ? err.message : err})`,
                      "error",
                      7000,
                    );
                  })
                }
                className={`min-h-11 cursor-pointer rounded-field px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "bg-ink text-onink" : "bg-fill text-ink hover:bg-fill-2"
                }`}
              >
                <span className="block font-medium">{m.label}</span>
                <span className={`mt-0.5 block text-xs ${on ? "text-onink/75" : "text-muted"}`}>
                  {m.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-line pt-8">
        <ImportPlaylist
          existing={tracks}
          onImported={async (merged) => {
            await save(merged);
          }}
        />
      </section>

      <section className="border-t border-line pt-8">
        <LinkBox
          label="เพิ่มทีละเพลง"
          hint={`ใส่ได้สูงสุด ${FILLER_LIMIT} เพลง`}
          actionLabel="เพิ่มเข้าเพลงสำรอง"
          onPick={async (info) => {
            if (tracks.some((t) => t.videoId === info.videoId)) {
              toast("เพลงนี้อยู่ในเพลงสำรองแล้ว", "info");
              return;
            }
            if (tracks.length >= FILLER_LIMIT) {
              toast(`เพลงสำรองเต็ม ${FILLER_LIMIT} เพลงแล้ว ลบบางเพลงออกก่อน`, "error");
              return;
            }
            await save([
              ...tracks,
              { videoId: info.videoId, title: info.title, author: info.author },
            ]);
            toast("เพิ่มเข้าเพลงสำรองแล้ว", "success");
          }}
        />
      </section>

      <section aria-labelledby="filler-list-title" className="border-t border-line pt-8">
        <BlockTitle id="filler-list-title">
          รายการเพลงสำรอง
          <span className="num ml-2 font-normal text-muted">
            {tracks.length}/{FILLER_LIMIT}
          </span>
        </BlockTitle>

        {tracks.length === 0 ? (
          <EmptyState
            title="ยังไม่มีเพลงสำรอง"
            description="ใส่เพลงที่เปิดได้เรื่อยๆ ไว้สักชุด ช่วงที่ไม่มีใครขอจะได้ไม่เงียบ"
          />
        ) : (
          /* เลขลำดับคือลำดับจริงที่โหมด "ตามลำดับ" ไล่เล่น */
          <ol className="rows">
            {tracks.map((t, i) => (
              <li key={t.videoId} className="flex items-center gap-3 py-2">
                <span className="num w-7 shrink-0 text-center text-sm font-semibold text-muted">
                  {i + 1}
                </span>
                <Cover videoId={t.videoId} size="sm" className="w-16" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 leading-snug font-medium">{t.title}</p>
                  <p className="mt-0.5 truncate text-sm text-muted">{t.author}</p>
                </div>
                <ActionMenu
                  label={`คำสั่งของเพลงสำรอง ${t.title}`}
                  items={[
                    { label: "ต่อคิวตอนนี้", Icon: IconPlus, onSelect: () => void queueNow(t) },
                    {
                      label: "เอาออกจากเพลงสำรอง",
                      Icon: IconMinusCircle,
                      danger: true,
                      disabled: busy || !canEdit,
                      onSelect: () =>
                        void save(tracks.filter((x) => x.videoId !== t.videoId)).catch(() => {}),
                    },
                  ]}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
