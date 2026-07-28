"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BENCH_IDENTITY, identityFor } from "@/lib/rov";
import { teamCompleteBurst } from "@/lib/confetti";
import { sfx } from "@/lib/sound";
import type { Tournament } from "@/hooks/useTournament";
import DrawMachine from "./DrawMachine";
import TeamBoard from "./TeamBoard";
import Panel from "./ui/Panel";
import MagneticButton from "./ui/MagneticButton";

export default function DrawScreen({ t }: { t: Tournament }) {
  const { state, dispatch, derived } = t;
  const { order, teams, bench, plan, remaining, nextSlot, isComplete, total } = derived;

  const next = order[state.revealed] ?? null;
  const slot = nextSlot;
  const identity =
    slot === null
      ? null
      : slot.teamIndex === null
        ? BENCH_IDENTITY
        : identityFor(slot.teamIndex);
  const label =
    slot === null || identity === null
      ? ""
      : slot.teamIndex === null
        ? BENCH_IDENTITY.name
        : state.teamNames[slot.teamIndex] || identity.name;

  // ฉลองทุกครั้งที่มีทีมเต็ม
  const fullCount = useRef(0);
  useEffect(() => {
    const nowFull = teams.filter((team) => team.isFull).length;
    if (nowFull > fullCount.current) {
      const justFilled = teams.filter((team) => team.isFull).at(-1);
      sfx.play("teamComplete");
      if (justFilled) teamCompleteBurst(justFilled.identity.hex);
    }
    fullCount.current = nowFull;
  }, [teams]);

  // จับครบแล้วพาไปหน้าสรุปเอง
  useEffect(() => {
    if (!isComplete || state.phase !== "draw") return;
    const id = window.setTimeout(() => dispatch({ type: "finish" }), 1500);
    return () => window.clearTimeout(id);
  }, [isComplete, state.phase, dispatch]);

  const progress = total ? (state.revealed / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* แถบความคืบหน้า */}
      <div className="flex flex-wrap items-center gap-3">
        <MagneticButton
          variant="ghost"
          strength={0.2}
          className="px-4 py-2 text-xs"
          onClick={() => dispatch({ type: "backToSetup" })}
        >
          ← แก้ไขรายชื่อ
        </MagneticButton>

        <div className="flex min-w-45 flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-cyan via-violet to-magenta"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 24 }}
            />
          </div>
          <span className="font-display text-sm font-bold text-white tabular-nums">
            {state.revealed}/{total}
          </span>
        </div>

        <span className="rounded-lg bg-white/6 px-2.5 py-1.5 font-display text-[11px] tracking-widest text-gold">
          SEED {state.seed}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(330px,400px)_1fr]">
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <DrawMachine
            remaining={remaining}
            next={next}
            target={
              identity && slot
                ? {
                    identity,
                    label,
                    seat: slot.seat,
                    isBench: slot.teamIndex === null,
                  }
                : null
            }
            round={state.revealed + 1}
            total={total}
            canUndo={state.revealed > 0}
            onCommit={() => dispatch({ type: "reveal" })}
            onUndo={() => {
              sfx.play("undo");
              dispatch({ type: "undo" });
            }}
            onRevealAll={() => dispatch({ type: "revealAll" })}
          />

          <Panel tag="POOL" className="p-4" accent="139 139 181">
            <p className="mb-2 font-display text-[11px] tracking-[0.25em] text-muted">
              ยังไม่ถูกจับ ({remaining.length})
            </p>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              <AnimatePresence mode="popLayout" initial={false}>
                {remaining.map((player) => (
                  <motion.span
                    key={player.id}
                    layout
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.4, filter: "blur(6px)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-xs text-ice/70"
                  >
                    {player.name}
                  </motion.span>
                ))}
              </AnimatePresence>
              {remaining.length === 0 && (
                <span className="text-xs text-muted">— หมดแล้ว —</span>
              )}
            </div>
          </Panel>
        </div>

        <div>
          <TeamBoard
            teams={teams}
            bench={bench}
            benchCount={plan.benchCount}
            activeTeamIndex={slot?.teamIndex ?? null}
            activeIsBench={slot?.teamIndex === null}
            teamName={(i) => state.teamNames[i] ?? ""}
            onRenameTeam={(index, name) =>
              dispatch({ type: "renameTeam", index, name })
            }
            layoutAnimations
            compact
          />
        </div>
      </div>
    </motion.div>
  );
}
