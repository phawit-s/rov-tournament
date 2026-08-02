"use client";

import { useEffect, useRef, useState } from "react";
import { authStore } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { FILLER_LIMIT, saveFillerList, saveFillerMode } from "@/lib/song/filler";
import { addSongToQueue, watchSongQueue } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type FillerTrack, type SongRequest } from "@/lib/song/types";
import { lookupVideo, thumbUrl, videoIdFrom, watchUrl } from "@/lib/song/youtube";
import type { YoutubeInfo } from "@/lib/song/youtube";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { EmptyState, Input, Skeleton } from "../tournament/ui";

const EMPTY: SongRequest[] = [];
const LOOKUP_DELAY = 450;

type Tab = "add" | "history" | "filler";

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
}: {
  channelId: string;
  channel: Channel | null;
}) {
  const [tab, setTab] = useState<Tab>("add");
  const [queue, setQueue] = useState<SongRequest[]>(EMPTY);

  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(channelId, setQueue, { onError: () => setQueue(EMPTY) });
  }, [channelId]);

  const songs = { ...DEFAULT_SONG_CONFIG, ...channel?.songs };
  const filler = songs.filler ?? [];
  const done = queue
    .filter((s) => s.status === "played" || s.status === "rejected")
    .sort((a, b) =>
      (b.playedAt ?? b.createdAt ?? "").localeCompare(a.playedAt ?? a.createdAt ?? ""),
    );

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "add", label: "ใส่เพลงเอง" },
    { key: "history", label: "ประวัติ", count: done.length },
    { key: "filler", label: "เพลย์ลิสต์สำรอง", count: filler.length },
  ];

  return (
    <Panel className="p-5 sm:p-6">
      <div className="tile no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 grow cursor-pointer rounded-lg px-3 py-2 font-display text-xs whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)] text-[#1b1509]"
                : "text-muted hover:text-ice"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={`num ml-1.5 text-eyebrow ${
                  tab === t.key ? "text-[#1b1509]/60" : "text-muted/70"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "add" && <AddSong channelId={channelId} />}

      {tab === "history" && (
        <History channelId={channelId} done={done} />
      )}

      {tab === "filler" && (
        <Filler
          channelId={channelId}
          tracks={filler}
          mode={songs.fillerMode ?? "off"}
          canEdit={!!channel}
        />
      )}
    </Panel>
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
      setLink("");
      setInfo(null);
      setState("none");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-medium text-ice/85">{label}</p>
        <Input
          value={link}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state === "invalid" || state === "missing"}
        />
        <p className="mt-2 text-xs text-muted">{hint}</p>
      </div>

      {state === "invalid" && (
        <p className="text-xs text-[#e79a9a]">ลิงก์ไม่ถูกต้อง วางลิงก์ YouTube หรือไอดีคลิป</p>
      )}
      {state === "missing" && (
        <p className="text-xs text-[#e79a9a]">หาคลิปนี้ไม่เจอ อาจถูกลบหรือตั้งเป็นส่วนตัว</p>
      )}
      {state === "loading" && (
        <div className="sunken flex items-center gap-3 rounded-xl p-3">
          <Skeleton className="aspect-video w-24 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-4/5 rounded-md" />
            <Skeleton className="h-3 w-2/5 rounded-md" />
          </div>
        </div>
      )}
      {state === "ok" && info && (
        <div className="sunken flex items-center gap-3 rounded-xl p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeImageSrc(thumbUrl(info.videoId, "mq")) ?? ""}
            alt=""
            loading="lazy"
            className="aspect-video w-24 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-snug text-ice">{info.title}</p>
            <p className="mt-1 truncate text-xs text-muted">{info.author}</p>
          </div>
        </div>
      )}

      <Button onClick={go} disabled={!info} loading={busy} className="w-full sm:w-auto">
        {actionLabel}
      </Button>
    </div>
  );
}

/* =========================================================================
   ใส่เพลงเอง
   ========================================================================= */

function AddSong({ channelId }: { channelId: string }) {
  return (
    <div className="space-y-4">
      <LinkBox
        label="วางลิงก์เพลงที่อยากเปิด"
        hint="เพลงจะต่อท้ายคิวปกติ ถ้าคิวว่างอยู่ก็เล่นต่อทันที"
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

      <p className="text-xs leading-relaxed text-muted">
        อยากค้นหาเพลงจากในหน้านี้เลยต้องต่อ YouTube Data API ซึ่งใช้คีย์ของ Google —
        ตอนนี้ยังไม่ได้ต่อไว้ ระหว่างนี้ก๊อปลิงก์จากแอป YouTube มาวางได้เหมือนกัน
      </p>
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
        description="เพลงที่เล่นจบหรือถูกข้ามจะมากองอยู่ที่นี่ กดต่อคิวใหม่ได้ทุกเมื่อ"
      />
    );
  }

  const requeue = async (song: SongRequest) => {
    const user = authStore.user();
    if (!user) {
      toast("ต้องล็อกอินก่อน", "error");
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
      toast("ต่อคิวไม่สำเร็จ", "error");
    } finally {
      setWorking(null);
    }
  };

  return (
    <ul className="space-y-2">
      {done.map((song) => (
        <li key={song.id} className="tile flex items-center gap-3 rounded-xl p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={safeImageSrc(thumbUrl(song.videoId, "mq")) ?? ""}
            alt=""
            loading="lazy"
            className="aspect-video w-16 shrink-0 rounded-md object-cover sm:w-20"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-snug text-ice">{song.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {song.status === "rejected" ? "ถูกข้าม" : "เล่นจบ"} · ขอโดย {song.byName}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={working === song.id}
            onClick={() => void requeue(song)}
            className="shrink-0"
          >
            ต่อคิวอีก
          </Button>
        </li>
      ))}
    </ul>
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

  const save = async (next: FillerTrack[]) => {
    setBusy(true);
    try {
      await saveFillerList(channelId, next);
    } catch {
      toast("บันทึกไม่สำเร็จ — ต้องเป็นเจ้าของช่องถึงจะแก้ได้", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-ice/85">เล่นสำรองแบบไหน</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                disabled={!canEdit}
                onClick={() => void saveFillerMode(channelId, m.key).catch(() => {})}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-center transition-all duration-200 ${
                  on
                    ? "bg-champagne/14 text-champagne ring-1 ring-champagne/45"
                    : "tile hover-tile text-muted hover:text-ice"
                }`}
              >
                <span className="block font-display text-sm">{m.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{m.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          คิวว่างเมื่อไหร่ระบบจะหยิบจากกองนี้มาต่อให้เอง
          พอมีคนขอเพลงเข้ามาจริง เพลงของเขาจะแทรกขึ้นก่อนเพลงสำรองที่ยังไม่ได้เล่น
        </p>
      </div>

      <span className="rule block h-px" />

      <LinkBox
        label="เพิ่มเพลงเข้ากอง"
        hint={`ใส่ได้สูงสุด ${FILLER_LIMIT} เพลง`}
        actionLabel="เพิ่มเข้ากอง"
        onPick={async (info) => {
          if (tracks.some((t) => t.videoId === info.videoId)) {
            toast("เพลงนี้อยู่ในกองแล้ว", "info");
            return;
          }
          if (tracks.length >= FILLER_LIMIT) {
            toast(`กองเต็มแล้ว (${FILLER_LIMIT} เพลง)`, "error");
            return;
          }
          await save([
            ...tracks,
            { videoId: info.videoId, title: info.title, author: info.author },
          ]);
          toast("เพิ่มแล้ว", "success");
        }}
      />

      {tracks.length === 0 ? (
        <EmptyState
          title="ยังไม่มีเพลงสำรอง"
          description="ใส่เพลงที่เปิดได้เรื่อยๆ ไว้สักชุด ช่วงที่ไม่มีใครขอจะได้ไม่เงียบ"
        />
      ) : (
        <ul className="space-y-2">
          {tracks.map((t, i) => (
            <li key={t.videoId} className="tile flex items-center gap-3 rounded-xl p-2.5">
              <span className="num w-6 shrink-0 text-center font-display text-xs text-muted">
                {i + 1}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={safeImageSrc(thumbUrl(t.videoId, "mq")) ?? ""}
                alt=""
                loading="lazy"
                className="aspect-video w-16 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-snug text-ice">{t.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{t.author}</p>
              </div>
              <button
                type="button"
                disabled={busy || !canEdit}
                onClick={() => void save(tracks.filter((x) => x.videoId !== t.videoId))}
                className="shrink-0 cursor-pointer px-2 text-xs text-muted transition-colors hover:text-[#e79a9a] disabled:cursor-not-allowed"
                aria-label="เอาเพลงนี้ออก"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
