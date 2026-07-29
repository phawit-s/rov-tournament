"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clearShareHash } from "@/lib/share";
import { useTournament } from "@/hooks/useTournament";
import SetupScreen from "./SetupScreen";
import DrawScreen from "./DrawScreen";
import ResultScreen from "./ResultScreen";
import ConfirmDialog from "./ui/ConfirmDialog";
import { Skeleton } from "./tournament/ui";
import { IconCheck } from "./ui/icons";

const STEPS = [
  { key: "setup", label: "รายชื่อ" },
  { key: "draw", label: "จับสลาก" },
  { key: "result", label: "ผลลัพธ์" },
] as const;

/** เครื่องมือสุ่มแบ่งทีมแบบเร็วๆ ไม่ผูกกับทัวร์นาเมนต์ */
export default function Randomizer() {
  const t = useTournament();
  const [askReset, setAskReset] = useState(false);
  const phaseIndex = STEPS.findIndex((s) => s.key === t.state.phase);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <StepRail index={phaseIndex} />
        <button
          type="button"
          onClick={() => setAskReset(true)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-ice"
        >
          ↺ เริ่มใหม่
        </button>
      </div>

      {!t.hydrated ? (
        <Splash />
      ) : (
        <AnimatePresence mode="wait">
          {t.state.phase === "setup" && <SetupScreen key="setup" t={t} />}
          {t.state.phase === "draw" && <DrawScreen key="draw" t={t} />}
          {t.state.phase === "result" && <ResultScreen key="result" t={t} />}
        </AnimatePresence>
      )}

      <ConfirmDialog
        open={askReset}
        title="ล้างรายชื่อและเริ่มใหม่?"
        description="รายชื่อทั้งหมดกับ seed ปัจจุบันจะถูกลบออกจากเครื่องนี้ ย้อนกลับไม่ได้"
        confirmText="ล้างทั้งหมด"
        tone="danger"
        onConfirm={() => {
          clearShareHash();
          t.dispatch({ type: "resetAll" });
        }}
        onClose={() => setAskReset(false)}
      />
    </div>
  );
}

function StepRail({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      {STEPS.map((step, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <div key={step.key} className="flex items-center gap-2.5 sm:gap-3">
            {i > 0 && (
              <span
                className={`h-px w-5 transition-colors duration-500 sm:w-6 ${
                  done || active ? "bg-champagne/45" : "rule"
                }`}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {done ? (
                <IconCheck className="h-3 w-3 text-champagne/55" strokeWidth={2} />
              ) : (
                <span
                  className={`num font-display text-[11px] ${
                    active ? "text-champagne" : "text-muted/70"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
              <span
                className={`font-display text-xs tracking-[0.14em] transition-colors duration-300 ${
                  active
                    ? "text-champagne"
                    : done
                      ? "text-champagne/55"
                      : "text-muted/70"
                }`}
              >
                {step.label}
              </span>
              {active && (
                <motion.span
                  layoutId="phase-underline"
                  className="absolute -bottom-1.5 left-0 h-px w-full bg-[linear-gradient(90deg,rgb(var(--accent)/0.85),transparent)]"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** โครงจางของหน้าปลายทาง ดีกว่าวงกลมหมุนเปล่าๆ เพราะเห็นรูปร่างที่กำลังจะมา */
function Splash() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      {[0, 1].map((col) => (
        <div key={col} className="surface hairline-top rounded-2xl p-6 shadow-lift-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-44" />
          <Skeleton className="mt-6 h-11 w-full" />
          <div className="mt-4 flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-7 w-24" />
            ))}
          </div>
          <Skeleton className="mt-6 h-28 w-full" />
        </div>
      ))}
    </div>
  );
}
