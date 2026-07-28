"use client";

import { AnimatePresence, motion } from "motion/react";
import { BENCH_IDENTITY } from "@/lib/rov";
import type { BuiltTeam, Member } from "@/lib/types";
import Panel from "./ui/Panel";

type Props = {
  teams: BuiltTeam[];
  bench: Member[];
  benchCount: number;
  activeTeamIndex: number | null;
  activeIsBench?: boolean;
  teamName: (index: number) => string;
  onRenameTeam?: (index: number, name: string) => void;
  layoutAnimations?: boolean;
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
        />
      ))}

      {benchCount > 0 && (
        <BenchCard
          members={bench}
          size={benchCount}
          active={activeIsBench}
          layoutAnimations={layoutAnimations}
        />
      )}
    </div>
  );
}

function TeamCard({
  team,
  label,
  active,
  onRename,
  layoutAnimations,
}: {
  team: BuiltTeam;
  label: string;
  active: boolean;
  onRename?: (index: number, name: string) => void;
  layoutAnimations: boolean;
}) {
  const { identity, members, size } = team;
  const fill = size ? (members.length / size) * 100 : 0;
  const displayName = label || identity.name;

  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 28 }}
      className="relative"
    >
      {active && (
        <motion.div
          layoutId="active-team-halo"
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{
            boxShadow: `0 0 0 1px rgb(${identity.rgb} / 0.5), 0 20px 60px -30px rgb(${identity.rgb} / 0.8)`,
          }}
          transition={{ type: "spring", stiffness: 240, damping: 30 }}
        />
      )}

      <Panel accent={identity.rgb} className="p-5">
        <header className="mb-4 flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm"
            style={{
              borderColor: `rgb(${identity.rgb} / 0.4)`,
              color: identity.hex,
              background: `rgb(${identity.rgb} / 0.08)`,
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
                className="w-full truncate bg-transparent font-display text-base font-medium tracking-wide outline-none focus:text-ice"
                style={{ color: identity.hex }}
              />
            ) : (
              <p
                className="truncate font-display text-base font-medium tracking-wide"
                style={{ color: identity.hex }}
              >
                {displayName}
              </p>
            )}
            <p className="mt-0.5 font-display text-[10px] tracking-luxe text-muted uppercase">
              Team {team.index + 1}
            </p>
          </div>

          <span
            className="shrink-0 font-display text-sm tabular-nums"
            style={{ color: team.isFull ? identity.hex : "var(--color-muted)" }}
          >
            {members.length}
            <span className="text-muted">/{size}</span>
          </span>
        </header>

        <ul className="space-y-2">
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
                      initial={layoutAnimations ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2"
                      style={{
                        borderColor: `rgb(${identity.rgb} / 0.2)`,
                        background: `rgb(${identity.rgb} / 0.07)`,
                      }}
                    >
                      <span className="font-display text-[11px] text-muted tabular-nums">
                        {String(seat + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ice">
                        {member.player.name}
                      </span>
                      {member.lane && (
                        <span
                          className="shrink-0 text-[11px]"
                          style={{ color: `rgb(${identity.rgb} / 0.9)` }}
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
                      className="flex items-center gap-3 rounded-lg tile-dashed px-3 py-2"
                    >
                      <span className="font-display text-[11px] text-muted/50 tabular-nums">
                        {String(seat + 1).padStart(2, "0")}
                      </span>
                      <span className="h-px flex-1 rule" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 h-px overflow-hidden rule">
          <motion.div
            className="h-full"
            style={{ background: `rgb(${identity.rgb})` }}
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 26 }}
          />
        </div>
      </Panel>
    </motion.div>
  );
}

function BenchCard({
  members,
  size,
  active,
  layoutAnimations,
}: {
  members: Member[];
  size: number;
  active: boolean;
  layoutAnimations: boolean;
}) {
  const id = BENCH_IDENTITY;
  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {active && (
        <motion.div
          layoutId="active-team-halo"
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{ boxShadow: `0 0 0 1px rgb(${id.rgb} / 0.45)` }}
        />
      )}
      <Panel accent={id.rgb} className="p-5">
        <header className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-hair text-sm text-muted">
            {id.glyph}
          </span>
          <div className="flex-1">
            <p className="font-display text-base font-medium tracking-wide text-muted">
              {id.name}
            </p>
            <p className="mt-0.5 font-display text-[10px] tracking-luxe text-muted/70 uppercase">
              Substitute
            </p>
          </div>
          <span className="font-display text-sm text-muted tabular-nums">
            {members.length}/{size}
          </span>
        </header>

        <ul className="flex flex-wrap gap-2">
          {Array.from({ length: size }, (_, seat) => {
            const member = members.find((m) => m.seat === seat);
            return member ? (
              <motion.li
                key={member.player.id}
                layoutId={layoutAnimations ? `player-${member.player.id}` : undefined}
                className="tile rounded-lg px-3 py-1.5 text-sm text-ice/85"
              >
                {member.player.name}
              </motion.li>
            ) : (
              <li
                key={`e-${seat}`}
                className="rounded-lg tile-dashed px-5 py-1.5 text-sm text-muted/40"
              >
                —
              </li>
            );
          })}
        </ul>
      </Panel>
    </motion.div>
  );
}
