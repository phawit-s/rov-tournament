"use client";

import { motion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { roundLabel, upcomingMatches } from "@/lib/tournament/bracket";
import { formatThaiDate } from "@/lib/tournament/share";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** คิวแมตช์ถัดไป เอาไว้ขึ้นช่วงพักหรือมุมจอ */
export default function UpNextWidget() {
  const { tournament } = useLiveTournament();
  const { accent } = useWidgetOptions();

  const bracket = tournament?.bracket ?? null;
  const list = upcomingMatches(bracket, 4);

  if (!tournament || !bracket || list.length === 0) {
    return (
      <WidgetShell>
        <WidgetHint>ยังไม่มีแมตช์ที่รอแข่ง</WidgetHint>
      </WidgetShell>
    );
  }

  const nameOf = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "TBD") : "TBD";

  return (
    <WidgetShell>
      <WidgetCard accent={accent} className="min-w-105">
        <p
          className="mb-3 font-display text-[11px] tracking-[0.3em] uppercase"
          style={{ color: accent }}
        >
          คิวถัดไป
        </p>

        <ul className="space-y-2.5">
          {list.map((match, i) => (
            <motion.li
              key={match.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{
                background: i === 0 ? `${accent}18` : "rgba(255,255,255,0.04)",
                boxShadow: `inset 0 0 0 1px ${i === 0 ? `${accent}55` : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <span className="font-display text-[11px] tracking-[0.2em] text-white/45 uppercase">
                {roundLabel(match.round, bracket.rounds)}
              </span>
              <span className="min-w-0 flex-1 truncate text-white">
                {nameOf(match.a.teamId)}{" "}
                <span className="text-white/40">vs</span> {nameOf(match.b.teamId)}
              </span>
              <span className="shrink-0 font-display text-[11px] text-white/60">
                {match.scheduledAt ? formatThaiDate(match.scheduledAt) : `BO${match.bestOf}`}
              </span>
            </motion.li>
          ))}
        </ul>
      </WidgetCard>
    </WidgetShell>
  );
}
