"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Corners from "../ui/Corners";

/*
  markup จำลองของ widget สามตัว — เขียนซ้ำที่นี่แทนการ import จาก app/widget
  เพราะหน้าจริงผูกกับ useLiveTournament (ต้องมีทัวร์จริง) และเป็นไฟล์ของแพ็กเกจอื่น
  ใช้โทเคนสีของเว็บ ไม่ใช่สีตายตัวของสตรีม จะได้อ่านออกทั้งธีมมืดและสว่าง
*/

function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`surface hairline-top relative rounded-2xl px-7 py-5 ${className}`}>
      {children}
    </div>
  );
}

function ScoreBox({ value, lead }: { value: number; lead?: boolean }) {
  return (
    <span
      className="tile num grid h-14 w-14 place-items-center rounded-xl font-display text-3xl"
      style={
        lead
          ? {
              color: "var(--color-iris)",
              boxShadow: "inset 0 0 0 1px rgb(var(--accent) / .55)",
            }
          : { color: "var(--color-ice)" }
      }
    >
      {value}
    </span>
  );
}

function MockScoreboard() {
  return (
    <Frame>
      <div className="mb-4 flex items-center justify-between gap-6">
        <span className="slug">รอบชิงชนะเลิศ</span>
        <span className="slug slug-2 num">BO5 · ชนะ 3 เกม</span>
      </div>

      <div className="flex items-center gap-5">
        <p className="min-w-0 flex-1 truncate text-right font-display text-3xl font-light text-ice">
          ราชสีห์
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <ScoreBox value={3} lead />
          <span className="font-display text-lg text-muted">:</span>
          <ScoreBox value={1} />
        </div>
        <p className="min-w-0 flex-1 truncate font-display text-3xl font-light text-muted">
          วายุ
        </p>
      </div>

      <p className="slug slug-2 mt-4 text-center">OPEN CUP 2026</p>
    </Frame>
  );
}

const QUEUE = [
  { round: "รอบรอง", pair: "นาคา vs ครุฑ", meta: "BO3" },
  { round: "รอบรอง", pair: "ไทเกอร์ vs โคจร", meta: "19:30" },
  { round: "ชิงชนะเลิศ", pair: "ผู้ชนะ A vs ผู้ชนะ B", meta: "BO5" },
];

function MockUpNext() {
  return (
    <Frame>
      <p className="slug mb-3">คิวถัดไป</p>
      <ul className="space-y-2">
        {QUEUE.map((q, i) => (
          <li
            key={q.pair}
            className="tile flex items-center gap-3 rounded-lg px-3 py-2"
            style={
              i === 0
                ? {
                    background: "rgb(var(--accent) / .12)",
                    borderColor: "rgb(var(--accent) / .4)",
                  }
                : undefined
            }
          >
            <span className="slug slug-2 shrink-0">{q.round}</span>
            <span className="min-w-0 flex-1 truncate text-ice">{q.pair}</span>
            <span className="num shrink-0 font-display text-xs text-muted">{q.meta}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function MockChampion() {
  return (
    <Frame className="py-8 text-center">
      <p className="slug">Champion</p>
      <p className="mt-3 font-display text-5xl font-light text-accent-grad">ราชสีห์</p>
      <p className="mt-3 text-sm text-muted">บอส · เอิร์ธ · นิว · ป๊อป · แบงค์</p>
      <p className="num mt-4 font-display text-xl text-iris">฿ 12,000</p>
    </Frame>
  );
}

const PEEKS = [
  { key: "scoreboard", label: "Scoreboard", node: <MockScoreboard /> },
  { key: "upnext", label: "Up next", node: <MockUpNext /> },
  { key: "champion", label: "Champion", node: <MockChampion /> },
];

/**
 * ตัวอย่าง widget ที่วางลง OBS ได้จริง — สลับใบเองทุก 3.5 วิ
 * ใช้ markup ล้วนไม่ใช้รูป เพราะ static export ไม่มี next/image optimization
 */
export default function WidgetPeek({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    // setState อยู่ใน callback ของ interval ไม่ใช่ในตัว effect เอง
    const id = setInterval(() => setI((v) => (v + 1) % PEEKS.length), 3500);
    return () => clearInterval(id);
  }, [reduced]);

  const prev = PEEKS[(i + PEEKS.length - 1) % PEEKS.length];
  const next = PEEKS[(i + 1) % PEEKS.length];

  return (
    <div className={className}>
      {/* 16/9 บนจอแคบ แต่หนีบความสูงไว้บนจอกว้าง ไม่งั้นกล่องสูงเกือบ 500px */}
      <div className="sunken relative aspect-video max-h-72 w-full overflow-hidden rounded-xl">
        <span className="scanlines absolute inset-0" aria-hidden />
        <Corners len={14} o={0.45} />

        <div className="absolute inset-0 grid place-items-center">
          {/* ย่อทั้งเวทีด้วย transform ซ้อนชั้น จะได้ออกแบบการ์ดที่ขนาดจริงแล้วค่อยหด */}
          <div className="scale-[0.42] sm:scale-[0.55] lg:scale-[0.72]">
            <div className="relative h-50 w-150">
              {!reduced && (
                <>
                  <div
                    aria-hidden
                    className="absolute top-1/2 left-1/2 w-150 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] scale-[0.9] opacity-[0.18]"
                  >
                    {prev.node}
                  </div>
                  <div
                    aria-hidden
                    className="absolute top-1/2 left-1/2 w-150 -translate-x-1/2 -translate-y-1/2 rotate-[4deg] scale-[0.9] opacity-[0.18]"
                  >
                    {next.node}
                  </div>
                </>
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={PEEKS[i].key}
                  className="absolute top-1/2 left-1/2 w-150"
                  initial={
                    reduced
                      ? { x: "-50%", y: "-50%" }
                      : { x: "-50%", y: "-44%", opacity: 0, scale: 0.94 }
                  }
                  animate={{ x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
                  exit={
                    reduced
                      ? undefined
                      : { x: "-50%", y: "-56%", opacity: 0, scale: 0.94 }
                  }
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  {PEEKS[i].node}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <span className="slug absolute bottom-2 left-3">{PEEKS[i].label}</span>

        <span className="absolute right-3 bottom-3 flex items-center gap-1.5">
          {PEEKS.map((p, idx) => (
            <span
              key={p.key}
              className={`inline-block h-1.5 w-1.5 rotate-45 transition-colors duration-500 ${
                idx === i ? "bg-iris" : "rule"
              }`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
