"use client";

import type { Variants } from "motion/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BENCH_IDENTITY } from "@/lib/game";
import type { BuiltTeam, Member } from "@/lib/types";
import Panel from "./ui/Panel";
import Corners from "./ui/Corners";
import Crest from "./team/Crest";

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
  /** หน่วงการเปิดการ์ดทีละใบ (วินาทีต่อหนึ่งใบ) — หน้าผลลัพธ์ใช้ให้ไล่เป็นระลอก */
  stagger?: number;
  /** ใบที่พิธีปิดกำลังไล่ไฟอยู่ (-1 หรือ null = ไม่มี) */
  flashIndex?: number | null;
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
  stagger = 0,
  flashIndex = null,
}: Props) {
  // มีตัวเอกอยู่บนกระดานเมื่อไหร่ ใบอื่นถึงจะถอยลงเป็นฉากหลัง
  const hasFocus = activeTeamIndex !== null || activeIsBench;

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
          dim={hasFocus && activeTeamIndex !== team.index}
          flash={flashIndex === team.index}
          onRename={onRenameTeam}
          layoutAnimations={layoutAnimations}
          delay={team.index * stagger}
        />
      ))}

      {benchCount > 0 && (
        <BenchCard
          members={bench}
          size={benchCount}
          active={activeIsBench}
          dim={hasFocus && !activeIsBench}
          flash={flashIndex === teams.length}
          layoutAnimations={layoutAnimations}
          delay={teams.length * stagger}
        />
      )}
    </div>
  );
}

/* ---------- พิธีล็อกทีม: ขอบวาบ → ประทับตรา → ไล่ผนึกที่นั่ง ---------- */

const FLASH: Variants = {
  open: { opacity: 0 },
  locked: { opacity: [0, 1, 0], transition: { duration: 0.14, times: [0, 0.35, 1] } },
};

const STAMP: Variants = {
  open: { opacity: 0, scale: 1.3 },
  locked: {
    opacity: 0.12,
    scale: 1,
    transition: { delay: 0.16, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

const SEAL: Variants = {
  open: { opacity: 0 },
  locked: (seat: number) => ({
    opacity: [0, 1, 0],
    transition: { duration: 0.42, delay: 0.2 + seat * 0.06, times: [0, 0.3, 1] },
  }),
};

/** ป้ายคิวถัดไปที่เดินทางไปพร้อมกับวงแสง */
function NextTag() {
  return (
    <span className="surface slug absolute -top-2 left-4 rounded-full px-2 py-0.5 text-[9px]">
      Next
    </span>
  );
}

function TeamCard({
  team,
  label,
  active,
  dim,
  flash,
  onRename,
  layoutAnimations,
  delay,
}: {
  team: BuiltTeam;
  label: string;
  active: boolean;
  dim: boolean;
  flash: boolean;
  onRename?: (index: number, name: string) => void;
  layoutAnimations: boolean;
  delay: number;
}) {
  const { identity, members, size } = team;
  const displayName = label || identity.name;
  const reduced = useReducedMotion();

  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 28, delay }}
      className="relative"
    >
      {active && (
        <motion.div
          layoutId="active-team-halo"
          className="pointer-events-none absolute -inset-px z-10 rounded-2xl"
          style={{
            boxShadow: `0 0 0 1px rgb(${identity.rgb} / 0.5), 0 20px 60px -30px rgb(${identity.rgb} / 0.8)`,
          }}
          transition={{ type: "spring", stiffness: 240, damping: 30 }}
        >
          <NextTag />
        </motion.div>
      )}

      <Panel
        accent={identity.rgb}
        // ใบที่ไม่ใช่ตัวเอกถอยลงเป็นฉากหลัง — ใส่ที่ Panel ไม่ใช่ที่ motion.div
        // เพราะ motion เขียน opacity เป็น inline style ทับคลาสเสมอ
        className={`tally overflow-hidden p-5 transition-[opacity,filter] duration-500 ${
          dim ? "opacity-[0.72] saturate-[0.85]" : ""
        }`}
        style={{ ["--st" as string]: identity.rgb }}
      >
        {/* มุมกล้องเฉพาะใบที่กำลังจะได้คนถัดไป — ที่เหลือปล่อยเรียบ */}
        {active && <Corners len={14} o={0.55} />}

        {/* ไฟที่พิธีปิดไล่มาทีละใบ */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            // เงาต้องเป็น inset ทั้งหมด เพราะการ์ดตั้ง overflow-hidden ไว้กันตราประทับล้น
            boxShadow: `inset 0 0 0 1px rgb(${identity.rgb} / 0.9), inset 0 0 40px -8px rgb(${identity.rgb})`,
          }}
          animate={{ opacity: flash ? 1 : 0 }}
          transition={{ duration: 0.12 }}
        />

        <motion.div
          initial={false}
          animate={team.isFull ? "locked" : "open"}
          className="relative"
        >
          {/* ขอบวาบตอนทีมเต็มพอดี */}
          {!reduced && (
            <motion.span
              aria-hidden
              variants={FLASH}
              className="pointer-events-none absolute -inset-5 rounded-2xl"
              style={{
                boxShadow: `inset 0 0 0 2px rgb(${identity.rgb}), inset 0 0 60px -10px rgb(${identity.rgb})`,
              }}
            />
          )}

          {/* ตราประทับหลังการ์ด บอกว่าล็อกรายชื่อแล้ว */}
          <motion.span
            aria-hidden
            variants={STAMP}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span
              className="-rotate-8 font-display text-base font-semibold tracking-luxe whitespace-nowrap uppercase"
              style={{ color: identity.hex }}
            >
              Roster Locked
            </span>
          </motion.span>

          <header className="mb-4 flex items-center gap-3">
            <Crest identity={identity} size={36} showShort className="shrink-0" />

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
              <p className="slug mt-1">Team {String(team.index + 1).padStart(2, "0")}</p>
            </div>

            <span
              className="num shrink-0 font-display text-sm"
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
                        <span className="num font-display text-[11px] text-muted">
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
                        <span className="num font-display text-[11px] text-muted/50">
                          {String(seat + 1).padStart(2, "0")}
                        </span>
                        <span className="rule h-px flex-1" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ผนึกที่นั่งไล่ทีละแถวหลังทีมเต็ม */}
                  {!reduced && (
                    <motion.span
                      aria-hidden
                      variants={SEAL}
                      custom={seat}
                      className="pointer-events-none absolute inset-0 rounded-lg"
                      style={{ background: `rgb(${identity.rgb} / 0.35)` }}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {/* จุดที่นั่ง 1 จุดต่อ 1 ช่อง — อ่านความคืบหน้าได้โดยไม่ต้องนับตัวเลข */}
          <div className="mt-4 flex flex-wrap items-center gap-1">
            {Array.from({ length: size }, (_, seat) => {
              const taken = members.some((m) => m.seat === seat);
              return (
                <span
                  key={seat}
                  className={`h-1.5 w-4 rounded-full ${taken ? "" : "rule"}`}
                  style={
                    taken ? { background: `rgb(${identity.rgb} / 0.85)` } : undefined
                  }
                />
              );
            })}
          </div>
        </motion.div>
      </Panel>
    </motion.div>
  );
}

function BenchCard({
  members,
  size,
  active,
  dim,
  flash,
  layoutAnimations,
  delay,
}: {
  members: Member[];
  size: number;
  active: boolean;
  dim: boolean;
  flash: boolean;
  layoutAnimations: boolean;
  delay: number;
}) {
  const id = BENCH_IDENTITY;

  return (
    <motion.div
      layout={layoutAnimations}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 28, delay }}
      className="relative"
    >
      {active && (
        <motion.div
          layoutId="active-team-halo"
          className="pointer-events-none absolute -inset-px z-10 rounded-2xl"
          style={{ boxShadow: `0 0 0 1px rgb(${id.rgb} / 0.45)` }}
        >
          <NextTag />
        </motion.div>
      )}

      <Panel
        accent={id.rgb}
        className={`tally overflow-hidden p-5 transition-[opacity,filter] duration-500 ${
          dim ? "opacity-[0.72] saturate-[0.85]" : ""
        }`}
        style={{ ["--st" as string]: id.rgb }}
      >
        {active && <Corners len={14} o={0.45} />}

        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: `inset 0 0 0 1px rgb(${id.rgb} / 0.8)` }}
          animate={{ opacity: flash ? 1 : 0 }}
          transition={{ duration: 0.12 }}
        />

        <header className="mb-4 flex items-center gap-3">
          <Crest identity={id} size={36} showShort className="shrink-0 opacity-70" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-medium tracking-wide text-muted">
              {id.name}
            </p>
            <p className="slug slug-2 mt-1">Substitute</p>
          </div>
          <span className="num shrink-0 font-display text-sm text-muted">
            {members.length}
            <span className="text-muted/70">/{size}</span>
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
