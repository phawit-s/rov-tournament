"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { sfx } from "@/lib/sound";
import type { Player, TeamIdentity } from "@/lib/types";
import Button from "./ui/Button";
import Panel from "./ui/Panel";

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

const ROLL_MS = 1450;
const HOLD_MS = 1000;

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
  const [ticker, setTicker] = useState("");
  const [winner, setWinner] = useState<Player | null>(null);
  const [auto, setAuto] = useState(false);

  const stageRef = useRef<Stage>("idle");
  const timers = useRef<number[]>([]);
  const stageArea = useRef<HTMLDivElement | null>(null);
  const commitRef = useRef(onCommit);

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
    let at = 0;
    let interval = 40;
    let i = 0;

    while (at < ROLL_MS) {
      const delay = at;
      const index = i;
      timers.current.push(
        window.setTimeout(() => {
          setTicker(pool[Math.floor(Math.random() * pool.length)] ?? "");
          if (index % 2 === 0) sfx.play("tick");
        }, delay),
      );
      at += interval;
      interval *= 1.085;
      i++;
    }

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
        setTicker("");
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

  return (
    <Panel accent={accent} tag="Draw" className="p-6">
      <div className="mb-5">
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
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
            <span style={{ color: target.identity.hex }}>
              {target.identity.glyph} {target.label}
            </span>
            {!target.isBench && (
              <span className="text-muted"> ตำแหน่งที่ {target.seat + 1}</span>
            )}
          </motion.p>
        )}
      </div>

      {/* จอแสดงผล */}
      <div
        ref={stageArea}
        className="relative grid h-44 place-items-center overflow-hidden sunken rounded-xl sm:h-48"
      >
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            background: `radial-gradient(65% 60% at 50% 50%, rgb(${accent} / ${stage === "landed" ? 0.16 : 0.06}), transparent 72%)`,
          }}
        />

        {stage === "idle" && !winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative px-5 text-center"
          >
            {finished ? (
              <p className="font-display text-xl font-medium text-champagne">
                พร้อมดูผลลัพธ์แล้ว
              </p>
            ) : (
              <>
                <p className="font-display text-4xl font-extralight text-ice/25">
                  {remaining.length}
                </p>
                <p className="mt-2 text-sm text-muted">คนที่ยังไม่ถูกจับ</p>
              </>
            )}
          </motion.div>
        )}

        {stage === "rolling" && (
          <div className="relative w-full px-5 text-center">
            <motion.p
              key={ticker}
              initial={{ y: 18, opacity: 0, filter: "blur(5px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.1 }}
              className="truncate font-display text-3xl font-light text-ice/80"
            >
              {ticker || "…"}
            </motion.p>
            <p className="mt-3 font-display text-[10px] tracking-luxe text-champagne/60 uppercase">
              Drawing
            </p>
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
              <span
                className="text-sm"
                style={{ color: target?.identity.hex }}
              >
                {target?.identity.glyph}
              </span>
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
          disabled={busy || finished}
          className="w-full py-4 text-base"
        >
          {busy ? "กำลังสุ่ม…" : finished ? "ครบทุกคนแล้ว" : "สุ่มคนถัดไป"}
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
              setTicker("");
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
