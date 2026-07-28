"use client";

import { AnimatePresence } from "motion/react";
import { clearShareHash } from "@/lib/share";
import { useTournament } from "@/hooks/useTournament";
import SetupScreen from "./SetupScreen";
import DrawScreen from "./DrawScreen";
import ResultScreen from "./ResultScreen";

const STEPS = [
  { key: "setup", label: "รายชื่อ" },
  { key: "draw", label: "จับสลาก" },
  { key: "result", label: "ผลลัพธ์" },
] as const;

/** เครื่องมือสุ่มแบ่งทีมแบบเร็วๆ ไม่ผูกกับทัวร์นาเมนต์ */
export default function Randomizer() {
  const t = useTournament();
  const phaseIndex = STEPS.findIndex((s) => s.key === t.state.phase);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <StepRail index={phaseIndex} />
        <button
          type="button"
          onClick={() => {
            if (!confirm("ล้างรายชื่อและเริ่มใหม่?")) return;
            clearShareHash();
            t.dispatch({ type: "resetAll" });
          }}
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
    </div>
  );
}

function StepRail({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((step, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <div key={step.key} className="flex items-center gap-3">
            {i > 0 && (
              <span
                className={`h-px w-6 transition-colors duration-500 ${
                  done || active ? "bg-champagne/45" : "rule"
                }`}
              />
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
              {done ? "✓" : `0${i + 1}`} {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Splash() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin-slow rounded-full border border-champagne/20 border-t-champagne/80" />
        <p className="font-display text-xs tracking-luxe text-muted">LOADING</p>
      </div>
    </div>
  );
}
