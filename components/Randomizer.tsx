"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { muteStore, sfx } from "@/lib/sound";
import { clearShareHash } from "@/lib/share";
import { useTournament } from "@/hooks/useTournament";
import BackgroundFX from "./fx/BackgroundFX";
import CursorGlow from "./fx/CursorGlow";
import SetupScreen from "./SetupScreen";
import DrawScreen from "./DrawScreen";
import ResultScreen from "./ResultScreen";

const STEPS = [
  { key: "setup", label: "รายชื่อ" },
  { key: "draw", label: "จับสลาก" },
  { key: "result", label: "ผลลัพธ์" },
] as const;

export default function Randomizer() {
  const t = useTournament();
  const muted = useSyncExternalStore(
    muteStore.subscribe,
    muteStore.getSnapshot,
    muteStore.getServerSnapshot,
  );

  const toggleMute = () => {
    muteStore.toggle();
    if (muted) sfx.play("click");
  };

  const phaseIndex = STEPS.findIndex((s) => s.key === t.state.phase);

  return (
    <>
      <BackgroundFX />
      <CursorGlow />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-375 flex-col gap-5 px-3 pt-[calc(1rem+var(--sat))] pb-[calc(2rem+var(--sab))] sm:px-5 lg:px-8">
        <header className="relative flex items-center justify-between gap-3">
          <span className="pointer-events-none absolute -top-2 right-0 left-0 h-px bg-linear-to-r from-transparent via-cyan/50 to-transparent" />

          <div className="flex min-w-0 items-center gap-3">
            <motion.div
              initial={{ rotate: -25, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              className="relative grid h-11 w-11 shrink-0 place-items-center"
            >
              <span className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-cyan/40" />
              <span className="hex-clip grid h-9 w-9 place-items-center bg-linear-to-br from-cyan via-violet to-magenta">
                <span className="font-display text-base font-bold text-[#06061a]">R</span>
              </span>
            </motion.div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base leading-none font-bold tracking-widest text-white sm:text-xl">
                <span className="shimmer-text">ROV TEAM RANDOMIZER</span>
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                <span className="inline-block h-1.5 w-1.5 animate-blink rounded-full bg-lime shadow-[0_0_8px_2px_rgba(163,230,53,0.7)]" />
                <span className="font-display tracking-[0.2em] text-lime/80">ONLINE</span>
                <span className="hidden text-muted/60 sm:inline">
                  · สุ่มทีมยุติธรรม ตรวจย้อนหลังได้ด้วย seed
                </span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <StepPills index={phaseIndex} />
            <IconButton
              onClick={toggleMute}
              label={muted ? "เปิดเสียง" : "ปิดเสียง"}
            >
              {muted ? "🔇" : "🔊"}
            </IconButton>
            <IconButton
              onClick={() => {
                if (!confirm("ล้างข้อมูลทั้งหมดและเริ่มใหม่?")) return;
                clearShareHash();
                t.dispatch({ type: "resetAll" });
              }}
              label="เริ่มใหม่ทั้งหมด"
            >
              ⟲
            </IconButton>
          </div>
        </header>

        <div className="flex-1">
          {!t.hydrated ? (
            <Splash />
          ) : (
            <AnimatePresence mode="wait">
              {t.state.phase === "setup" && <SetupScreen key="setup" t={t} />}
              {t.state.phase === "draw" && <DrawScreen key="draw" t={t} />}
              {t.state.phase === "result" && <ResultScreen key="result" t={t} />}
            </AnimatePresence>
          )}
        </div>

        <footer className="pt-2 text-center text-[11px] text-muted/70">
          ผลลัพธ์คำนวณจาก seed + รายชื่อ — ใส่ค่าเดิมได้ผลเดิมเสมอ ·{" "}
          <span className="text-muted">ทำงานในเครื่องล้วน ไม่มีการส่งข้อมูลออก</span>
        </footer>
      </main>
    </>
  );
}

function StepPills({ index }: { index: number }) {
  return (
    <div className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-black/30 p-1 sm:flex">
      {STEPS.map((step, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <div
            key={step.key}
            className={`relative rounded-xl px-3 py-1.5 font-display text-[11px] font-semibold transition-colors ${
              active ? "text-white" : done ? "text-cyan/70" : "text-muted"
            }`}
          >
            {active && (
              <motion.span
                layoutId="step-pill"
                className="absolute inset-0 rounded-xl bg-linear-to-r from-cyan/30 to-violet/30 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">
              {done ? "✓ " : `${i + 1}. `}
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/5 text-base transition-all hover:border-cyan/45 hover:bg-white/12 active:scale-90"
    >
      {children}
    </button>
  );
}

function Splash() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin-slow rounded-full border-2 border-cyan/30 border-t-cyan" />
        <p className="font-display text-sm tracking-[0.3em] text-muted">LOADING</p>
      </div>
    </div>
  );
}
