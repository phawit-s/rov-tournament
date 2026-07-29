"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { roundLabel, upcomingMatches } from "@/lib/tournament/bracket";
import type { Match } from "@/lib/tournament/types";
import type { TeamIdentity } from "@/lib/types";
import { identityFor } from "@/lib/game";
import { formatThaiDate } from "@/lib/tournament/share";
import Crest from "@/components/team/Crest";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/** คิวแมตช์ถัดไป เอาไว้ขึ้นช่วงพักหรือมุมจอ */
export default function UpNextWidget() {
  const { tournament } = useLiveTournament();
  const { accent } = useWidgetOptions();
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  // เดินนาฬิกาเองเพื่อให้บรรทัด "อีก 12 นาที" ของคิวแรกไม่ค้างอยู่กับเวลาที่เปิดหน้า
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const bracket = tournament?.bracket ?? null;
  const all = upcomingMatches(bracket, 99);
  const list = all.slice(0, 4);

  if (!tournament || !bracket || list.length === 0) {
    return (
      <WidgetShell>
        <WidgetHint title="ยังไม่มีแมตช์ที่รอแข่ง">
          เมื่อจัดสายแล้วและยังมีคู่ที่ยังไม่กรอกผล คิวจะขึ้นที่นี่เอง
        </WidgetHint>
      </WidgetShell>
    );
  }

  const teamOf = (id: string | null) => {
    if (!id) return null;
    const index = tournament.teams.findIndex((t) => t.id === id);
    return index < 0
      ? null
      : { name: tournament.teams[index].name, identity: identityFor(index) };
  };

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="bar" className="w-140 px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="slug">คิวถัดไป</p>
          <p className="num text-[11px] text-white/35">
            เหลือทั้งหมด {all.length} แมตช์
          </p>
        </div>
        <span className="rule mt-2 mb-3 block h-px" />

        <ul className="space-y-2">
          {list.map((match, i) => {
            const a = teamOf(match.a.teamId);
            const b = teamOf(match.b.teamId);
            const round = roundLabel(match.round, bracket.rounds);

            return (
              <motion.li
                key={match.id}
                initial={reduced ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                {i === 0 ? (
                  <HeroRow
                    match={match}
                    round={round}
                    accent={accent}
                    a={a}
                    b={b}
                    now={now}
                    reduced={!!reduced}
                  />
                ) : (
                  <CompactRow
                    match={match}
                    round={round}
                    accent={accent}
                    a={a}
                    b={b}
                    order={i + 1}
                  />
                )}
              </motion.li>
            );
          })}
        </ul>
      </WidgetCard>
    </WidgetShell>
  );
}

type SideInfo = { name: string; identity: TeamIdentity } | null;

/** คิวแรกคือของที่คนดูต้องรู้จริง เลยได้พื้นที่เป็นการ์ดเต็มใบ */
function HeroRow({
  match,
  round,
  accent,
  a,
  b,
  now,
  reduced,
}: {
  match: Match;
  round: string;
  accent: string;
  a: SideInfo;
  b: SideInfo;
  now: number;
  reduced: boolean;
}) {
  const countdown = match.scheduledAt ? untilText(match.scheduledAt, now) : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl px-4 py-4"
      style={{
        background: `linear-gradient(90deg, ${accent}1f, ${accent}0a)`,
        boxShadow: `inset 0 0 0 1px ${accent}55`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-0.75"
        style={{
          background: a
            ? `linear-gradient(180deg, rgb(${a.identity.rgb} / 0.95), rgb(${a.identity.rgb} / 0.3))`
            : accent,
        }}
      />

      <div className="flex items-center justify-between gap-3">
        <span
          className="slug rounded-full px-2 py-0.5"
          style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}66` }}
        >
          ถัดไป
        </span>
        <span className="flex items-center gap-2">
          <span className="font-display text-[11px] tracking-[0.2em] text-white/50 uppercase">
            {round}
          </span>
          <BoChip bestOf={match.bestOf} accent={accent} />
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <TeamLine side={a} align="left" />
        <VsDot accent={accent} reduced={reduced} />
        <TeamLine side={b} align="right" />
      </div>

      {(countdown || match.scheduledAt) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="num text-[11px] text-white/40">
            {match.scheduledAt ? formatThaiDate(match.scheduledAt) : ""}
          </span>
          {countdown && (
            <span className="num font-display text-sm" style={{ color: accent }}>
              {countdown}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** คิวรองลงมาเตี้ยลง เหลือแค่ข้อมูลที่ต้องกวาดตาผ่าน */
function CompactRow({
  match,
  round,
  accent,
  a,
  b,
  order,
}: {
  match: Match;
  round: string;
  accent: string;
  a: SideInfo;
  b: SideInfo;
  order: number;
}) {
  return (
    <div className="tile flex items-center gap-3 rounded-lg px-3 py-1.5">
      <span className="fig w-7 shrink-0 text-lg text-white/25">
        {String(order).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm text-white/90">
          {a?.name ?? "TBD"}
          <span className="mx-2 inline-block h-1.5 w-1.5 rotate-45 align-middle" style={{ background: `${accent}80` }} />
          {b?.name ?? "TBD"}
        </p>
        <p className="num text-eyebrow text-white/35">
          {round}
          {match.scheduledAt ? ` · ${formatThaiDate(match.scheduledAt)}` : ""}
        </p>
      </div>

      <BoChip bestOf={match.bestOf} accent={accent} />
    </div>
  );
}

function TeamLine({ side, align }: { side: SideInfo; align: "left" | "right" }) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {side && <Crest identity={side.identity} size={24} className="shrink-0" />}
      <p
        className={`min-w-0 flex-1 truncate font-display text-xl text-white ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {side?.name ?? "TBD"}
      </p>
    </div>
  );
}

/** แทนคำว่า vs ด้วยข้าวหลามตัด ภาษาเดียวกับเม็ดคะแนนในสกอร์บอร์ด */
function VsDot({ accent, reduced }: { accent: string; reduced: boolean }) {
  if (reduced) {
    return (
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rotate-45"
        style={{ background: `${accent}80` }}
      />
    );
  }
  return (
    <motion.span
      className="inline-block h-1.5 w-1.5 shrink-0"
      style={{ background: `${accent}b3` }}
      animate={{ rotate: [45, 135, 45] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function BoChip({ bestOf, accent }: { bestOf: number; accent: string }) {
  return (
    <span
      className="num shrink-0 rounded-full px-2 py-0.5 font-display text-eyebrow tracking-[0.16em] text-white/70 uppercase"
      style={{ background: `${accent}12`, boxShadow: `inset 0 0 0 1px ${accent}40` }}
    >
      BO{bestOf}
    </span>
  );
}

/** "อีก 12 นาที" — เวลาที่คนดูใช้จริง ไม่ใช่วันที่เต็มที่ต้องคิดต่อเอง */
function untilText(iso: string, now: number): string | null {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = target - now;
  if (diff <= 0) return "ถึงเวลาแล้ว";

  const min = Math.floor(diff / 60_000);
  if (min < 1) return `อีก ${Math.ceil(diff / 1000)} วินาที`;
  if (min < 60) return `อีก ${min} นาที`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `อีก ${hours} ชม. ${min % 60} นาที`;
  return `อีก ${Math.floor(hours / 24)} วัน`;
}
