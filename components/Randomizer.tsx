"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { muteStore, sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";
import { clearShareHash } from "@/lib/share";
import { useTournament } from "@/hooks/useTournament";
import BackgroundFX from "./fx/BackgroundFX";
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

  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const toggleMute = () => {
    muteStore.toggle();
    if (muted) sfx.play("click");
  };

  const phaseIndex = STEPS.findIndex((s) => s.key === t.state.phase);

  return (
    <>
      <BackgroundFX />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-350 flex-col gap-6 px-4 pt-[calc(1.5rem+var(--sat))] pb-[calc(2.5rem+var(--sab))] sm:px-6 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-champagne/35 bg-[radial-gradient(circle_at_35%_25%,rgba(242,220,176,0.22),transparent_65%)]"
            >
              <span className="font-display text-base font-medium text-champagne">
                R
              </span>
            </motion.span>

            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-medium tracking-[0.16em] sm:text-lg">
                <span className="text-gold-grad">ROV TEAM RANDOMIZER</span>
              </h1>
              <p className="mt-0.5 truncate text-xs text-muted">
                สุ่มแบ่งทีมทัวร์นาเมนต์ ยุติธรรม ตรวจย้อนหลังได้ด้วย seed
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <StepRail index={phaseIndex} />
            <IconButton
              onClick={() => {
                sfx.play("click");
                themeStore.toggle();
              }}
              label={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </IconButton>
            <IconButton onClick={toggleMute} label={muted ? "เปิดเสียง" : "ปิดเสียง"}>
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
              ↺
            </IconButton>
          </div>
        </header>

        <div className="h-px rule" />

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

        <footer className="border-t border-hair pt-5 text-center text-xs text-muted">
          ผลลัพธ์คำนวณจาก seed + รายชื่อ · ใส่ค่าเดิมได้ผลเดิมเสมอ · ทำงานในเครื่องล้วน
          ไม่มีการส่งข้อมูลออก
        </footer>
      </main>
    </>
  );
}

function StepRail({ index }: { index: number }) {
  return (
    <div className="mr-1 hidden items-center gap-3 sm:flex">
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
      className="grid h-10 w-10 cursor-pointer place-items-center tile rounded-full text-sm text-ice/80 transition-all duration-300 hover:border-champagne/40 hover:bg-champagne/15 hover:text-champagne active:scale-95"
    >
      {children}
    </button>
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
