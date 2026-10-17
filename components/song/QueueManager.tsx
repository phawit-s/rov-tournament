"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNow } from "@/hooks/useClient";
import { useOpenQueue } from "@/hooks/useSong";
import { useStudioChannel } from "@/hooks/useStudioChannel";
import type { Channel } from "@/lib/channel/types";
import { timeAgo } from "@/lib/format";
import { setSongsEnabled } from "@/lib/song/config";
import {
  clearAllFinishedSongs,
  moveSongInQueue,
  removeSongRequest,
  setSongStatus,
  splitQueue,
  watchRecentFinished,
} from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type SongRequest } from "@/lib/song/types";
import { watchUrl } from "@/lib/song/youtube";
import PageHead from "../studio/PageHead";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Cover from "../ui/Cover";
import MiniBtn, { MiniLink } from "../ui/MiniBtn";
import { SwitchRow } from "../ui/Switch";
import { toast } from "../ui/Toast";
import { IconChevronDown, IconClose, IconToTop } from "../ui/icons";
import { Badge, EmptyState, Skeleton } from "../ui/kit";
import Stage from "./Stage";
import { SongPlayerCore } from "./SongPlayer";

const NO_SONGS: SongRequest[] = [];

/**
 * จัดคิวเพลง — /studio/queue/
 *
 * อ่านเฉพาะคิวที่ยังไม่จบ (ท่อร่วมเดียวกับหน้าภาพรวม) ส่วนประวัติอ่านทีหลัง
 * ตอนกดเปิดดูเท่านั้น และอ่านแค่ 40 ใบล่าสุด — ของเดิมดึงทุกใบที่เคยขอทุกครั้ง
 * ที่เปิดหน้า ช่องที่ไลฟ์ทุกคืนมีเป็นพันใบ (ดู watchRecentFinished)
 */
export default function QueueManager() {
  const { channel, loaded, missingId } = useStudioChannel();

  if (!loaded) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full rounded-stage" />
      </div>
    );
  }
  if (!channel) {
    return (
      <div className="space-y-8">
        <PageHead title="คิวเพลง" />
        <EmptyState
          title={missingId ? "ไม่พบช่องนี้" : "ยังไม่ได้เลือกช่อง"}
          description={
            missingId
              ? "ลิงก์นี้ชี้ไปที่ช่องที่ไม่มีแล้ว เลือกช่องจากตัวเลือกช่องแทน"
              : "เลือกช่องจากตัวเลือกช่อง หรือตั้งค่าช่องของคุณก่อน"
          }
        />
      </div>
    );
  }
  return <Manager key={channel.id} channel={channel} />;
}

function Manager({ channel }: { channel: Channel }) {
  const calm = useReducedMotion();
  const now = useNow(30_000);
  const config = { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const channelId = channel.id;
  const { queue, loaded } = useOpenQueue(channelId);
  const { playing, queued } = splitQueue(queue);

  const [working, setWorking] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  /** ทุกปุ่มในคิวเดินผ่านตัวนี้ จะได้มีสถานะกำลังทำงานและ toast แบบเดียวกัน */
  const run = async (id: string, job: () => Promise<void>, ok: string) => {
    setWorking(id);
    try {
      await job();
      toast(ok, "success", 1800);
    } catch (err) {
      toast(err instanceof Error ? err.message : "ทำไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setWorking(null);
    }
  };

  // ส่งคิวไปด้วย เพลงที่ค้างสถานะเล่นอยู่จะถูกปิดในทีเดียว ไม่มี "กำลังเล่น" สองเพลง
  const play = (song: SongRequest) =>
    run(song.id, () => setSongStatus(channelId, song.id, "playing", queue), "เปิดเพลงนี้แล้ว");
  const finish = (song: SongRequest) =>
    run(song.id, () => setSongStatus(channelId, song.id, "played"), "จบเพลงแล้ว");
  const skip = (song: SongRequest) =>
    run(song.id, () => setSongStatus(channelId, song.id, "rejected"), "ข้ามเพลงนี้แล้ว");
  const drop = (song: SongRequest) =>
    run(song.id, () => removeSongRequest(channelId, song.id), "ลบออกจากคิวแล้ว");
  const toTop = (song: SongRequest) =>
    run(song.id, () => moveSongInQueue(channelId, queued, song.id, "top"), "ย้ายขึ้นหัวคิวแล้ว");

  const toggle = async (next: boolean) => {
    setToggling(true);
    try {
      await setSongsEnabled(channelId, next);
      toast(next ? "เปิดรับเพลงแล้ว" : "ปิดรับเพลงแล้ว", "success");
    } catch {
      toast("เปลี่ยนไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-10">
      <PageHead
        title="คิวเพลง"
        meta={loaded ? queued.length : undefined}
        action={
          <a
            href={`/player/#ch=${channelId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
          >
            เปิดตัวเล่น
          </a>
        }
      />

      <SwitchRow
        checked={config.enabled}
        onChange={(v) => !toggling && void toggle(v)}
        label={config.enabled ? "เปิดรับคำขอเพลงอยู่" : "ปิดรับคำขอเพลงอยู่"}
        hint="มีผลทันที ไม่ต้องกดบันทึก"
        className="border-y border-line"
      />

      <Stage
        song={playing}
        layout="side"
        empty={
          <>
            <p className="text-lg font-bold">ยังไม่มีเพลงที่กำลังเล่น</p>
            <p className="mt-1 text-muted">
              {queued.length > 0
                ? "กดเล่นเพลงในคิวด้านล่าง หรือเปิดตัวเล่นทิ้งไว้ให้เล่นตามคิวเอง"
                : "พอมีคนขอเพลง ตัวเล่นจะเปิดให้เอง"}
            </p>
          </>
        }
        footer={
          playing && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button loading={working === playing.id} onClick={() => void finish(playing)}>
                จบเพลงนี้
              </Button>
              <MiniLink href={watchUrl(playing.videoId)}>เปิดใน YouTube</MiniLink>
              {playing.message && (
                <p className="w-full pt-1 text-sm text-muted">ข้อความจากคนขอ: {playing.message}</p>
              )}
            </div>
          )
        }
      />

      {/* ตัวเล่นในหน้านี้ — สำหรับคนที่ไม่อยากเปิดหน้าต่างแยก ล็อกผู้เล่นกันเสียงซ้อนให้อยู่แล้ว */}
      <section>
        <button
          type="button"
          onClick={() => setShowPlayer((v) => !v)}
          aria-expanded={showPlayer}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block font-semibold">เล่นเพลงในหน้านี้</span>
            <span className="block text-sm text-muted">
              ปกติเปิดตัวเล่นแยกหน้าต่างดีกว่า เปิดตรงนี้ได้ถ้ามีจอเดียว
            </span>
          </span>
          <IconChevronDown
            className={`h-5 w-5 shrink-0 text-muted transition-transform ${showPlayer ? "rotate-180" : ""}`}
          />
        </button>
        {showPlayer && (
          <div className="mt-4">
            <SongPlayerCore
              channelId={channelId}
              compact
              filler={config.filler}
              fillerMode={config.fillerMode}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="queue-title">
        <h2 id="queue-title" className="text-title font-bold">
          รอเล่น
          {loaded && <span className="num ml-2 font-normal text-muted">{queued.length}</span>}
        </h2>

        {!loaded ? (
          <div className="mt-4 space-y-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : queued.length === 0 ? (
          <p className="mt-2 text-muted">
            ยังไม่มีเพลงรอคิว แชร์ลิงก์หรือ QR ของช่องในไลฟ์ให้คนดูขอเพลง
          </p>
        ) : (
          <ol className="rows mt-2">
            <AnimatePresence initial={false}>
              {queued.map((song, i) => (
                <motion.li
                  key={song.id}
                  layout={!calm}
                  initial={{ opacity: 0, y: calm ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:flex-nowrap"
                >
                  <span className="num w-7 shrink-0 text-center font-semibold text-muted">
                    {i + 1}
                  </span>
                  <Cover videoId={song.videoId} size="sm" className="w-20 sm:w-24" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="line-clamp-2 leading-snug font-medium">{song.title}</p>
                    <SongMeta song={song} now={now} />
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
                    <Button
                      size="sm"
                      loading={working === song.id}
                      onClick={() => void play(song)}
                    >
                      เล่นเลย
                    </Button>
                    {i > 0 && song.source !== "filler" && (
                      <MiniBtn
                        title="ย้ายขึ้นหัวคิว"
                        disabled={working === song.id}
                        onClick={() => void toTop(song)}
                        className="w-9 px-0"
                      >
                        <IconToTop className="h-4 w-4" />
                      </MiniBtn>
                    )}
                    <MiniBtn disabled={working === song.id} onClick={() => void skip(song)}>
                      ข้าม
                    </MiniBtn>
                    <MiniBtn
                      danger
                      title="ลบออกจากคิว"
                      disabled={working === song.id}
                      onClick={() => void drop(song)}
                      className="w-9 px-0"
                    >
                      <IconClose className="h-4 w-4" />
                    </MiniBtn>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>

      <History channelId={channelId} queue={queue} now={now} onPlay={play} working={working} />
    </div>
  );
}

/** คนขอ ที่มา และเวลาที่ขอ ใต้ชื่อเพลง */
function SongMeta({ song, now }: { song: SongRequest; now: number }) {
  return (
    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted">
      <span className="truncate">
        {song.source === "filler" ? "เพลงสำรอง" : `ขอโดย ${song.byName}`}
      </span>
      {/* ใบจากแชทไลฟ์เป็นชื่อ TikTok จริงที่ตามไปตอบในไลฟ์ได้ ต่างจากชื่อที่พิมพ์เองในเว็บ */}
      {song.source === "tiktok" && <Badge>จากแชท TikTok</Badge>}
      {song.source === "streamer" && <Badge>คุณใส่เอง</Badge>}
      {now > 0 && song.source !== "filler" && <span>{timeAgo(song.createdAt, now)}</span>}
      {song.message && <span className="w-full truncate">ข้อความ: {song.message}</span>}
    </p>
  );
}

/**
 * เพลงที่เล่นแล้ว — พับไว้ และอ่านจากฐานข้อมูลเฉพาะตอนกางเท่านั้น
 * ล้างทั้งหมดได้ (ลบทีละก้อนจนหมด ไม่ใช่แค่ที่เห็นบนจอ)
 */
function History({
  channelId,
  queue,
  now,
  onPlay,
  working,
}: {
  channelId: string;
  queue: SongRequest[];
  now: number;
  onPlay: (song: SongRequest) => Promise<void>;
  working: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [list, setList] = useState<{ id: string; items: SongRequest[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    return watchRecentFinished(
      channelId,
      (items) => setList({ id: channelId, items }),
      40,
      () => setList({ id: channelId, items: NO_SONGS }),
    );
  }, [open, channelId]);

  const items = list?.id === channelId ? list.items : null;
  // เพลงที่เพิ่งกด "เล่นอีก" กลับเข้าคิวแล้ว ไม่ต้องโชว์ซ้ำในประวัติ
  const inQueue = new Set(queue.map((s) => s.id));

  return (
    <section aria-labelledby="history-title" className="border-t border-line pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 text-left"
      >
        <h2 id="history-title" className="text-title font-bold">
          เล่นแล้ว
        </h2>
        <IconChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {!items ? (
            <Skeleton className="h-16 w-full" />
          ) : items.length === 0 ? (
            <p className="text-muted">ยังไม่มีเพลงที่เล่นจบ</p>
          ) : (
            <>
              <p className="text-sm text-muted">40 เพลงล่าสุด</p>
              <ul className="rows mt-1">
                {items
                  .filter((s) => !inQueue.has(s.id))
                  .map((song) => (
                    <li key={song.id} className="flex items-center gap-3 py-3">
                      <Cover videoId={song.videoId} size="sm" className="w-16 opacity-80" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{song.title}</p>
                        <p className="truncate text-sm text-muted">
                          {song.status === "rejected" ? "ข้ามไป" : "เล่นจบ"}{" "}
                          {timeAgo(song.playedAt ?? song.createdAt, now)}
                          {song.source !== "filler" && `, ขอโดย ${song.byName}`}
                        </p>
                      </div>
                      <MiniBtn disabled={working === song.id} onClick={() => void onPlay(song)}>
                        เล่นอีก
                      </MiniBtn>
                    </li>
                  ))}
              </ul>
              <Button
                variant="danger"
                size="sm"
                loading={clearing}
                onClick={() => setAskClear(true)}
                className="mt-4"
              >
                ล้างประวัติทั้งหมด
              </Button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={askClear}
        title="ล้างประวัติเพลงทั้งหมด"
        description="ลบเพลงที่เล่นจบและที่ข้ามไปแล้วของช่องนี้ออกถาวร คิวที่รอเล่นอยู่ไม่หาย"
        confirmText="ล้างประวัติ"
        onClose={() => setAskClear(false)}
        onConfirm={() => {
          setClearing(true);
          void clearAllFinishedSongs(channelId)
            .then((n) => toast(`ล้างประวัติแล้ว ${n.toLocaleString("th-TH")} เพลง`, "success"))
            .catch(() => toast("ล้างไม่สำเร็จ ลองใหม่อีกครั้ง", "error"))
            .finally(() => setClearing(false));
        }}
      />
    </section>
  );
}
