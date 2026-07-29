"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { sfx } from "@/lib/sound";
import type { Player, TeamIdentity } from "@/lib/types";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import Corners from "./ui/Corners";
import Crest from "./team/Crest";

type Props = {
  remaining: Player[];
  /** คนถัดไปตามลำดับที่ล็อกไว้ด้วย seed */
  next: Player | null;
  target: {
    identity: TeamIdentity;
    label: string;
    seat: number;
    isBench: boolean;
  } | null;
  round: number;
  total: number;
  canUndo: boolean;
  onCommit: () => void;
  onUndo: () => void;
  onRevealAll: () => void;
};

type Stage = "idle" | "rolling" | "landed";

/** สถานะรีลแนวตั้ง: 4 บรรทัดกำลังไหลขึ้นทีละบรรทัด */
type Reel = {
  lines: string[];
  tick: number;
  /** ระยะห่างของติ๊กปัจจุบัน (ms) — ใช้คำนวณทั้งความเร็วและความเบลอ */
  interval: number;
  /** สามติ๊กสุดท้ายก่อนหยุด */
  near: boolean;
};

const ROLL_MS = 1450;
const HOLD_MS = 1000;
/** ความสูงหนึ่งบรรทัดของรีล ต้องตรงกับคลาส h-11 ด้านล่าง */
const LINE = 44;

const EMPTY_REEL: Reel = { lines: ["", "", "", ""], tick: 0, interval: 40, near: false };

export default function DrawMachine({
  remaining,
  next,
  target,
  round,
  total,
  canUndo,
  onCommit,
  onUndo,
  onRevealAll,
}: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [reel, setReel] = useState<Reel>(EMPTY_REEL);
  const [winner, setWinner] = useState<Player | null>(null);
  const [auto, setAuto] = useState(false);

  const stageRef = useRef<Stage>("idle");
  const timers = useRef<number[]>([]);
  const commitRef = useRef(onCommit);
  const reduced = useReducedMotion();

  useEffect(() => {
    commitRef.current = onCommit;
  });

  const setStageSafe = (value: Stage) => {
    stageRef.current = value;
    setStage(value);
  };

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const roll = useCallback(() => {
    if (stageRef.current !== "idle" || !next) return;
    sfx.unlock();
    setStageSafe("rolling");

    const pool = remaining.map((p) => p.name);
    const pick = () => pool[Math.floor(Math.random() * pool.length)] ?? "";

    // ตารางติ๊ก: เริ่มถี่แล้วค่อยๆ ห่างออก ความเบลอกับความเร็วรีลผูกกับค่านี้ทั้งคู่
    const ticks: { delay: number; interval: number }[] = [];
    let at = 0;
    let interval = 40;
    while (at < ROLL_MS) {
      ticks.push({ delay: at, interval });
      at += interval;
      interval *= 1.085;
    }

    setReel({
      lines: [pick(), pick(), pick(), pick()],
      tick: 0,
      interval: 40,
      near: false,
    });

    ticks.forEach((t, index) => {
      timers.current.push(
        window.setTimeout(() => {
          setReel((prev) => ({
            lines: [...prev.lines.slice(1), pick()],
            tick: prev.tick + 1,
            interval: t.interval,
            near: index >= ticks.length - 3,
          }));
          if (index % 2 === 0) sfx.play("tick");
        }, t.delay),
      );
    });

    timers.current.push(
      window.setTimeout(() => {
        setWinner(next);
        setStageSafe("landed");
        sfx.play("reveal");
      }, at + 70),
    );

    timers.current.push(
      window.setTimeout(() => {
        // อัปเดตพร้อมกันในเรนเดอร์เดียว การ์ดจะเลื่อนไปลงช่องในทีม (shared layout)
        commitRef.current();
        setWinner(null);
        setReel(EMPTY_REEL);
        setStageSafe("idle");
        if (remaining.length <= 1) setAuto(false);
      }, at + 70 + HOLD_MS),
    );
  }, [next, remaining]);

  useEffect(() => {
    if (!auto || !next || stage !== "idle") return;
    const id = window.setTimeout(roll, 420);
    return () => window.clearTimeout(id);
  }, [auto, stage, next, roll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        roll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roll]);

  const accent = target?.identity.rgb ?? "207 167 101";
  const busy = stage !== "idle";
  const finished = !next;
  const blur = reduced ? 0 : Math.min(6, (40 / reel.interval) * 3);

  return (
    <Panel accent={accent} variant="feature" tag="Draw" className="p-6">
      <div className="mb-5">
        <p className="slug">
          Round {Math.min(round, total)} / {total}
        </p>
        <h2 className="mt-1.5 font-display text-xl font-medium text-ice">
          {finished ? "จับสลากครบแล้ว" : "กดปุ่มเพื่อจับสลาก"}
        </h2>

        {target && !finished && (
          <motion.p
            key={`${target.label}-${target.seat}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-sm text-muted"
          >
            คนถัดไปจะเข้า{" "}
            <span style={{ color: target.identity.hex }}>{target.label}</span>
            {!target.isBench && (
              <span className="num text-muted"> ตำแหน่งที่ {target.seat + 1}</span>
            )}
          </motion.p>
        )}
      </div>

      {/* จอแสดงผลของตู้จับสลาก — ซ้อนชั้นให้รู้สึกเป็นจอจริง ไม่ใช่กล่องเปล่า */}
      <div
        className="relative grid h-56 place-items-center overflow-hidden sunken rounded-xl sm:h-64 lg:h-72"
        style={{
          ["--st" as string]: stage === "idle" ? "var(--st-next)" : accent,
          boxShadow:
            "inset 0 2px 26px rgb(0 0 0 / 0.6), inset 0 0 0 1px rgb(var(--hair) / var(--hair-a))",
        }}
      >
        <span className="grain pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-overlay" />
        <span className="scanlines absolute inset-0" />
        <Corners len={18} o={0.5} />

        <span
          className="slug engrave pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 opacity-20"
          style={{ writingMode: "vertical-rl" }}
          aria-hidden
        >
          Draw
        </span>

        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            background: `radial-gradient(65% 60% at 50% 50%, rgb(${accent} / ${stage === "landed" ? 0.16 : 0.06}), transparent 72%)`,
          }}
        />

        {stage === "idle" && !winner && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative px-5 text-center"
          >
            {finished || !target ? (
              <>
                <p className="slug">Ready</p>
                <p className="mt-2.5 font-display text-xl font-medium text-champagne">
                  พร้อมดูผลลัพธ์แล้ว
                </p>
              </>
            ) : (
              <>
                <p className="slug">On Deck</p>
                <div className="mt-3.5 flex items-center justify-center gap-4">
                  <Crest identity={target.identity} size={64} showShort />
                  <div className="min-w-0 text-left">
                    <p
                      className="truncate font-display text-xl font-medium tracking-wide"
                      style={{ color: target.identity.hex }}
                    >
                      {target.label}
                    </p>
                    <p className="num mt-1 text-xs text-muted">
                      {target.isBench
                        ? `ที่นั่งสำรองที่ ${target.seat + 1}`
                        : `ตำแหน่งที่ ${target.seat + 1}`}
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {stage === "rolling" && (
          <div className="relative w-full">
            {/* เส้นพาดกลาง = ช่องที่ชื่อจะหยุด */}
            <span
              className="pointer-events-none absolute inset-x-6 top-11 z-10 h-px"
              style={{
                background: `linear-gradient(90deg,transparent,rgb(${accent} / 0.45),transparent)`,
              }}
            />
            <span
              className="pointer-events-none absolute inset-x-6 top-22 z-10 h-px"
              style={{
                background: `linear-gradient(90deg,transparent,rgb(${accent} / 0.45),transparent)`,
              }}
            />

            <motion.div
              className="h-33 overflow-hidden mask-[linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)]"
              animate={{ scale: reel.near ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              <motion.div
                key={reel.tick}
                initial={{ y: 0 }}
                animate={{ y: reduced ? 0 : -LINE }}
                transition={{ duration: reel.interval / 1000, ease: "linear" }}
                style={{ filter: blur ? `blur(${blur}px)` : undefined }}
              >
                {reel.lines.map((name, i) => (
                  <div
                    key={i}
                    className="flex h-11 items-center justify-center px-6"
                  >
                    <span className="truncate font-display text-2xl font-light text-ice/85 sm:text-3xl">
                      {name || "…"}
                    </span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* เส้นสแกนทองวิ่งผ่านหนึ่งรอบต่อการสุ่มหนึ่งครั้ง */}
            {!reduced && (
              <motion.span
                className="pointer-events-none absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,rgb(var(--st-next)/0.75),transparent)]"
                initial={{ top: "0%" }}
                animate={{ top: "100%" }}
                transition={{ duration: ROLL_MS / 1000, ease: "easeInOut" }}
              />
            )}
          </div>
        )}

        {stage === "landed" && winner && (
          <div className="relative w-full px-5 text-center">
            <motion.div
              layoutId={`player-${winner.id}`}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="mx-auto inline-flex max-w-full items-center gap-3 rounded-xl border px-6 py-3"
              style={{
                borderColor: `rgb(${accent} / 0.45)`,
                background: `rgb(${accent} / 0.10)`,
                boxShadow: `0 18px 50px -24px rgb(${accent} / 0.9)`,
              }}
            >
              {target && <Crest identity={target.identity} size={28} />}
              <span className="truncate font-display text-2xl font-medium text-ice sm:text-3xl">
                {winner.name}
              </span>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.16 }}
              className="mt-3.5 font-display text-xs tracking-[0.2em]"
              style={{ color: target?.identity.hex }}
            >
              {target?.label}
            </motion.p>
          </div>
        )}

        {/* ตัวนับคนที่ยังไม่ถูกจับ ย้ายมาเป็นข้อมูลมุมจอ ไม่ใช่พระเอกกลางจออีกต่อไป */}
        <span className="num pointer-events-none absolute right-3.5 bottom-2.5 font-display text-[11px] text-muted">
          เหลือ {remaining.length}
        </span>

        {/* วงแหวนทองขยายออกตอนออกผล */}
        <AnimatePresence>
          {stage === "landed" && (
            <>
              <motion.span
                key="ring"
                className="pointer-events-none absolute h-28 w-28 rounded-full border"
                style={{ borderColor: `rgb(${accent} / 0.55)` }}
                initial={{ scale: 0.35, opacity: 0.9 }}
                animate={{ scale: 3.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
              <motion.div
                key="wash"
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(closest-side, rgb(${accent} / 0.35), transparent 70%)`,
                }}
                initial={{ opacity: 0.55 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ปุ่มควบคุม */}
      <div className="mt-6 space-y-3.5">
        <Button
          onClick={roll}
          disabled={finished}
          loading={busy}
          size="lg"
          className="w-full py-4"
        >
          {finished ? "ครบทุกคนแล้ว" : "สุ่มคนถัดไป"}
        </Button>

        <div className="flex items-center justify-center gap-1">
          <TextButton onClick={onUndo} disabled={!canUndo || busy}>
            ย้อนกลับ
          </TextButton>
          <Dot />
          <TextButton onClick={() => setAuto((v) => !v)} disabled={finished} active={auto}>
            {auto ? "หยุดออโต้" : "สุ่มอัตโนมัติ"}
          </TextButton>
          <Dot />
          <TextButton
            onClick={() => {
              clearTimers();
              setAuto(false);
              setWinner(null);
              setReel(EMPTY_REEL);
              setStageSafe("idle");
              onRevealAll();
            }}
            disabled={finished}
          >
            ข้ามไปผลลัพธ์
          </TextButton>
        </div>

        <p className="text-center text-xs text-muted">
          กด <kbd className="rounded tile px-1.5 py-0.5 text-[11px]">Space</kbd>{" "}
          เพื่อสุ่มเร็วๆ
        </p>
      </div>
    </Panel>
  );
}

function Dot() {
  return <span className="text-xs text-ice/15">·</span>;
}

function TextButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.play("click");
        onClick();
      }}
      disabled={disabled}
      className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "text-champagne" : "text-muted hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}
