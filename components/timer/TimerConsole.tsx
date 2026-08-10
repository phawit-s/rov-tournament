"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useNow } from "@/hooks/useClient";
import { authStore } from "@/lib/backend/firebase";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { uid } from "@/lib/random";
import { sfx } from "@/lib/sound";
import { pickWinnerIndex, segments, type WheelEntry } from "@/lib/wheel";
import {
  bumpTimer,
  pauseTimer,
  readTimer,
  recordSpin,
  saveSlices,
  setTimerEnabled,
  setTimerLabel,
  setTimerSeconds,
  startTimer,
} from "@/lib/timer/store";
import {
  SLICE_LIMIT,
  SPIN_SECONDS,
  clockText,
  deltaText,
  isRunning,
  remainingAt,
  type StreamTimer,
  type WheelSlice,
} from "@/lib/timer/types";
import Wheel from "@/components/wheel/Wheel";
import Button from "@/components/ui/Button";
import LinkRow from "@/components/ui/LinkRow";
import MiniBtn from "@/components/ui/MiniBtn";
import Panel from "@/components/ui/Panel";
import Reveal, { PageHeading } from "@/components/ui/Reveal";
import Switch from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { IconPause, IconPlay } from "@/components/ui/icons";
import { EmptyNote, Input } from "@/components/tournament/ui";

const POINTER_ANGLE = -Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** ปุ่มบวก/ลบด่วน (วินาที) — ค่าที่ใช้จริงตอนไลฟ์ ไม่ต้องพิมพ์เอง */
const QUICK = [-300, -60, 60, 300, 600];

/**
 * คอนโซลจับเวลาสดของสตรีมเมอร์
 *
 * หน้านี้อยู่บนจอที่สอง เปิดค้างไว้ตลอดไลฟ์ — ทุกปุ่มที่กดมีผลกับ widget
 * บนสตรีมทันที ไม่ต้องกดเผยแพร่หรือรีเฟรชอะไร
 *
 * นาฬิกาบนหน้านี้กับบน widget คำนวณจากค่าชุดเดียวกัน (เหลือกี่วิ + เริ่มเมื่อไหร่)
 * จึงตรงกันเสมอโดยไม่มีใครต้องส่งเวลาให้กันทุกวินาที
 */
export default function TimerConsole() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const channelId = user && !user.anonymous ? user.uid : null;

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
    return <EmptyNote>ต้องล็อกอินด้วยบัญชีเจ้าของช่องก่อน</EmptyNote>;
  }

  return (
    <div className="space-y-6">
      <PageHeading
        no="10"
        eyebrow="Live timer"
        title="จับเวลาสด"
        description="นาฬิกาถอยหลังบนสตรีม หมุนวงล้อแล้วเวลาบวก/ลบให้อัตโนมัติ"
      />
      {channel ? (
        <TimerBody channelId={channelId} channel={channel} />
      ) : (
        <EmptyNote>
          ยังไม่มีช่องบนคลาวด์ — ไปที่หน้า “ช่อง” แล้วกดเผยแพร่ช่องหนึ่งครั้งก่อน
        </EmptyNote>
      )}
    </div>
  );
}

function TimerBody({ channelId, channel }: { channelId: string; channel: Channel }) {
  const timer = readTimer(channel.timer);
  const running = isRunning(timer);

  /* นาฬิกาบนหน้านี้เดินเองทุก 250ms จากค่าที่โหลดมา ไม่ได้อ่านฐานข้อมูลซ้ำ
     (useNow ปัดค่าเป็นช่วงๆ ให้แล้ว จึงไม่ทำให้รีเรนเดอร์ไม่จบ) */
  const now = useNow(250);
  const left = remainingAt(timer, now);

  const [busy, setBusy] = useState(false);
  const [minutesText, setMinutesText] = useState("");

  const run = async (job: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await job();
      if (ok) toast(ok, "success", 1600);
    } catch (err) {
      toast(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";

  return (
    <>
      {/* ---------- นาฬิกา + ปุ่มคุม ---------- */}
      <Reveal>
        <Panel variant="feature" className="p-6 sm:p-7">
          <Panel.Header
            eyebrow="Clock"
            title="นาฬิกา"
            action={
              <Switch
                label="โชว์นาฬิกาบนสตรีม"
                checked={timer.enabled}
                onChange={(v) =>
                  void run(() => setTimerEnabled(channelId, v))
                }
              />
            }
          />

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <p
              className="fig num text-[clamp(3.2rem,11vw,6rem)] text-ice"
              style={
                left <= 60 && left > 0
                  ? { color: "rgb(var(--st-live))" }
                  : undefined
              }
            >
              {clockText(left)}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void run(() =>
                    running ? pauseTimer(channelId, timer) : startTimer(channelId, timer),
                  )
                }
                disabled={busy}
                aria-label={running ? "หยุดนาฬิกา" : "เดินนาฬิกา"}
                className="accent-fill grid h-14 w-14 shrink-0 cursor-pointer place-items-center rounded-full shadow-[0_12px_34px_-18px_rgb(var(--accent)/0.9)] transition-all duration-200 hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? (
                  <IconPause className="h-6 w-6" />
                ) : (
                  <IconPlay className="ml-0.5 h-6 w-6" />
                )}
              </button>

              <span className="slug slug-2">{running ? "กำลังเดิน" : "หยุดอยู่"}</span>
            </div>
          </div>

          {/* ปุ่มบวก/ลบด่วน */}
          <div className="mt-5 flex flex-wrap gap-2">
            {QUICK.map((d) => (
              <MiniBtn
                key={d}
                disabled={busy}
                onClick={() => void run(() => bumpTimer(channelId, timer, d))}
              >
                {deltaText(d)}
              </MiniBtn>
            ))}
          </div>

          <span className="rule my-5 block h-px" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-ice/85">ตั้งเวลาใหม่ (นาที)</p>
              <div className="flex gap-2">
                <Input
                  value={minutesText}
                  onChange={(e) => setMinutesText(e.target.value)}
                  placeholder="30"
                  inputMode="decimal"
                  className="min-w-0 flex-1"
                />
                <MiniBtn
                  disabled={busy || !minutesText.trim()}
                  className="px-4"
                  onClick={() => {
                    const mins = Number(minutesText.replace(/[^\d.]/g, ""));
                    if (!Number.isFinite(mins) || mins <= 0) {
                      toast("ใส่เป็นตัวเลขนาที เช่น 30", "error");
                      return;
                    }
                    void run(() => setTimerSeconds(channelId, mins * 60), "ตั้งเวลาแล้ว");
                    setMinutesText("");
                  }}
                >
                  ตั้ง
                </MiniBtn>
              </div>
              <p className="mt-2 text-xs text-muted">ตั้งแล้วนาฬิกาจะหยุดรอ กดเดินเอง</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ice/85">ป้ายเหนือนาฬิกา</p>
              <Input
                defaultValue={timer.label ?? ""}
                onBlur={(e) => void run(() => setTimerLabel(channelId, e.target.value))}
                placeholder="เหลืออีก"
                maxLength={40}
              />
              <p className="mt-2 text-xs text-muted">พิมพ์แล้วคลิกที่อื่นเพื่อบันทึก</p>
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* ---------- วงล้อ ---------- */}
      <Reveal index={1}>
        <SpinPanel channelId={channelId} timer={timer} busy={busy} />
      </Reveal>

      {/* ---------- แก้ช่องบนวงล้อ ---------- */}
      <Reveal index={2}>
        <SliceEditor channelId={channelId} timer={timer} />
      </Reveal>

      {/* ---------- ลิงก์สำหรับ OBS ---------- */}
      <Reveal index={3}>
        <Panel className="p-6">
          <Panel.Header
            eyebrow="Browser source"
            title="ลิงก์สำหรับ OBS"
            count={2}
          />
          <div className="space-y-2.5">
            <LinkRow
              kind="obs"
              label="นาฬิกา"
              size="520 × 260"
              url={`${origin}/widget/countdown/#ch=${channelId}`}
            />
            <LinkRow
              kind="obs"
              label="วงล้อสุ่มเวลา"
              size="420 × 480"
              url={`${origin}/widget/wheel/#ch=${channelId}`}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            แยกกันสอง source ตั้งใจ — วางนาฬิกาไว้มุมจอค้างทั้งไลฟ์ ส่วนวงล้อเปิด
            เฉพาะตอนจะหมุน แล้วปิดทิ้งไว้ ไม่ต้องมากินพื้นที่จอตลอดเวลา
          </p>
        </Panel>
      </Reveal>
    </>
  );
}

/* =========================================================================
   วงล้อ + ปุ่มหมุน
   ========================================================================= */

function SpinPanel({
  channelId,
  timer,
  busy,
}: {
  channelId: string;
  timer: StreamTimer;
  busy: boolean;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const slices = timer.slices;
  const entries: WheelEntry[] = slices.map((s) => ({
    id: s.id,
    name: s.label,
    weight: s.weight,
  }));

  const spin = useCallback(() => {
    if (spinning || slices.length < 2) return;
    sfx.unlock();
    setWinnerIndex(null);
    setSpinning(true);

    const index = pickWinnerIndex(entries, true);
    const segs = segments(entries, true);
    const seg = segs[index];
    const jitter = (Math.random() - 0.5) * (seg.end - seg.start) * 0.6;
    const turns = 5 + Math.floor(Math.random() * 3);

    let target = POINTER_ANGLE - (seg.mid + jitter);
    while (target < rotation + turns * TWO_PI) target += TWO_PI;

    const start = rotation;
    const distance = target - start;
    const duration = SPIN_SECONDS * 1000;
    const t0 = performance.now();

    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setRotation(start + distance * (1 - Math.pow(1 - p, 4.2)));
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      setSpinning(false);
      setWinnerIndex(index);
      sfx.play("reveal");
      /*
        เขียนผลลงคลาวด์ "ตอนหมุนจบ" ไม่ใช่ตอนเริ่มหมุน

        widget วงล้อบนสตรีมจะเริ่มหมุนตอนเห็นผลใหม่ ซึ่งแปลว่ามันหมุนช้ากว่า
        คอนโซลอยู่หนึ่งรอบเต็ม — ตั้งใจ เพราะคนดูควรเห็นวงล้อหมุนพร้อมกับที่
        สตรีมเมอร์ประกาศ ไม่ใช่รู้ผลไปแล้วก่อนวงล้อจะหยุด
      */
      void recordSpin(channelId, timer, slices[index]).catch(() =>
        toast("บันทึกผลหมุนไม่สำเร็จ", "error"),
      );
    };
    raf.current = requestAnimationFrame(step);
  }, [channelId, entries, rotation, slices, spinning, timer]);

  const last = timer.lastSpin;

  return (
    <Panel className="p-6">
      <Panel.Header
        eyebrow="Wheel"
        title="วงล้อสุ่มเวลา"
        count={slices.length}
        action={
          last ? (
            <span className="slug" style={{ color: "rgb(var(--accent))" }}>
              ล่าสุด {last.label}
            </span>
          ) : undefined
        }
      />

      {slices.length < 2 ? (
        <EmptyNote>ต้องมีอย่างน้อย 2 ช่องถึงจะหมุนได้</EmptyNote>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div className="mx-auto w-full max-w-md">
            <Wheel
              entries={entries}
              useWeights
              rotation={rotation}
              spinning={spinning}
              winnerIndex={winnerIndex}
              onFlick={() => spin()}
            />
          </div>

          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              loading={spinning}
              disabled={busy}
              onClick={spin}
            >
              หมุนวงล้อ
            </Button>
            <p className="text-xs leading-relaxed text-muted">
              หมุนจบแล้วเวลาบวก/ลบให้เองทันที และวงล้อบน widget จะหมุนตามให้คนดูเห็น
            </p>
            {last && (
              <div
                className="tally rounded-xl tile p-3.5"
                style={{ ["--st"]: "var(--st-win)" } as CSSProperties}
              >
                <p className="slug slug-2">ผลหมุนล่าสุด</p>
                <p className="mt-1 font-display text-lg text-ice">{last.label}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* =========================================================================
   แก้ช่องบนวงล้อ
   ========================================================================= */

function SliceEditor({
  channelId,
  timer,
}: {
  channelId: string;
  timer: StreamTimer;
}) {
  const slices = timer.slices;

  const save = (next: WheelSlice[]) =>
    saveSlices(channelId, next).catch(() => toast("บันทึกไม่สำเร็จ", "error"));

  const update = (id: string, patch: Partial<WheelSlice>) =>
    void save(slices.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <Panel className="p-6">
      <Panel.Header eyebrow="Slices" title="ช่องบนวงล้อ" count={slices.length} />

      <div className="space-y-2.5">
        {slices.map((s) => (
          <div
            key={s.id}
            className="grid gap-2 rounded-xl tile p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
          >
            <Input
              value={s.label}
              onChange={(e) => update(s.id, { label: e.target.value.slice(0, 24) })}
              placeholder="ป้ายบนวงล้อ"
            />
            <Input
              defaultValue={String(s.seconds / 60)}
              onBlur={(e) => {
                const mins = Number(e.target.value.replace(/[^\d.-]/g, ""));
                if (!Number.isFinite(mins)) return;
                update(s.id, { seconds: Math.round(mins * 60) });
              }}
              placeholder="นาที"
              inputMode="text"
              aria-label="นาทีที่บวก/ลบ (ติดลบได้)"
            />
            <Input
              defaultValue={String(s.weight)}
              onBlur={(e) => {
                const w = Number(e.target.value.replace(/[^\d]/g, ""));
                update(s.id, { weight: Math.max(1, Math.min(20, w || 1)) });
              }}
              placeholder="น้ำหนัก"
              inputMode="numeric"
              aria-label="น้ำหนัก 1-20"
            />
            <MiniBtn
              danger
              onClick={() => void save(slices.filter((x) => x.id !== s.id))}
            >
              ลบ
            </MiniBtn>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <MiniBtn
          disabled={slices.length >= SLICE_LIMIT}
          onClick={() =>
            void save([
              ...slices,
              { id: uid(), label: "+1 นาที", seconds: 60, weight: 1 },
            ])
          }
        >
          + เพิ่มช่อง
        </MiniBtn>
        <p className="text-xs text-muted">
          ช่องเวลา = นาที ใส่ติดลบได้ (เช่น <code>-2</code>) · น้ำหนัก 1–20
          ยิ่งมากยิ่งกินพื้นที่วงล้อและออกบ่อยขึ้น · สูงสุด {SLICE_LIMIT} ช่อง
        </p>
      </div>
    </Panel>
  );
}
