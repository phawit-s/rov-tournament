"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { burstAt } from "@/lib/confetti";
import { sfx } from "@/lib/sound";
import type { Player, TeamIdentity } from "@/lib/types";
import MagneticButton from "./ui/MagneticButton";
import Panel from "./ui/Panel";

type Props = {
  remaining: Player[];
  /** คนถัดไปตามลำดับที่ล็อกไว้ด้วย seed */
  next: Player | null;
  target: { identity: TeamIdentity; label: string; seat: number; isBench: boolean } | null;
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
  const [flash, setFlash] = useState(0);

  const stageRef = useRef<Stage>("idle");
  const timers = useRef<number[]>([]);
  const stageArea = useRef<HTMLDivElement | null>(null);
  const commitRef = useRef(onCommit);

  // เก็บ callback ล่าสุดไว้ให้ timer เรียก โดยไม่ต้องผูกกับ closure ตอนกดปุ่ม
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
        setFlash((n) => n + 1);
        sfx.play("reveal");
        const rect = stageArea.current?.getBoundingClientRect();
        if (rect) {
          burstAt(
            (rect.left + rect.width / 2) / window.innerWidth,
            (rect.top + rect.height / 2) / window.innerHeight,
          );
        }
      }, at + 70),
    );

    timers.current.push(
      window.setTimeout(() => {
        // อัปเดตพร้อมกันในเรนเดอร์เดียว การ์ดจะบินไปลงช่องในทีม (shared layout)
        commitRef.current();
        setWinner(null);
        setTicker("");
        setStageSafe("idle");
        if (remaining.length <= 1) setAuto(false);
      }, at + 70 + HOLD_MS),
    );
  }, [next, remaining]);

  // โหมดสุ่มต่อเนื่อง
  useEffect(() => {
    if (!auto || !next || stage !== "idle") return;
    const id = window.setTimeout(roll, 420);
    return () => window.clearTimeout(id);
  }, [auto, stage, next, roll]);

  // เว้นวรรค = สุ่ม
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        roll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roll]);

  const accent = target?.identity.rgb ?? "34 211 238";
  const busy = stage !== "idle";
  const finished = !next;

  return (
    <Panel accent={accent} tag="DRAW ENGINE" className="relative p-5 sm:p-6">
      {/* หัวข้อ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[11px] tracking-[0.28em] text-muted">
            รอบที่ {Math.min(round, total)} / {total}
          </p>
          <h2 className="font-display text-lg font-bold text-white">
            {finished ? "จับสลากครบแล้ว" : "กดปุ่มเพื่อจับสลาก"}
          </h2>
        </div>

        {target && !finished && (
          <motion.div
            key={`${target.label}-${target.seat}`}
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: `rgb(${accent} / 0.14)`,
              boxShadow: `inset 0 0 0 1px rgb(${accent} / 0.35)`,
            }}
          >
            <span className="text-lg">{target.identity.glyph}</span>
            <div className="leading-tight">
              <p className="text-[10px] text-muted">กำลังเติมเข้า</p>
              <p
                className="font-display text-sm font-bold"
                style={{ color: target.identity.hex }}
              >
                {target.label}
                {!target.isBench && (
                  <span className="ml-1 text-white/60">#{target.seat + 1}</span>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* จอแสดงผล */}
      <div
        ref={stageArea}
        className="relative grid h-44 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/45 sm:h-52"
      >
        {/* เส้นสแกนวิ่ง */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
          <div
            className="absolute inset-x-0 h-16 animate-scan blur-md"
            style={{
              background: `linear-gradient(180deg, transparent, rgb(${accent} / 0.22), transparent)`,
            }}
          />
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(70% 60% at 50% 50%, rgb(${accent} / 0.16), transparent 70%)`,
          }}
        />

        {/* เส้นเล็งแบบ HUD */}
        <div className="pointer-events-none absolute inset-3">
          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
            <span
              key={corner}
              className={`absolute h-3 w-3 ${
                corner === "tl"
                  ? "top-0 left-0 border-t-2 border-l-2"
                  : corner === "tr"
                    ? "top-0 right-0 border-t-2 border-r-2"
                    : corner === "bl"
                      ? "bottom-0 left-0 border-b-2 border-l-2"
                      : "right-0 bottom-0 border-r-2 border-b-2"
              }`}
              style={{ borderColor: `rgb(${accent} / 0.55)` }}
            />
          ))}
        </div>

        {/* ตัวเลขวิ่งพื้นหลังให้ดูเหมือนเครื่องกำลังคำนวณ */}
        {stage === "rolling" && (
          <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden opacity-15">
            <span className="animate-marquee font-display text-[10px] whitespace-nowrap text-cyan">
              {"01001100 SEEDING… 10110 SHUFFLE… 0110 PICKING… ".repeat(6)}
            </span>
          </div>
        )}

        {stage === "idle" && !winner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 px-4 text-center"
          >
            {finished ? (
              <p className="font-display text-2xl font-bold text-white sm:text-3xl">
                พร้อมดูผลลัพธ์แล้ว 🎉
              </p>
            ) : (
              <>
                <div className="mx-auto mb-2 grid h-14 w-14 place-items-center">
                  <span className="absolute h-14 w-14 animate-pulse-ring rounded-full border border-cyan/60" />
                  <span className="font-display text-3xl text-cyan">?</span>
                </div>
                <p className="text-sm text-muted">
                  เหลืออีก{" "}
                  <span className="font-display font-bold text-white">
                    {remaining.length}
                  </span>{" "}
                  คนที่ยังไม่ถูกจับ
                </p>
              </>
            )}
          </motion.div>
        )}

        {stage === "rolling" && (
          <div className="relative z-10 w-full px-4 text-center">
            <motion.p
              key={ticker}
              initial={{ y: 26, opacity: 0, filter: "blur(6px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0.5px)" }}
              exit={{ y: -26, opacity: 0 }}
              transition={{ duration: 0.09 }}
              className="truncate font-display text-3xl font-bold text-white/85 sm:text-4xl"
            >
              {ticker || "..."}
            </motion.p>
            <p className="mt-2 font-display text-[11px] tracking-[0.3em] text-cyan">
              RANDOMIZING
            </p>
          </div>
        )}

        {stage === "landed" && winner && (
          <div className="relative z-10 w-full px-4 text-center">
            <motion.div
              layoutId={`player-${winner.id}`}
              initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 16 }}
              className="mx-auto inline-flex max-w-full items-center gap-3 rounded-2xl px-5 py-3"
              style={{
                background: `linear-gradient(120deg, rgb(${accent} / 0.35), rgb(${accent} / 0.08))`,
                boxShadow: `0 0 0 1.5px rgb(${accent} / 0.6), 0 18px 60px -18px rgb(${accent} / 0.9)`,
              }}
            >
              <span className="text-2xl">{target?.identity.glyph}</span>
              <span className="holo-text truncate font-display text-2xl font-bold text-white sm:text-4xl">
                {winner.name}
              </span>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mt-3 font-display text-xs tracking-[0.25em]"
              style={{ color: target?.identity.hex }}
            >
              → {target?.label}
            </motion.p>
          </div>
        )}

        {/* แฟลชตอนออกผล */}
        <AnimatePresence>
          {stage === "landed" && (
            <motion.div
              key={flash}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="pointer-events-none absolute inset-0 bg-white"
            />
          )}
        </AnimatePresence>
      </div>

      {/* ปุ่มควบคุม */}
      <div className="mt-5 flex flex-col items-center gap-3">
        <div className="relative">
          {!busy && !finished && (
            <>
              <span
                className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-2xl"
                style={{ boxShadow: `0 0 0 2px rgb(${accent} / 0.5)` }}
              />
              <span
                className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-2xl"
                style={{
                  boxShadow: `0 0 0 2px rgb(${accent} / 0.35)`,
                  animationDelay: "1.1s",
                }}
              />
            </>
          )}
          <MagneticButton
            onClick={roll}
            disabled={busy || finished}
            strength={0.5}
            className="min-w-55 px-10 py-4 text-base sm:min-w-65 sm:text-lg"
          >
            {busy ? "กำลังสุ่ม..." : finished ? "ครบทุกคนแล้ว" : "🎲 สุ่มคนถัดไป"}
          </MagneticButton>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <SmallButton onClick={onUndo} disabled={!canUndo || busy}>
            ↩ ย้อนกลับ
          </SmallButton>
          <SmallButton
            onClick={() => setAuto((v) => !v)}
            disabled={finished}
            active={auto}
          >
            {auto ? "⏸ หยุดออโต้" : "⏩ สุ่มอัตโนมัติ"}
          </SmallButton>
          <SmallButton
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
            ⚡ ข้ามไปผลลัพธ์
          </SmallButton>
        </div>

        <p className="text-center text-[11px] text-muted">
          กด <kbd className="rounded bg-white/10 px-1.5 py-0.5">Space</kbd> เพื่อสุ่มเร็วๆ
        </p>
      </div>
    </Panel>
  );
}

function SmallButton({
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
      className={`cursor-pointer rounded-xl border px-3 py-2 font-display text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-cyan/60 bg-cyan/20 text-cyan shadow-[0_0_20px_-6px_rgba(34,211,238,0.9)]"
          : "border-white/12 bg-white/5 text-ice/80 hover:border-white/25 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
