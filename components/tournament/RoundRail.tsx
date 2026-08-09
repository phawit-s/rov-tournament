"use client";

import { motion, useReducedMotion } from "motion/react";
import { roundLabel } from "@/lib/tournament/bracket";
import type { Bracket } from "@/lib/tournament/types";
import { toast } from "../ui/Toast";
import { IconCopy } from "../ui/icons";

type Props = {
  bracket: Bracket;
  /** dots = ผังเต็มบนจอกว้าง · chips = โหมดทีละรอบบนมือถือ */
  mode: "dots" | "chips";
  active: number;
  onSelect: (round: number) => void;
};

/**
 * แถบหัวสาย — ตราประทับ seed, จุดบอกรอบที่จบแล้ว และยอดแมตช์ที่กรอกผลไปแล้ว
 * อยู่ sticky เพื่อให้รู้ตลอดว่ากำลังดูรอบไหนตอนเลื่อนผังยาวๆ
 */
export default function RoundRail({ bracket, mode, active, onSelect }: Props) {
  const reduced = useReducedMotion();
  const playable = bracket.matches.filter((m) => !m.bye);
  const done = playable.filter((m) => m.winnerId).length;

  const roundDone = (round: number) => {
    const list = bracket.matches.filter((m) => m.round === round && !m.bye);
    return list.length > 0 && list.every((m) => m.winnerId);
  };

  const pick = (round: number) => {
    onSelect(round);
    if (mode !== "dots") return;
    document
      .getElementById(`bracket-round-${round}`)
      ?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "nearest",
        inline: "start",
      });
  };

  return (
    <div className="sticky top-2 z-20">
      <div className="surface hairline-top flex items-center gap-3 rounded-xl px-3 py-2.5 shadow-lift-1">
        {/* ตราประทับ seed — ใส่ค่าเดิมกับทีมชุดเดิมแล้วได้สายเดิมเสมอ */}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(bracket.seed)
              .then(() => toast("คัดลอก seed แล้ว", "success"))
              .catch(() => toast("คัดลอกไม่สำเร็จ", "error"));
          }}
          title="คัดลอก seed"
          className="sunken group hidden shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors hover:text-ice sm:flex"
        >
          <span className="slug slug-2">seed</span>
          <span className="num font-display text-xs tracking-[0.16em] text-iris">
            {bracket.seed}
          </span>
          <IconCopy className="h-3 w-3 text-muted transition-colors group-hover:text-iris" />
        </button>

        <span className="rule-v hidden h-6 shrink-0 sm:block" />

        <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto mask-[linear-gradient(90deg,transparent,#000_20px,#000_calc(100%-20px),transparent)]">
          <div className="flex w-max items-center gap-1 px-1">
            {Array.from({ length: bracket.rounds }, (_, i) => {
              const round = i + 1;
              const complete = roundDone(round);
              const on = active === round;

              if (mode === "chips") {
                return (
                  <button
                    key={round}
                    type="button"
                    onClick={() => pick(round)}
                    className={`relative shrink-0 cursor-pointer rounded-lg px-3 py-2 font-display text-xs transition-colors ${
                      on ? "text-onaccent" : "text-muted hover:text-ice"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="round-rail-chip"
                        className="absolute inset-0 rounded-lg accent-fill"
                        transition={{ type: "spring", stiffness: 340, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {roundLabel(round, bracket.rounds)}
                      {complete && (
                        <span
                          className="inline-block h-1.5 w-1.5 rotate-45"
                          style={{
                            background: on
                              ? "rgb(27 21 9 / 0.6)"
                              : "rgb(var(--st-win))",
                          }}
                        />
                      )}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={round}
                  type="button"
                  onClick={() => pick(round)}
                  className="group flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5"
                >
                  <span
                    className="inline-block h-2 w-2 rotate-45 transition-colors"
                    style={{
                      background: complete
                        ? "rgb(var(--accent))"
                        : "rgb(var(--hair) / var(--hair-a))",
                      boxShadow: complete
                        ? "0 0 8px rgb(var(--accent) / .5)"
                        : "inset 0 0 0 1px rgb(var(--hair) / var(--hair-a))",
                    }}
                  />
                  <span
                    className={`font-display text-xs whitespace-nowrap transition-colors ${
                      on ? "text-iris" : "text-muted group-hover:text-ice"
                    }`}
                  >
                    {roundLabel(round, bracket.rounds)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <span className="rule-v hidden h-6 shrink-0 sm:block" />

        <p className="num shrink-0 font-display text-xs text-muted">
          จบแล้ว{" "}
          <span className="text-iris">
            {done}/{playable.length}
          </span>{" "}
          <span className="hidden sm:inline">แมตช์</span>
        </p>
      </div>
    </div>
  );
}
