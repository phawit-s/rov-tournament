"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Channel } from "@/lib/channel/types";
import {
  clearFinishedSongs,
  removeSongRequest,
  setSongStatus,
  splitQueue,
  watchSongQueue,
} from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG, type SongConfig, type SongRequest } from "@/lib/song/types";
import { thumbUrl, watchUrl } from "@/lib/song/youtube";
import { sfx } from "@/lib/sound";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { StatTile } from "../ui/hud";
import { IconCheck, IconChevronDown, IconCopy, IconExternal } from "../ui/icons";
import { ArtCalendar, EmptyState, Label, NumberInput, Textarea } from "../tournament/ui";

/** อ้างอิงคงที่ ไม่งั้นคิวว่างจะเป็นอาร์เรย์ใหม่ทุกเรนเดอร์แล้ววนไม่จบ */
const NO_SONGS: SongRequest[] = [];

/**
 * เวลาที่ขอ — โชว์วันด้วยเพราะคิวข้ามวันได้ถ้าสตรีมเมอร์ยังไม่ได้ล้าง
 * ไม่ใช้ Date.now ตอนเรนเดอร์ เลยไม่มีปัญหาค่าต่างกันระหว่างรีเรนเดอร์
 */
function timeText(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SongQueuePanel({
  channelId,
  channel,
  onConfigChange,
}: {
  channelId: string;
  channel: Channel;
  onConfigChange: (songs: SongConfig) => void;
}) {
  const reduced = useReducedMotion();

  /**
   * เก็บ channelId ของ snapshot ไว้คู่กับข้อมูล
   * ผู้ดูแลสลับช่องได้ ถ้าเก็บแต่ลิสต์เปล่าๆ คิวของช่องเดิมจะค้างให้กดผิดช่อง
   * (ล้างใน effect ไม่ได้ เพราะ setState ในตัว effect เป็นสิ่งต้องห้าม)
   */
  const [snap, setSnap] = useState<{ id: string; list: SongRequest[] }>({
    id: "",
    list: NO_SONGS,
  });
  const [working, setWorking] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    return watchSongQueue(
      channelId,
      (list) => setSnap({ id: channelId, list }),
      { onError: () => setSnap({ id: channelId, list: NO_SONGS }) },
    );
  }, [channelId]);

  const queue = snap.id === channelId ? snap.list : NO_SONGS;
  const { playing, queued, done } = splitQueue(queue);

  // ช่องเก่าไม่มีฟิลด์ songs = ยังไม่เคยตั้งค่า ให้เริ่มจากค่าเริ่มต้นที่ปิดอยู่
  const songs: SongConfig = channel.songs ?? DEFAULT_SONG_CONFIG;
  const patch = (next: Partial<SongConfig>) => onConfigChange({ ...songs, ...next });

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";
  const requestUrl = `${origin}/c/#h=${channel.handle || channelId}`;

  /** ทุกปุ่มในคิวเดินผ่านตัวนี้ จะได้มีสถานะกำลังทำงานและ toast แบบเดียวกันหมด */
  const run = async (id: string, job: () => Promise<void>, ok: string) => {
    setWorking(id);
    try {
      await job();
      toast(ok, "success", 1800);
    } catch (err) {
      toast(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    } finally {
      setWorking(null);
    }
  };

  const play = (song: SongRequest) =>
    run(
      song.id,
      // ส่งคิวไปด้วย เพื่อให้เพลงที่ค้างเล่นอยู่ถูกปิดในทีเดียว
      () => setSongStatus(channelId, song.id, "playing", queue),
      `กำลังเล่น ${song.title}`,
    );

  const finish = (song: SongRequest) =>
    run(song.id, () => setSongStatus(channelId, song.id, "played"), "จบเพลงแล้ว");

  const skip = (song: SongRequest) =>
    run(song.id, () => setSongStatus(channelId, song.id, "rejected"), "ข้ามเพลงนี้แล้ว");

  const drop = (song: SongRequest) =>
    run(song.id, () => removeSongRequest(channelId, song.id), "ลบออกจากคิวแล้ว");

  const total = queue.length;

  return (
    <div className="space-y-6">
      {/* ---------- ตั้งค่า ---------- */}
      <Panel className="p-6">
        <Panel.Header
          eyebrow="Song request"
          title="ระบบขอเพลง"
          action={
            <Switch
              label="เปิดรับคำขอเพลง"
              checked={songs.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint="0 = ไม่จำกัด นับเฉพาะเพลงที่ยังค้างอยู่ในคิว">
              ขอได้กี่เพลงต่อคน
            </Label>
            <NumberInput
              value={songs.maxPerUser ?? 0}
              onChange={(maxPerUser) => patch({ maxPerUser })}
              max={99}
              placeholder="ไม่จำกัด"
            />
          </div>
          <div>
            <Label hint="0 = ไม่จำกัด คิวเต็มแล้วหน้าขอเพลงจะปิดรับชั่วคราว">
              คิวยาวสุดกี่เพลง
            </Label>
            <NumberInput
              value={songs.maxQueue ?? 0}
              onChange={(maxQueue) => patch({ maxQueue })}
              max={999}
              placeholder="ไม่จำกัด"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl tile p-4">
          <div className="min-w-0">
            <p className="text-sm text-ice/85">ยอมให้ขอเพลงซ้ำ</p>
            <p className="mt-0.5 text-xs text-muted">
              ปิดไว้ = เพลงที่มีอยู่ในคิวแล้วจะขอซ้ำไม่ได้ จนกว่าจะเล่นจบ
            </p>
          </div>
          <Switch
            label="ยอมให้ขอเพลงซ้ำในคิว"
            checked={!!songs.allowDuplicates}
            onChange={(v) => patch({ allowDuplicates: v })}
          />
        </div>

        <div className="mt-4">
          <Label hint="ขึ้นบนหน้าขอเพลง ใช้บอกกติกา เช่น ห้ามเพลงยาวเกิน 5 นาที">
            ข้อความบอกกติกา
          </Label>
          <Textarea
            rows={2}
            value={songs.note ?? ""}
            onChange={(e) => patch({ note: e.target.value.slice(0, 200) })}
            placeholder="วางลิงก์ YouTube ได้เลย เพลงจะเข้าคิวรอสตรีมเมอร์เปิด"
          />
        </div>

        {/* ลิงก์ที่เอาไปแปะให้คนดู — ใช้ handle ก่อนเพราะจำง่ายกว่า uid */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl tile p-3.5">
          <div className="min-w-0 flex-1">
            <span className="slug">หน้าขอเพลง</span>
            <code className="mt-1.5 block truncate text-xs text-ice/75">
              {requestUrl}
            </code>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <MiniBtn
              onClick={() => {
                void navigator.clipboard.writeText(requestUrl);
                setCopied(true);
                toast("คัดลอกลิงก์แล้ว", "success", 1600);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                {copied ? (
                  <IconCheck className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <IconCopy className="h-3 w-3" />
                )}
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </span>
            </MiniBtn>
            <a
              href={requestUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hair px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
            >
              <IconExternal className="h-3 w-3" />
              เปิด
            </a>
          </div>
        </div>

        {!songs.enabled && (
          <p className="mt-3 text-xs text-muted">
            ตอนนี้ปิดรับอยู่ — คนดูยังเปิดหน้านี้ได้แต่ส่งลิงก์เข้ามาไม่ได้
            เปิดสวิตช์แล้วอย่าลืมกด &ldquo;เผยแพร่ช่อง&rdquo; ค่าถึงจะขึ้นคลาวด์
          </p>
        )}
      </Panel>

      {/* ---------- คิว ---------- */}
      <Panel className="p-6">
        <Panel.Header
          eyebrow="Queue"
          title="คิวเพลง"
          count={total || null}
          action={
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button
                size="sm"
                disabled={queued.length === 0 || working !== null}
                onClick={() => queued[0] && void play(queued[0])}
              >
                เล่นเพลงถัดไป
              </Button>
              {done.length > 0 && (
                <MiniBtn onClick={() => setAskClear(true)}>ล้างที่เล่นจบแล้ว</MiniBtn>
              )}
            </div>
          }
        />

        <div className="mb-5 grid grid-cols-3 gap-4 rounded-xl tile p-4">
          <StatTile label="กำลังเล่น" value={playing ? 1 : 0} />
          <StatTile
            label="รอคิว"
            value={queued.length}
            ratio={songs.maxQueue ? queued.length / songs.maxQueue : undefined}
          />
          <StatTile label="เล่นแล้ว" value={done.length} />
        </div>

        {/* เพลงที่กำลังเล่น — การ์ดใหญ่ ให้เห็นชัดจากมุมตาตอนไลฟ์ */}
        <AnimatePresence initial={false} mode="popLayout">
          {playing && (
            <motion.div
              key={playing.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              style={{ ["--st"]: "var(--st-live)" } as CSSProperties}
              className="tally mb-5 flex flex-col gap-4 overflow-hidden rounded-xl tile p-4 sm:flex-row"
            >
              <Cover videoId={playing.videoId} className="w-full sm:w-44" />

              <div className="min-w-0 flex-1">
                <span
                  className="slug"
                  style={{ color: "rgb(var(--st-live))" }}
                >
                  กำลังเล่น
                </span>
                <p className="mt-1 font-display text-base text-ice">{playing.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{playing.author}</p>
                <p className="mt-2 text-xs text-ice/70">
                  ขอโดย <span className="text-champagne">{playing.byName}</span>
                  <span className="num ml-2 text-muted/80">
                    {timeText(playing.createdAt)}
                  </span>
                </p>
                {playing.message && (
                  <p className="mt-1.5 text-xs text-muted">“{playing.message}”</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    loading={working === playing.id}
                    icon={<IconCheck className="h-3.5 w-3.5" strokeWidth={2} />}
                    onClick={() => void finish(playing)}
                  >
                    เล่นจบแล้ว
                  </Button>
                  <YoutubeLink videoId={playing.videoId} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {total === 0 ? (
          <EmptyState
            no="06"
            art={<ArtCalendar />}
            title="ยังไม่มีใครขอเพลง"
            description="แชร์ลิงก์หน้าขอเพลงด้านบนให้คนดู พอมีคนวางลิงก์ YouTube เข้ามา เพลงจะต่อคิวตรงนี้"
          />
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {queued.map((song, index) => (
                <motion.li
                  key={song.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  style={{ ["--st"]: "var(--st-next)" } as CSSProperties}
                  className="tally flex flex-wrap items-center gap-3 overflow-hidden rounded-xl tile p-3 sm:flex-nowrap"
                >
                  <span className="num w-6 shrink-0 text-center font-display text-sm text-muted">
                    {index + 1}
                  </span>

                  <Cover videoId={song.videoId} className="w-20 shrink-0" />

                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm text-ice">{song.title}</p>
                    <p className="truncate text-xs text-muted">{song.author}</p>
                    <p className="mt-0.5 truncate text-xs text-ice/65">
                      {song.byName}
                      <span className="num ml-2 text-muted/80">
                        {timeText(song.createdAt)}
                      </span>
                    </p>
                    {song.message && (
                      <p className="mt-0.5 truncate text-xs text-muted">
                        “{song.message}”
                      </p>
                    )}
                  </div>

                  <div className="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-auto">
                    <Button
                      size="sm"
                      loading={working === song.id}
                      onClick={() => void play(song)}
                    >
                      เล่น
                    </Button>
                    <MiniBtn
                      disabled={working === song.id}
                      onClick={() => void skip(song)}
                    >
                      ข้าม
                    </MiniBtn>
                    <MiniBtn
                      danger
                      disabled={working === song.id}
                      onClick={() => void drop(song)}
                    >
                      ลบ
                    </MiniBtn>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {queued.length === 0 && total > 0 && (
          <p className="text-sm text-muted">
            คิวหมดแล้ว รอคนดูขอเพลงเพิ่ม
          </p>
        )}

        {/* เล่นจบ/ข้ามแล้ว — ยุบไว้ ไม่ให้มาแย่งพื้นที่คิวที่ต้องกดจริง */}
        {done.length > 0 && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-1 text-left"
            >
              <span className="slug slug-2">เล่นจบ / ข้ามแล้ว</span>
              <span className="num text-xs text-muted">{done.length}</span>
              <span className="rule h-px flex-1" />
              <IconChevronDown
                className={`h-4 w-4 text-muted transition-transform duration-300 ${
                  showDone ? "rotate-180" : ""
                }`}
              />
            </button>

            {showDone && (
              <ul className="mt-2.5 space-y-2">
                {done.map((song) => (
                  <li
                    key={song.id}
                    className="state-out flex flex-wrap items-center gap-3 rounded-xl tile p-3"
                  >
                    <Cover videoId={song.videoId} className="w-14 shrink-0" />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm text-ice/80">{song.title}</p>
                      <p className="truncate text-xs text-muted">
                        {song.byName}
                        <span className="num ml-2 text-muted/80">
                          {song.status === "rejected"
                            ? "ข้าม"
                            : timeText(song.playedAt ?? song.createdAt)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <MiniBtn
                        disabled={working === song.id}
                        onClick={() => void play(song)}
                      >
                        เล่นอีก
                      </MiniBtn>
                      <MiniBtn
                        danger
                        disabled={working === song.id}
                        onClick={() => void drop(song)}
                      >
                        ลบ
                      </MiniBtn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={askClear}
        title="ล้างเพลงที่เล่นจบแล้ว"
        description={`จะลบ ${done.length} เพลงที่เล่นจบและที่ข้ามไปแล้วออกถาวร คิวที่ยังรออยู่ไม่หาย`}
        confirmText="ล้างทิ้ง"
        onClose={() => setAskClear(false)}
        onConfirm={() => {
          void clearFinishedSongs(channelId, queue)
            .then(() => toast("ล้างประวัติเพลงแล้ว", "success", 1800))
            .catch(() => toast("ล้างไม่สำเร็จ", "error"));
        }}
      />
    </div>
  );
}

/**
 * รูปปกคลิป — สร้างจาก videoId ไม่ใช้ url ที่เก็บไว้
 * ข้อมูลมาจากคนดู ถ้าเชื่อค่าดิบก็เท่ากับให้คนอื่นเลือก src ให้หน้าเรา
 */
function Cover({ videoId, className = "" }: { videoId: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(videoId)}
      alt=""
      loading="lazy"
      className={`aspect-video rounded-lg object-cover ${className}`}
    />
  );
}

function YoutubeLink({ videoId }: { videoId: string }) {
  return (
    <a
      href={watchUrl(videoId)}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hair px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
    >
      <IconExternal className="h-3 w-3" />
      เปิดใน YouTube
    </a>
  );
}

function MiniBtn({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-9 shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-[#e79a9a]/25 text-[#e79a9a]/90 hover:bg-[#e79a9a]/10"
          : "border-hair text-muted hover:text-champagne"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * สวิตช์ที่บอกสถานะเป็นตัวหนังสือในราง — สีอย่างเดียวอ่านยากบนธีมสว่าง
 * ทรงเดียวกับสวิตช์อื่นในหน้าตั้งค่าช่อง กล่องคลิกสูง 44px ตามขนาดนิ้วขั้นต่ำ
 */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      onClick={() => {
        sfx.unlock();
        sfx.play("click");
        onChange(!checked);
      }}
      className="relative grid h-11 w-21 shrink-0 cursor-pointer place-items-center"
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={`relative block h-7 w-full rounded-full transition-colors duration-300 ${
          checked ? "bg-[linear-gradient(90deg,#bd9350,#f0d8ab)]" : "rule"
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-y-0 flex items-center font-display text-eyebrow tracking-luxe ${
            checked ? "left-3 text-[#1b1509]" : "right-3 text-muted"
          }`}
        >
          {checked ? "เปิด" : "ปิด"}
        </span>
        <motion.span
          layout={!reduced}
          transition={
            reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }
          }
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 60 : 4 }}
        />
      </span>
    </button>
  );
}
