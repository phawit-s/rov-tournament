"use client";

import { useEffect, useRef, useState } from "react";
import { authStore } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { FILLER_LIMIT } from "@/lib/song/filler";
import { saveFillerList, saveFillerMode } from "@/lib/song/config";
import { importPlaylist, playlistIdFrom } from "@/lib/song/playlist";
import { searchSongs, type SearchHit } from "@/lib/song/search";
import { addSongToQueue, watchSongQueue } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type FillerTrack, type SongRequest } from "@/lib/song/types";
import { lookupVideo, thumbUrl, videoIdFrom, watchUrl } from "@/lib/song/youtube";
import type { YoutubeInfo } from "@/lib/song/youtube";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Tabs from "../ui/Tabs";
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

  return (
    <Panel className="p-5 sm:p-6">
      <Tabs
        label="เครื่องมือของสตรีมเมอร์"
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { key: "add", label: "ใส่เพลงเอง" },
          { key: "history", label: "ประวัติ", count: done.length || null },
          { key: "filler", label: "เพลย์ลิสต์สำรอง", count: filler.length || null },
        ]}
      />

      {tab === "add" && (
        <AddSong channelId={channelId} searchEndpoint={songs.searchEndpoint?.trim()} />
      )}

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
        <p className="text-xs text-danger">ลิงก์ไม่ถูกต้อง วางลิงก์ YouTube หรือไอดีคลิป</p>
      )}
      {state === "missing" && (
        <p className="text-xs text-danger">หาคลิปนี้ไม่เจอ อาจถูกลบหรือตั้งเป็นส่วนตัว</p>
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

function AddSong({
  channelId,
  searchEndpoint,
}: {
  channelId: string;
  searchEndpoint?: string;
}) {
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
        `ใส่คิวไม่สำเร็จ — ${err instanceof Error ? err.message : err}`,
        "error",
        7000,
      );
      return;
    }
    if (!newId) {
      toast("ใส่คิวไม่สำเร็จ — ต่อฐานข้อมูลไม่ติด ลองรีเฟรชหน้าแล้วลองใหม่", "error", 7000);
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
    <div className="space-y-5">
      {/* ---------- ค้นหา ---------- */}
      {searchEndpoint ? (
        <div className="space-y-3">
          <p className="mb-2 text-sm font-medium text-ice/85">ค้นหาเพลง</p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
              placeholder="พิมพ์ชื่อเพลงหรือชื่อศิลปิน"
              className="min-w-0 flex-1"
            />
            <Button onClick={() => void run()} loading={busy} disabled={!q.trim()}>
              ค้นหา
            </Button>
          </div>

          {err && <p className="text-xs text-danger">{err}</p>}

          {hits?.length === 0 && (
            <p className="text-sm text-muted">ไม่เจอเพลงที่ตรงกับคำค้นนี้</p>
          )}

          {!!hits?.length && (
            <ul className="no-scrollbar max-h-96 space-y-2 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.videoId}>
                  <button
                    type="button"
                    onClick={() => void queue(h)}
                    title="กดเพื่อใส่คิว"
                    className="hover-tile tile flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={safeImageSrc(h.thumb ?? thumbUrl(h.videoId, "mq")) ?? ""}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-20 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-sm leading-snug text-ice">
                        {h.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {h.author}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-display text-xs ${
                        added === h.videoId ? "text-win" : "text-iris"
                      }`}
                    >
                      {added === h.videoId ? "ใส่แล้ว" : "+ ใส่คิว"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <span className="rule block h-px" />
        </div>
      ) : (
        <div className="tally rounded-xl tile px-4 py-3">
          <p className="slug slug-2">ยังไม่มีช่องค้นหา</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            การค้นหาต้องใช้คีย์ YouTube Data API ซึ่งฝังในหน้าเว็บไม่ได้ (ใครก็หยิบไปใช้ได้)
            ใส่คีย์ไว้ใน Worker แล้ววางลิงก์ Worker ที่หน้าช่อง → ระบบขอเพลง
            ช่องค้นหาจะโผล่ตรงนี้เอง ระหว่างนี้วางลิงก์เพลงข้างล่างได้เหมือนเดิม
          </p>
        </div>
      )}

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
   นำเข้าทั้งเพลย์ลิสต์จาก YouTube
   ========================================================================= */

function ImportPlaylist({
  existing,
  onImported,
}: {
  existing: FillerTrack[];
  onImported: (merged: FillerTrack[]) => Promise<void>;
}) {
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
        setError(`กองเต็มแล้ว (${FILLER_LIMIT} เพลง) ลบบางเพลงออกก่อน`);
        return;
      }

      const found = await importPlaylist(listId, room, (done, total) =>
        setStep(`กำลังอ่านชื่อเพลง ${done}/${total}…`),
      );

      const have = new Set(existing.map((t) => t.videoId));
      fresh = found.filter((t) => !have.has(t.videoId));
      if (fresh.length === 0) {
        setError("เพลงในเพลย์ลิสต์นี้อยู่ในกองครบแล้ว");
        return;
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "yt-api-blocked"
          ? "โหลดตัวเล่นของ YouTube ไม่ได้ — ตัวบล็อกโฆษณาบางตัวบล็อกไว้ ลองปิดเฉพาะเว็บนี้"
          : code === "playlist-not-public"
            ? /* เจอบ่อยสุดและงงสุด: เจ้าของกดลิงก์เข้าดูได้ปกติเลยไม่คิดว่าติดตรงนี้
                 ต้องบอกให้ชัดว่า "ไม่จำกัด" ยังไม่พอ ต้อง "สาธารณะ" เท่านั้น */
              "เพลย์ลิสต์นี้ยังไม่ได้ตั้งเป็นสาธารณะ — กดลิงก์เข้าดูเองได้ก็จริง แต่ตัวเล่นฝังของ YouTube โหลดได้เฉพาะเพลย์ลิสต์สาธารณะ ไปเปลี่ยนความเป็นส่วนตัวจาก “ไม่จำกัด” เป็น “สาธารณะ” แล้วลองใหม่"
            : code === "playlist-timeout"
              ? "อ่านเพลย์ลิสต์ไม่ทัน ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้เช็คว่าลิงก์ถูกต้อง"
              : "เปิดเพลย์ลิสต์นี้ไม่ได้ ต้องเป็นเพลย์ลิสต์ที่เปิดสาธารณะ",
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
      setError("อ่านเพลย์ลิสต์ได้ แต่บันทึกลงช่องไม่สำเร็จ");
      return;
    }
    setUrl("");
    toast(`เพิ่ม ${fresh.length} เพลงจากเพลย์ลิสต์แล้ว`, "success");
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-medium text-ice/85">นำเข้าทั้งเพลย์ลิสต์</p>
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://www.youtube.com/watch?v=...&list=..."
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!url.trim() && !listId}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          วางลิงก์เพลย์ลิสต์หรือลิงก์คลิปที่มี <code>&amp;list=</code> ต่อท้ายก็ได้
          ระบบจะดึงรายการเพลงมาใส่กองสำรองให้ (ไม่มีเสียงดังระหว่างนำเข้า)
          <br />
          {/* บอกไว้ตั้งแต่ต้น ไม่ต้องรอให้ลองแล้วพัง 15 วินาทีก่อนถึงจะรู้ */}
          เพลย์ลิสต์ต้องตั้งเป็น <b>สาธารณะ</b> — แบบ “ไม่จำกัด” กดลิงก์เข้าดูได้ก็จริง
          แต่ตัวเล่นฝังของ YouTube โหลดไม่ได้
        </p>
      </div>

      {!!url.trim() && !listId && (
        <p className="text-xs text-danger">
          ลิงก์นี้ไม่มีรหัสเพลย์ลิสต์ — ต้องมี <code>list=</code> อยู่ในลิงก์
        </p>
      )}

      {isMix && (
        <p className="text-xs leading-relaxed text-muted">
          นี่คือเพลย์ลิสต์แบบ Mix ที่ YouTube ปั้นให้อัตโนมัติ
          รายการที่ได้จะเป็นภาพ ณ ตอนนำเข้า ไม่ได้อัปเดตตามทีหลัง
        </p>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {step && <p className="num text-xs text-iris">{step}</p>}

      <Button
        onClick={() => void run()}
        disabled={!listId}
        loading={busy}
        variant="outline"
        className="w-full sm:w-auto"
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
      toast(`บันทึกกองสำรองไม่สำเร็จ — ${why}`, "error", 7000);
      throw err;
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
                onClick={() =>
                  void saveFillerMode(channelId, m.key).catch((err) => {
                    /* ปุ่มจะเด้งกลับค่าเดิมเองเมื่อสแนปช็อตไม่เปลี่ยน
                       ถ้าไม่บอกสาเหตุ ผู้ใช้จะนึกว่าปุ่มเสีย */
                    console.error("เปลี่ยนโหมดเล่นสำรองไม่สำเร็จ", err);
                    toast(
                      `เปลี่ยนโหมดไม่สำเร็จ — ${err instanceof Error ? err.message : err}`,
                      "error",
                      7000,
                    );
                  })
                }
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-center transition-all duration-200 ${
                  on
                    ? "bg-iris/14 text-iris ring-1 ring-iris/45"
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

      <ImportPlaylist
        existing={tracks}
        onImported={async (merged) => {
          await save(merged);
        }}
      />

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
                onClick={() => void save(tracks.filter((x) => x.videoId !== t.videoId)).catch(() => {})}
                className="shrink-0 cursor-pointer px-2 text-xs text-muted transition-colors hover:text-danger disabled:cursor-not-allowed"
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
