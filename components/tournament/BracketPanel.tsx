"use client";

import { motion } from "motion/react";
import {
  BEST_OF_OPTIONS,
  matchesByRound,
  roundLabel,
  setMatchScore,
  setRoundBestOf,
  winsNeeded,
} from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { identityFor } from "@/lib/rov";
import type { BestOf, Match, Tournament } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import { EmptyNote } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

export default function BracketPanel({ tournament, isAdmin }: Props) {
  const bracket = tournament.bracket;
  if (!bracket) {
    return (
      <EmptyNote>
        ยังไม่ได้จัดสาย — ไปที่แท็บ &ldquo;ทีม&rdquo; แล้วกด &ldquo;สุ่มสายแข่ง&rdquo;
      </EmptyNote>
    );
  }

  const rounds = matchesByRound(bracket);
  const teamName = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "—") : null;
  const teamIndex = (id: string | null) =>
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        สายนี้สุ่มด้วย seed{" "}
        <span className="font-display tracking-[0.16em] text-champagne">
          {bracket.seed}
        </span>{" "}
        — ใส่ seed เดิมกับทีมชุดเดิมจะได้สายเดิมเสมอ
      </p>

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-5">
          {rounds.map((matches, i) => {
            const round = i + 1;
            return (
              <div key={round} className="w-72 shrink-0">
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm text-ice">
                    {roundLabel(round, bracket.rounds)}
                  </h3>
                  {isAdmin ? (
                    <select
                      value={matches[0]?.bestOf ?? 3}
                      onChange={(e) =>
                        changeRoundBo(round, Number(e.target.value) as BestOf)
                      }
                      className="field cursor-pointer rounded-lg px-2 py-1 font-display text-xs text-champagne outline-none"
                    >
                      {BEST_OF_OPTIONS.map((bo) => (
                        <option key={bo} value={bo}>
                          BO{bo}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-display text-xs text-champagne">
                      BO{matches[0]?.bestOf ?? 3}
                    </span>
                  )}
                </div>

                <div className="flex flex-col justify-around gap-3">
                  {matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      nameOf={teamName}
                      indexOf={teamIndex}
                      isAdmin={isAdmin}
                      onScore={changeScore}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  nameOf,
  indexOf,
  isAdmin,
  onScore,
}: {
  match: Match;
  nameOf: (id: string | null) => string | null;
  indexOf: (id: string | null) => number;
  isAdmin: boolean;
  onScore: (matchId: string, a: number, b: number) => void;
}) {
  const need = winsNeeded(match.bestOf);
  const done = !!match.winnerId;

  return (
    <Panel
      accent={done ? "207 167 101" : "155 160 179"}
      interactive={false}
      className={`p-3.5 ${match.bye ? "opacity-60" : ""}`}
    >
      <Side
        side="a"
        match={match}
        nameOf={nameOf}
        indexOf={indexOf}
        need={need}
        isAdmin={isAdmin}
        onScore={onScore}
      />
      <div className="my-2 flex items-center gap-2">
        <span className="h-px flex-1 rule" />
        <span className="font-display text-[10px] text-muted">
          {match.bye ? "BYE" : `BO${match.bestOf}`}
        </span>
        <span className="h-px flex-1 rule" />
      </div>
      <Side
        side="b"
        match={match}
        nameOf={nameOf}
        indexOf={indexOf}
        need={need}
        isAdmin={isAdmin}
        onScore={onScore}
      />
    </Panel>
  );
}

function Side({
  side,
  match,
  nameOf,
  indexOf,
  need,
  isAdmin,
  onScore,
}: {
  side: "a" | "b";
  match: Match;
  nameOf: (id: string | null) => string | null;
  indexOf: (id: string | null) => number;
  need: number;
  isAdmin: boolean;
  onScore: (matchId: string, a: number, b: number) => void;
}) {
  const self = match[side];
  const name = nameOf(self.teamId);
  const isWinner = !!match.winnerId && match.winnerId === self.teamId;
  const isLoser = !!match.winnerId && !isWinner && !!self.teamId;
  const idx = indexOf(self.teamId);
  const identity = idx >= 0 ? identityFor(idx) : null;

  const bump = (delta: number) => {
    const next = Math.max(0, Math.min(need, self.score + delta));
    const a = side === "a" ? next : match.a.score;
    const b = side === "b" ? next : match.b.score;
    onScore(match.id, a, b);
  };

  const canEdit = isAdmin && !!match.a.teamId && !!match.b.teamId && !match.bye;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
        isLoser ? "opacity-45" : ""
      }`}
      style={
        isWinner && identity
          ? {
              background: `rgb(${identity.rgb} / 0.10)`,
              boxShadow: `inset 0 0 0 1px rgb(${identity.rgb} / 0.3)`,
            }
          : undefined
      }
    >
      {identity ? (
        <span className="text-[11px]" style={{ color: identity.hex }}>
          {identity.glyph}
        </span>
      ) : (
        <span className="text-[11px] text-muted/50">·</span>
      )}

      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          name ? "text-ice" : "text-muted/60 italic"
        }`}
      >
        {name ?? "รอผู้ชนะ"}
      </span>

      {canEdit && (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => bump(-1)}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded text-xs text-muted transition-colors hover:text-ice"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => bump(1)}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded text-xs text-muted transition-colors hover:text-champagne"
          >
            +
          </button>
        </span>
      )}

      <motion.span
        key={self.score}
        initial={{ scale: 1.3, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`w-5 text-right font-display text-sm tabular-nums ${
          isWinner ? "text-champagne" : "text-muted"
        }`}
      >
        {match.bye && !self.teamId ? "" : self.score}
      </motion.span>
    </div>
  );
}
