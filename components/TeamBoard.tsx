"use client";

import { AnimatePresence, motion } from "motion/react";
import { BENCH_IDENTITY } from "@/lib/rov";
import type { BuiltTeam, Member } from "@/lib/types";
import Panel from "./ui/Panel";
import TiltCard from "./ui/TiltCard";

type Props = {
  teams: BuiltTeam[];
  bench: Member[];
  benchCount: number;
  activeTeamIndex: number | null;
  /** null = กำลังจะสุ่มเข้าโซนตัวสำรอง */
  activeIsBench?: boolean;
  teamName: (index: number) => string;
  onRenameTeam?: (index: number, name: string) => void;
  layoutAnimations?: boolean;
  tilt?: boolean;
  compact?: boolean;
};

export default function TeamBoard({
  teams,
  bench,
  benchCount,
  activeTeamIndex,
  activeIsBench = false,
  teamName,
  onRenameTeam,
  layoutAnimations = false,
  tilt = false,
  compact = false,
}: Props) {
  return (
    <div
      className={`grid gap-4 ${
        compact
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      }`}
    >
      {teams.map((team) => (
        <TeamCard
          key={team.index}
          team={team}
          label={teamName(team.index)}
          active={activeTeamIndex === team.index}
          onRename={onRenameTeam}
          layoutAnimations={layoutAnimations}
          tilt={tilt}
        />
      ))}

      {benchCount > 0 && (
        <BenchCard
          members={bench}
          size={benchCount}
          active={activeIsBench}
          layoutAnimations={layoutAnimations}
          tilt={tilt}
        />
      )}
    </div>
  );
}

function CardShell({
  children,
  tilt,
  className,
  accent,
}: {
  children: React.ReactNode;
  tilt: boolean;
  className: string;
  accent: string;
}) {
  const panel = (
    <Panel accent={accent} className={className}>
      {children}
    </Panel>
  );
  return tilt ? <TiltCard max={7}>{panel}</TiltCard> : panel;
}

function TeamCard({
  team,
  label,
  active,
  onRename,
  layoutAnimations,
  tilt,
}: {
  team: BuiltTeam;
  label: string;
  active: boolean;
  onRename?: (index: number, name: string) => void;
  layoutAnimations: boolean;
  tilt: boolean;
}) {
  const { identity, members, size } = team;
  const fill = size ? (members.length / size) * 100 : 0;
  const displayName = label || identity.name;

  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: active ? 1.015 : 1,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="relative"
    >
      {active && (
        <motion.div
          layoutId="active-team-halo"
          className="pointer-events-none absolute -inset-1.5 rounded-[26px]"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, rgb(${identity.rgb} / 0.35), transparent 70%)`,
            boxShadow: `0 0 0 1.5px rgb(${identity.rgb} / 0.65), 0 0 45px -8px rgb(${identity.rgb} / 0.75)`,
            borderRadius: 26,
          }}
          transition={{ type: "spring", stiffness: 250, damping: 28 }}
        />
      )}

      <CardShell tilt={tilt} accent={identity.rgb} className="overflow-hidden p-4">
        <header className="mb-3 flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
            style={{
              background: `linear-gradient(140deg, rgb(${identity.rgb} / 0.35), rgb(${identity.rgb} / 0.08))`,
              boxShadow: `inset 0 0 0 1px rgb(${identity.rgb} / 0.45)`,
            }}
          >
            {identity.glyph}
          </span>

          <div className="min-w-0 flex-1">
            {onRename ? (
              <input
                value={displayName}
                onChange={(e) => onRename(team.index, e.target.value)}
                aria-label={`ชื่อทีมที่ ${team.index + 1}`}
                className="w-full truncate bg-transparent font-display text-base font-bold tracking-wide outline-none focus:text-white"
                style={{ color: identity.hex }}
              />
            ) : (
              <p
                className="truncate font-display text-base font-bold tracking-wide"
                style={{ color: identity.hex }}
              >
                {displayName}
              </p>
            )}
            <p className="text-[11px] text-muted">TEAM {team.index + 1}</p>
          </div>

          <motion.span
            animate={
              team.isFull
                ? { scale: [1, 1.18, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.45 }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-display text-xs font-semibold tabular-nums"
            style={{
              color: team.isFull ? "#05050e" : identity.hex,
              background: team.isFull
                ? `rgb(${identity.rgb} / 0.95)`
                : `rgb(${identity.rgb} / 0.12)`,
            }}
          >
            {team.isFull && (
              <span className="text-[9px] tracking-[0.15em]">FULL</span>
            )}
            {members.length}/{size}
          </motion.span>
        </header>

        <ul className="space-y-1.5">
          {Array.from({ length: size }, (_, seat) => {
            const member = members.find((m) => m.seat === seat);
            return (
              <li key={seat} className="relative">
                <AnimatePresence mode="popLayout" initial={false}>
                  {member ? (
                    <motion.div
                      key={member.player.id}
                      layoutId={
                        layoutAnimations ? `player-${member.player.id}` : undefined
                      }
                      initial={
                        layoutAnimations ? false : { opacity: 0, x: -12 }
                      }
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                      style={{
                        background: `linear-gradient(100deg, rgb(${identity.rgb} / 0.18), rgb(${identity.rgb} / 0.04))`,
                        boxShadow: `inset 0 0 0 1px rgb(${identity.rgb} / 0.22)`,
                      }}
                    >
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-display text-[11px] font-bold tabular-nums"
                        style={{
                          background: `rgb(${identity.rgb} / 0.25)`,
                          color: "#fff",
                        }}
                      >
                        {seat + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                        {member.player.name}
                      </span>
                      {member.lane && (
                        <span
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: `rgb(${identity.rgb} / 0.2)`,
                            color: identity.hex,
                          }}
                        >
                          {member.lane}
                        </span>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`empty-${seat}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-2.5 py-2"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/5 font-display text-[11px] text-muted tabular-nums">
                        {seat + 1}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                        <span className="block h-full w-1/3 animate-shimmer bg-linear-to-r from-transparent via-white/25 to-transparent" />
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, rgb(${identity.rgb}), #fff)` }}
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ type: "spring", stiffness: 180, damping: 26 }}
          />
        </div>

      </CardShell>
    </motion.div>
  );
}

function BenchCard({
  members,
  size,
  active,
  layoutAnimations,
  tilt,
}: {
  members: Member[];
  size: number;
  active: boolean;
  layoutAnimations: boolean;
  tilt: boolean;
}) {
  const id = BENCH_IDENTITY;
  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, scale: active ? 1.015 : 1 }}
      className="relative"
    >
      <CardShell tilt={tilt} accent={id.rgb} className="p-4">
        <header className="mb-3 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/6 text-lg">
            {id.glyph}
          </span>
          <div className="flex-1">
            <p className="font-display text-base font-bold tracking-wide text-muted">
              {id.name}
            </p>
            <p className="text-[11px] text-muted/70">รอเสียบแทน</p>
          </div>
          <span className="rounded-lg bg-white/6 px-2 py-1 font-display text-xs font-semibold text-muted tabular-nums">
            {members.length}/{size}
          </span>
        </header>

        <ul className="flex flex-wrap gap-2">
          {Array.from({ length: size }, (_, seat) => {
            const member = members.find((m) => m.seat === seat);
            return member ? (
              <motion.li
                key={member.player.id}
                layoutId={
                  layoutAnimations ? `player-${member.player.id}` : undefined
                }
                className="rounded-lg bg-white/8 px-2.5 py-1.5 text-sm text-white/85"
              >
                {member.player.name}
              </motion.li>
            ) : (
              <li
                key={`e-${seat}`}
                className="rounded-lg border border-dashed border-white/10 px-4 py-1.5 text-sm text-muted/50"
              >
                —
              </li>
            );
          })}
        </ul>
      </CardShell>
    </motion.div>
  );
}
