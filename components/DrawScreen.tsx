"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BENCH_IDENTITY, identityFor } from "@/lib/game";
import { sfx } from "@/lib/sound";
import type { Tournament } from "@/hooks/useTournament";
import DrawMachine from "./DrawMachine";
import TeamBoard from "./TeamBoard";
import Sequence from "./fx/Sequence";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import { FigureRow } from "./ui/Figure";
import { PipRail } from "./ui/hud";

export default function DrawScreen({ t }: { t: Tournament }) {
  const { state, dispatch, derived } = t;
  const { order, teams, bench, plan, remaining, nextSlot, isComplete, total } = derived;
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

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

  // ทีมเต็มเมื่อไหร่ ส่งเสียงสั้นๆ พอ ส่วนภาพเป็นหน้าที่ของการ์ดใน TeamBoard
  const fullCount = useRef(0);
  useEffect(() => {
    const nowFull = teams.filter((team) => team.isFull).length;
    if (nowFull > fullCount.current) sfx.play("teamComplete");
    fullCount.current = nowFull;
  }, [teams]);

  const fullTeams = teams.filter((team) => team.isFull).length;
  const cards = teams.length + (plan.benchCount > 0 ? 1 : 0);
  const ceremony = isComplete && state.phase === "draw";

  /** สีของขีดที่ i บนราง = สีทีมที่คนลำดับนั้นถูกส่งเข้าไป */
  const railColor = (i: number) => {
    const s = plan.slots[i];
    if (!s || s.teamIndex === null) return BENCH_IDENTITY.rgb;
    return identityFor(s.teamIndex).rgb;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      {/* แถบความคืบหน้า: หนึ่งขีดต่อหนึ่งคน สีบอกว่าใครลงทีมไหน */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "backToSetup" })}
        >
          ← แก้ไขรายชื่อ
        </Button>

        <div className="flex min-w-45 flex-1 items-center gap-3.5">
          <span className="min-w-0 flex-1">
            <PipRail total={total} revealed={state.revealed} colorOf={railColor} />
          </span>
          <span className="num shrink-0 font-display text-sm text-iris">
            {state.revealed}
            <span className="text-muted">/{total}</span>
          </span>
        </div>

      </div>

      {/* สรุปสี่ตัวเลขของรอบนี้ */}
      <FigureRow className="border-y border-hair py-6">
        <LiveFigure
          value={state.revealed}
          label="จับแล้ว"
          ratio={total ? state.revealed / total : 0}
          suffix="คน"
        />
        <LiveFigure
          value={fullTeams}
          label="ทีมเต็ม"
          ratio={teams.length ? fullTeams / teams.length : 0}
          suffix={`/ ${teams.length}`}
          className="sm:pl-6"
        />
        <LiveFigure
          value={remaining.length}
          label="เหลือ"
          ratio={total ? remaining.length / total : 0}
          suffix="คน"
          className="sm:pl-6"
        />
        <div className="sm:pl-6">
          {/* seed มีตัวอักษรปน จึงใช้ .num อย่างเดียว ไม่ใช้ .fig ที่ไว้สำหรับตัวเลขล้วน */}
          <span className="num block truncate font-display text-[clamp(1.5rem,3.4vw,2.2rem)] leading-tight font-light text-iris">
            {state.seed || "—"}
          </span>
          <p className="slug slug-2 mt-2">Seed</p>
        </div>
      </FigureRow>

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

          <Panel className="p-5" accent="138 142 168">
            <Panel.Header
              eyebrow="Pool"
              title="ยังไม่ถูกจับ"
              count={remaining.length}
            />
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              <AnimatePresence mode="popLayout" initial={false}>
                {remaining.map((player) => (
                  <motion.span
                    key={player.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="rounded-lg border border-hair px-2.5 py-1 text-xs text-ice/70"
                  >
                    {player.name}
                  </motion.span>
                ))}
              </AnimatePresence>
              {remaining.length === 0 && (
                <span className="text-xs text-muted">หมดแล้ว</span>
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
            flashIndex={flashIndex}
          />
        </div>
      </div>

      {/* พิธีปิด 1.5 วิ ก่อนพาไปหน้าสรุป — แทน setTimeout ที่เคยปล่อยจอนิ่ง */}
      {ceremony && (
        <Sequence
          cards={cards}
          onFlash={(i) => setFlashIndex(i < 0 ? null : i)}
          onDone={() => dispatch({ type: "finish" })}
        />
      )}
    </motion.div>
  );
}

/**
 * ช่องสถิติที่ค่าเปลี่ยนได้ตลอดรอบ
 * ใช้ Figure ของกลางไม่ได้ เพราะตัวนั้นเขียนเลขลง textContent ครั้งเดียวตอนเลื่อนมาถึง
 * ค่าที่อัปเดตทีหลังจะค้าง — ที่นี่จึงเรนเดอร์เลขตรงๆ แล้วให้มันเลื่อนขึ้นตอนเปลี่ยน
 */
function LiveFigure({
  value,
  label,
  ratio,
  suffix,
  className = "",
}: {
  value: number;
  label: string;
  ratio?: number;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(1, ratio ?? 0));

  return (
    <div className={className}>
      <span className="flex items-baseline gap-1.5">
        <span className="block overflow-hidden">
          <motion.span
            key={value}
            initial={reduced ? false : { y: "45%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`fig num block text-[clamp(2rem,4.5vw,3.4rem)] ${
              value === 0 ? "text-muted/50" : "text-ice"
            }`}
          >
            {value === 0 ? "—" : value.toLocaleString("th-TH")}
          </motion.span>
        </span>
        {suffix && value !== 0 && (
          <span className="num text-sm text-muted">{suffix}</span>
        )}
      </span>

      <p className="slug mt-2">{label}</p>

      {ratio != null && (
        <span className="rule mt-3 block h-0.5 w-full overflow-hidden">
          <motion.span
            className="block h-full origin-left bg-[linear-gradient(90deg,var(--color-iris-deep),var(--color-iris))]"
            initial={false}
            animate={{ scaleX: pct }}
            transition={{ type: "spring", stiffness: 140, damping: 24 }}
          />
        </span>
      )}
    </div>
  );
}
