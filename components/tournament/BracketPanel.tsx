"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BEST_OF_OPTIONS,
  championId,
  matchesByRound,
  roundLabel,
  setMatchScore,
  setRoundBestOf,
} from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { useMediaQuery } from "@/hooks/useClient";
import type { BestOf, Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import BracketCanvas from "./BracketCanvas";
import MatchPlate from "./MatchPlate";
import RoundRail from "./RoundRail";
import { ArtBracket, EmptyState } from "./ui";

type Props = {
  tournament: Tournament;
  isAdmin: boolean;
  /** ให้ปุ่มในสถานะว่างพาไปแท็บทีมได้ */
  onGoTeams?: () => void;
};

export default function BracketPanel({ tournament, isAdmin, onGoTeams }: Props) {
  const bracket = tournament.bracket;
  const reduced = useReducedMotion();
  // ผังแนวนอนอ่านออกจริงตั้งแต่ lg ขึ้นไป ต่ำกว่านั้นเปลี่ยนเป็นดูทีละรอบ
  const wide = useMediaQuery("(min-width: 1024px)");

  const [hoverTeamId, setHoverTeamId] = useState<string | null>(null);
  // เปิดมาที่รอบที่กำลังแข่งอยู่ ไม่ใช่รอบแรกที่จบไปแล้ว
  const [activeRound, setActiveRound] = useState(() => {
    if (!bracket) return 1;
    const pending = bracket.matches
      .filter((m) => !m.bye && !m.winnerId)
      .sort((a, b) => a.round - b.round || a.order - b.order)[0];
    return pending?.round ?? bracket.rounds;
  });

  if (!bracket) {
    return (
      <EmptyState
        no="03"
        art={<ArtBracket />}
        title="ยังไม่ได้จัดสาย"
        description="สายแข่งสุ่มจาก seed — ใส่ seed เดิมกับทีมชุดเดิมจะได้คู่เดิมเสมอ ตรวจย้อนหลังได้ทุกเมื่อ"
        action={
          onGoTeams ? (
            <Button size="sm" onClick={onGoTeams}>
              ไปสุ่มสายแข่ง
            </Button>
          ) : undefined
        }
      />
    );
  }

  const rounds = matchesByRound(bracket);
  const champ = championId(bracket);
  const championName = champ
    ? (tournament.teams.find((t) => t.id === champ)?.name ?? null)
    : null;

  const nameOf = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "—") : null;
  const indexOf = (id: string | null) =>
    id ? tournament.teams.findIndex((t) => t.id === id) : -1;

  const changeScore = (matchId: string, a: number, b: number) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      bracket: t.bracket ? setMatchScore(t.bracket, matchId, a, b) : null,
    }));

  const changeRoundBo = (round: number, bo: BestOf) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      roundBestOf: t.roundBestOf.map((v, i) => (i === round - 1 ? bo : v)),
      bracket: t.bracket ? setRoundBestOf(t.bracket, round, bo) : null,
    }));

  const hooks = {
    nameOf,
    indexOf,
    isAdmin,
    onScore: changeScore,
    hoverTeamId,
    onHoverTeam: setHoverTeamId,
  };

  // สายอาจถูกสุ่มใหม่ให้เล็กลงระหว่างที่หน้านี้ยังเปิดอยู่ ต้องหนีบไม่ให้ชี้เกินรอบสุดท้าย
  const round = Math.min(Math.max(1, activeRound), bracket.rounds);
  const current = rounds[round - 1] ?? [];
  const lastRound = round === bracket.rounds;

  return (
    <div className="space-y-4">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <RoundRail
          bracket={bracket}
          mode={wide ? "dots" : "chips"}
          active={round}
          onSelect={setActiveRound}
        />
      </motion.div>

      {wide ? (
        <BracketCanvas
          bracket={bracket}
          rounds={rounds}
          championName={championName}
          onChangeBo={changeRoundBo}
          {...hooks}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-t border-hair pt-3">
            <h3 className="font-display text-sm text-ice">
              {roundLabel(round, bracket.rounds)}
              <span className="num ml-2 text-xs text-muted">
                {current.filter((m) => !m.bye).length} แมตช์
              </span>
            </h3>
            {isAdmin ? (
              <select
                value={current[0]?.bestOf ?? 3}
                aria-label="จำนวนเกมของรอบนี้"
                onChange={(e) =>
                  changeRoundBo(round, Number(e.target.value) as BestOf)
                }
                className="field num cursor-pointer rounded-lg px-2 py-1 font-display text-xs text-iris outline-none"
              >
                {BEST_OF_OPTIONS.map((bo) => (
                  <option key={bo} value={bo}>
                    BO{bo}
                  </option>
                ))}
              </select>
            ) : (
              <span className="num font-display text-xs text-iris">
                BO{current[0]?.bestOf ?? 3}
              </span>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={round}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className={lastRound && championName ? "space-y-3 pb-20" : "space-y-3"}
            >
              {current.map((match, i) => (
                <motion.div
                  key={match.id}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className={lastRound ? "pt-10" : ""}
                >
                  <MatchPlate
                    match={match}
                    variant={lastRound ? "final" : "default"}
                    championName={lastRound ? championName : null}
                    {...hooks}
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
