"use client";

import { motion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { championId } from "@/lib/tournament/bracket";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** ป้ายแชมป์ ขึ้นตอนปิดรายการ */
export default function ChampionWidget() {
  const { tournament } = useLiveTournament();
  const { accent } = useWidgetOptions();

  const champ = championId(tournament?.bracket ?? null);
  const team = champ ? tournament?.teams.find((t) => t.id === champ) : null;

  if (!tournament || !team) {
    return (
      <WidgetShell align="center">
        <WidgetHint>ยังไม่มีแชมป์ — รอผลรอบชิงชนะเลิศ</WidgetHint>
      </WidgetShell>
    );
  }

  const prize = calcPrizes(tournament.prize).breakdown[0];

  return (
    <WidgetShell align="center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <WidgetCard accent={accent} className="min-w-130 py-8 text-center">
          <p
            className="font-display text-[11px] tracking-[0.4em] uppercase"
            style={{ color: accent }}
          >
            Champion
          </p>

          <motion.p
            initial={{ letterSpacing: "0.4em", opacity: 0 }}
            animate={{ letterSpacing: "0.02em", opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 font-display text-5xl text-white"
            style={{ textShadow: `0 0 40px ${accent}77` }}
          >
            {team.name}
          </motion.p>

          {team.members.length > 0 && (
            <p className="mt-4 text-sm text-white/70">{team.members.join(" · ")}</p>
          )}

          {tournament.prize.total > 0 && prize && (
            <p className="mt-5 font-display text-xl" style={{ color: accent }}>
              {formatMoney(prize.amount, tournament.prize.currency)}
            </p>
          )}

          <p className="mt-5 font-display text-[11px] tracking-[0.3em] text-white/40 uppercase">
            {tournament.name}
          </p>
        </WidgetCard>
      </motion.div>
    </WidgetShell>
  );
}
