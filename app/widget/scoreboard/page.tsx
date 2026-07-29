"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { currentMatch, roundLabel, winsNeeded } from "@/lib/tournament/bracket";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** สกอร์บั๊กสำหรับวางบนสตรีม — อัปเดตเองเมื่อผู้จัดกรอกผล (โหมดคลาวด์) */
export default function ScoreboardWidget() {
  const { tournament } = useLiveTournament();
  const { accent, matchId } = useWidgetOptions();

  const bracket = tournament?.bracket ?? null;
  const match =
    (matchId && bracket?.matches.find((m) => m.id === matchId)) ||
    currentMatch(bracket);

  if (!tournament || !match || !bracket) {
    return (
      <WidgetShell>
        <WidgetHint>ยังไม่มีแมตช์ให้แสดง — ตรวจลิงก์ว่ามี #c= หรือ #t= ครบไหม</WidgetHint>
      </WidgetShell>
    );
  }

  const nameOf = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "TBD") : "TBD";
  const need = winsNeeded(match.bestOf);

  return (
    <WidgetShell>
      <WidgetCard accent={accent} className="min-w-140">
        <div className="mb-3 flex items-center justify-between gap-6">
          <span
            className="font-display text-[11px] tracking-[0.3em] uppercase"
            style={{ color: accent }}
          >
            {roundLabel(match.round, bracket.rounds)}
          </span>
          <span className="font-display text-[11px] tracking-[0.2em] text-white/55 uppercase">
            BO{match.bestOf} · ชนะ {need} เกม
          </span>
        </div>

        <div className="flex items-center gap-5">
          <Side name={nameOf(match.a.teamId)} align="right" winner={match.winnerId === match.a.teamId} />

          <div className="flex shrink-0 items-center gap-3">
            <Score value={match.a.score} accent={accent} lead={match.a.score > match.b.score} />
            <span className="font-display text-lg text-white/30">:</span>
            <Score value={match.b.score} accent={accent} lead={match.b.score > match.a.score} />
          </div>

          <Side name={nameOf(match.b.teamId)} align="left" winner={match.winnerId === match.b.teamId} />
        </div>

        {tournament.name && (
          <p className="mt-3 text-center font-display text-[11px] tracking-[0.25em] text-white/40 uppercase">
            {tournament.name}
          </p>
        )}
      </WidgetCard>
    </WidgetShell>
  );
}

function Side({
  name,
  align,
  winner,
}: {
  name: string;
  align: "left" | "right";
  winner: boolean;
}) {
  return (
    <div className={`min-w-0 flex-1 ${align === "right" ? "text-right" : "text-left"}`}>
      <p
        className={`truncate font-display text-2xl leading-tight ${
          winner ? "text-white" : "text-white/85"
        }`}
        style={winner ? { textShadow: "0 0 18px rgba(230,200,148,0.55)" } : undefined}
      >
        {name}
      </p>
    </div>
  );
}

function Score({
  value,
  accent,
  lead,
}: {
  value: number;
  accent: string;
  lead: boolean;
}) {
  return (
    <div
      className="grid h-14 w-14 place-items-center rounded-xl"
      style={{
        background: lead ? `${accent}22` : "rgba(255,255,255,0.05)",
        boxShadow: `inset 0 0 0 1px ${lead ? `${accent}88` : "rgba(255,255,255,0.12)"}`,
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="font-display text-3xl tabular-nums"
          style={{ color: lead ? accent : "#fff" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
