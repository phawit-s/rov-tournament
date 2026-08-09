"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  matchesByRound,
  roundLabel,
  updateMatch,
  winsNeeded,
} from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate, formatThaiDay } from "@/lib/tournament/share";
import { identityFor } from "@/lib/game";
import { safeUrl } from "@/lib/safe";
import type { Match, Tournament } from "@/lib/tournament/types";
import Crest from "../team/Crest";
import Panel from "../ui/Panel";
import Corners from "../ui/Corners";
import { SeriesPips } from "../ui/hud";
import { ArtCalendar, EmptyState, Input, fromLocalInput, toLocalInput } from "./ui";

/* ---------- นาฬิกากลาง ---------- */

/**
 * ตัวจับเวลาตัวเดียวของทั้งหน้า — ทุกที่ที่ต้องนับถอยหลังมาสมัครที่นี่
 * ใช้ useSyncExternalStore ตามกติกา repo (ห้าม setState ใน useEffect)
 */
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const tickerStore = {
  subscribe(f: () => void) {
    listeners.add(f);
    if (timer === null) {
      now = Date.now();
      timer = setInterval(() => {
        now = Date.now();
        listeners.forEach((l) => l());
      }, 1000);
    }
    return () => {
      listeners.delete(f);
      if (listeners.size === 0 && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
  },
  getSnapshot: () => now,
  /** 0 คงที่เสมอ — getServerSnapshot ต้องไม่คืนค่าใหม่ทุกครั้ง ไม่งั้น React วนไม่จบ */
  getServerSnapshot: () => 0,
};

export function useNow(): number {
  return useSyncExternalStore(
    tickerStore.subscribe,
    tickerStore.getSnapshot,
    tickerStore.getServerSnapshot,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** นับถอยหลังที่เดินจริง ใช้ทั้งการ์ดคิวถัดไปและสถิติ "วันแข่ง" ของหน้าโปรไฟล์ทัวร์ */
export function Countdown({
  iso,
  withSeconds = false,
  className = "",
  passed,
}: {
  iso?: string;
  withSeconds?: boolean;
  className?: string;
  /** ข้อความเมื่อเลยเวลาไปแล้ว */
  passed?: ReactNode;
}) {
  const t = useNow();

  if (!iso) return <span className={className}>—</span>;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return <span className={className}>—</span>;

  // t === 0 คือยังไม่ผูกนาฬิกา (เซิร์ฟเวอร์/ตอน hydrate) เรนเดอร์วันที่นิ่งๆ ไปก่อน
  if (t === 0) return <span className={`num ${className}`}>{formatThaiDate(iso)}</span>;

  const diff = target - t;
  if (diff <= 0) {
    return (
      <span className={`num ${className}`}>{passed ?? formatThaiDate(iso)}</span>
    );
  }

  const total = Math.floor(diff / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const text =
    d > 0
      ? `${d} วัน ${h} ชม. ${m} นาที`
      : withSeconds
        ? `${pad(h)}:${pad(m)}:${pad(s)}`
        : `${h} ชม. ${m} นาที`;

  return <span className={`num ${className}`}>{text}</span>;
}

/* ---------- ตารางแข่ง ---------- */

type Props = { tournament: Tournament; isAdmin: boolean };

/** ตารางแข่ง — คิวถัดไปเป็นการ์ดชูโรง ที่เหลือเป็นไทม์ไลน์เรียงตามวัน */
export default function SchedulePanel({ tournament, isAdmin }: Props) {
  const reduced = useReducedMotion();
  const bracket = tournament.bracket;

  if (!bracket) {
    return (
      <EmptyState
        no="04"
        art={<ArtCalendar />}
        title="ยังไม่มีตารางแข่ง"
        description="ตารางแข่งสร้างจากสายแข่ง — จัดสายก่อนแล้วค่อยมาตั้งเวลากับลิงก์ไลฟ์รายแมตช์"
      />
    );
  }

  const nameOf = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "—") : "รอผู้ชนะ";
  const indexOf = (id: string | null) =>
    id ? tournament.teams.findIndex((t) => t.id === id) : -1;
  const identityOf = (id: string | null) => {
    const i = indexOf(id);
    return i >= 0 ? identityFor(i) : null;
  };

  const patch = (
    matchId: string,
    value: Partial<{ scheduledAt: string; streamUrl: string }>,
  ) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      bracket: t.bracket ? updateMatch(t.bracket, matchId, value) : null,
    }));

  const rounds = matchesByRound(bracket);
  const all = rounds.flat().filter((m) => !m.bye);

  const upcoming = all
    .filter((m) => !m.winnerId && m.a.teamId && m.b.teamId)
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return a.scheduledAt.localeCompare(b.scheduledAt);
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return a.round - b.round || a.order - b.order;
    });
  const next = upcoming[0] ?? null;

  // จัดกลุ่มตามวัน — แมตช์ที่ยังไม่ตั้งเวลาไปรวมกันท้ายสุด
  const groups: { key: string; label: string; items: Match[] }[] = [];
  const sorted = [...all].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) {
      return a.scheduledAt.localeCompare(b.scheduledAt);
    }
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return a.round - b.round || a.order - b.order;
  });
  for (const match of sorted) {
    const key = match.scheduledAt
      ? new Date(match.scheduledAt).toDateString()
      : "tbd";
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(match);
    else {
      groups.push({
        key,
        label: match.scheduledAt
          ? formatThaiDay(match.scheduledAt)
          : "ยังไม่กำหนดเวลา",
        items: [match],
      });
    }
  }

  return (
    <div className="space-y-6">
      {next && (
        <NextUpCard
          match={next}
          totalRounds={bracket.rounds}
          nameOf={nameOf}
          identityOf={identityOf}
        />
      )}

      {groups.length === 0 ? (
        <EmptyState
          no="04"
          art={<ArtCalendar />}
          title="ยังไม่มีแมตช์ที่แข่งได้"
          description="สายนี้มีแต่ BYE — พอมีทีมครบคู่แล้วแมตช์จะขึ้นมาที่นี่เอง"
        />
      ) : (
        <div className="relative">
          {/* เส้นไทม์ไลน์ชิดซ้าย จุดของแต่ละแมตช์เกาะอยู่บนเส้นนี้ */}
          <span
            aria-hidden
            className="rule-v absolute top-2 bottom-2 left-1.75 hidden sm:block"
          />

          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="sticky top-2 z-10 mb-3 flex sm:pl-8">
                  <span className="surface hairline-top num inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs text-ice shadow-lift-1">
                    <span className="slug slug-2">วัน</span>
                    {group.label}
                    <span className="num text-muted">· {group.items.length}</span>
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {group.items.map((match) => (
                    <TimelineRow
                      key={match.id}
                      match={match}
                      totalRounds={bracket.rounds}
                      isNext={next?.id === match.id}
                      isAdmin={isAdmin}
                      reduced={!!reduced}
                      nameOf={nameOf}
                      identityOf={identityOf}
                      onPatch={patch}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- คิวถัดไป ---------- */

function NextUpCard({
  match,
  totalRounds,
  nameOf,
  identityOf,
}: {
  match: Match;
  totalRounds: number;
  nameOf: (id: string | null) => string;
  identityOf: (id: string | null) => ReturnType<typeof identityFor> | null;
}) {
  const live = safeUrl(match.streamUrl);
  const ia = identityOf(match.a.teamId);
  const ib = identityOf(match.b.teamId);

  return (
    <Panel
      variant="feature"
      state="next"
      interactive={false}
      className="relative overflow-hidden p-5 sm:p-7"
    >
      <Corners len={18} o={0.4} />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <p className="slug">คิวถัดไป</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-display text-xs text-muted">
            {roundLabel(match.round, totalRounds)}
          </span>
          <span className="num tile rounded-full px-2.5 py-1 font-display text-[11px] text-iris">
            BO{match.bestOf}
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
        <SideBig identity={ia} name={nameOf(match.a.teamId)} align="right" />

        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full accent-fill font-display text-sm font-medium text-onaccent shadow-[0_10px_28px_-14px_rgba(169,155,255,0.9)] sm:h-14 sm:w-14 sm:text-base">
          VS
        </span>

        <SideBig identity={ib} name={nameOf(match.b.teamId)} align="left" />
      </div>

      <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-4">
        <div className="min-w-0">
          <p className="slug slug-2">เริ่มอีก</p>
          <Countdown
            iso={match.scheduledAt}
            withSeconds
            passed="ถึงเวลาแล้ว"
            className="mt-1 block font-display text-2xl text-iris"
          />
          {match.scheduledAt && (
            <p className="num mt-1 text-xs text-muted">
              {formatThaiDate(match.scheduledAt)}
            </p>
          )}
        </div>

        {live && (
          <a
            href={live}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-live/30 bg-live/12 px-5 font-display text-sm text-live transition-colors hover:bg-live/20"
          >
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-live"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            ดูไลฟ์
          </a>
        )}
      </div>
    </Panel>
  );
}

function SideBig({
  identity,
  name,
  align,
}: {
  identity: ReturnType<typeof identityFor> | null;
  name: string;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : "text-left"
      }`}
      style={identity ? { color: identity.hex } : undefined}
    >
      {identity ? (
        <Crest identity={identity} size={44} className="shrink-0" />
      ) : (
        <span className="rule h-11 w-11 shrink-0 rounded-full" />
      )}
      <p className="min-w-0 flex-1 truncate font-display text-lg text-ice sm:text-2xl">
        {name}
      </p>
    </div>
  );
}

/* ---------- แถวบนไทม์ไลน์ ---------- */

function TimelineRow({
  match,
  totalRounds,
  isNext,
  isAdmin,
  reduced,
  nameOf,
  identityOf,
  onPatch,
}: {
  match: Match;
  totalRounds: number;
  isNext: boolean;
  isAdmin: boolean;
  reduced: boolean;
  nameOf: (id: string | null) => string;
  identityOf: (id: string | null) => ReturnType<typeof identityFor> | null;
  onPatch: (
    matchId: string,
    value: Partial<{ scheduledAt: string; streamUrl: string }>,
  ) => void;
}) {
  const done = !!match.winnerId;
  const need = winsNeeded(match.bestOf);
  const live = safeUrl(match.streamUrl);

  return (
    <li className="relative sm:pl-8">
      {/* จุดบนเส้น: ทึบทอง = จบแล้ว · กลวงเต้น = คิวถัดไป · จาง = ยังไม่ถึง */}
      <span
        aria-hidden
        className="absolute top-6 left-0 hidden h-3.5 w-3.5 sm:grid sm:place-items-center"
      >
        {isNext && !reduced ? (
          <motion.span
            className="block h-3 w-3 rotate-45 border border-iris"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <span
            className="block h-3 w-3 rotate-45"
            style={
              done
                ? { background: "rgb(var(--accent))" }
                : isNext
                  ? { border: "1px solid var(--color-iris)" }
                  : {
                      background: "rgb(var(--hair) / var(--hair-a))",
                      opacity: 0.8,
                    }
            }
          />
        )}
      </span>

      <div
        className={`tile hover-tile rounded-xl px-4 py-3.5 transition-colors ${
          isNext ? "ring-1 ring-iris/25" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="slug slug-2">
            {roundLabel(match.round, totalRounds)} · M{match.order + 1}
          </span>
          <span className="num font-display text-xs text-muted">
            {match.scheduledAt ? formatThaiDate(match.scheduledAt) : "ยังไม่กำหนดเวลา"}
          </span>
        </div>

        <div className="mt-2 grid gap-1.5">
          <RowSide
            match={match}
            side="a"
            need={need}
            nameOf={nameOf}
            identityOf={identityOf}
          />
          <RowSide
            match={match}
            side="b"
            need={need}
            nameOf={nameOf}
            identityOf={identityOf}
          />
        </div>

        {isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
            <Input
              type="datetime-local"
              aria-label="เวลาแข่ง"
              value={toLocalInput(match.scheduledAt)}
              onChange={(e) =>
                onPatch(match.id, {
                  scheduledAt: fromLocalInput(e.target.value) ?? "",
                })
              }
              className="w-52"
            />
            <Input
              value={match.streamUrl ?? ""}
              aria-label="ลิงก์ไลฟ์แมตช์นี้"
              onChange={(e) => onPatch(match.id, { streamUrl: e.target.value.trim() })}
              placeholder="ลิงก์ไลฟ์แมตช์นี้"
              className="w-56"
            />
          </div>
        ) : (
          live && (
            <a
              href={live}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1.5 font-display text-xs text-iris underline-offset-2 hover:underline"
            >
              ดูไลฟ์แมตช์นี้
            </a>
          )
        )}
      </div>
    </li>
  );
}

function RowSide({
  match,
  side,
  need,
  nameOf,
  identityOf,
}: {
  match: Match;
  side: "a" | "b";
  need: number;
  nameOf: (id: string | null) => string;
  identityOf: (id: string | null) => ReturnType<typeof identityFor> | null;
}) {
  const self = match[side];
  const isWinner = !!match.winnerId && match.winnerId === self.teamId;
  const isLoser = !!match.winnerId && !isWinner && !!self.teamId;
  const identity = identityOf(self.teamId);

  return (
    <div
      className={`flex items-center gap-2 ${isLoser ? "state-out" : ""}`}
      style={
        {
          ["--st"]: isWinner
            ? "var(--st-win)"
            : isLoser
              ? "var(--st-out)"
              : "var(--st-idle)",
        } as CSSProperties
      }
    >
      {identity ? (
        <Crest identity={identity} size={18} className="shrink-0" />
      ) : (
        <span className="rule h-4.5 w-4.5 shrink-0 rounded-full" />
      )}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          isWinner ? "text-ice" : "text-ice/80"
        }`}
      >
        {nameOf(self.teamId)}
      </span>
      <SeriesPips need={need} score={self.score} align="right" />
      <span
        className={`num w-4 shrink-0 text-right font-display text-sm ${
          isWinner ? "text-iris" : "text-muted"
        }`}
      >
        {self.score}
      </span>
    </div>
  );
}
