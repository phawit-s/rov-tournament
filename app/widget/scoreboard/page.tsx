"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { currentMatch, roundLabel, winsNeeded } from "@/lib/tournament/bracket";
import { identityFor } from "@/lib/game";
import type { TeamIdentity } from "@/lib/types";
import Crest from "@/components/team/Crest";
import { SeriesPips } from "@/components/ui/hud";
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
        <WidgetHint title="ยังไม่มีแมตช์ให้แสดง">
          ตรวจลิงก์ว่ามี <code>#c=</code> หรือ <code>#t=</code> ครบไหม
          และต้องจัดสายแข่งแล้ว
        </WidgetHint>
      </WidgetShell>
    );
  }

  const teamOf = (id: string | null) => {
    if (!id) return null;
    const index = tournament.teams.findIndex((t) => t.id === id);
    return index < 0 ? null : { entry: tournament.teams[index], identity: identityFor(index) };
  };

  const a = teamOf(match.a.teamId);
  const b = teamOf(match.b.teamId);
  const need = winsNeeded(match.bestOf);

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="bar" className="w-160 px-6 py-4">
        <div className="mb-3 flex items-center justify-between gap-6">
          <span className="slug">{roundLabel(match.round, bracket.rounds)}</span>
          <span
            className="num rounded-full px-2.5 py-0.5 font-display text-[11px] tracking-[0.2em] text-white/70 uppercase"
            style={{ boxShadow: `inset 0 0 0 1px ${accent}44`, background: `${accent}12` }}
          >
            BO{match.bestOf}
          </span>
        </div>

        <div className="flex items-stretch gap-3">
          <Side
            name={a?.entry.name ?? "TBD"}
            identity={a?.identity}
            align="right"
            accent={accent}
            need={need}
            score={match.a.score}
            winner={match.winnerId === match.a.teamId}
          />

          <div className="flex shrink-0 items-center gap-3">
            <Score value={match.a.score} accent={accent} lead={match.a.score > match.b.score} />
            {/* ตัวคั่นเป็นเส้นตั้งไล่เฉด อ่านง่ายกว่าเครื่องหมาย : ที่ลอยอยู่กลางอากาศ */}
            <span
              className="block h-14 w-px"
              style={{
                background:
                  "linear-gradient(180deg, transparent, rgb(255 255 255 / 0.35), transparent)",
              }}
            />
            <Score value={match.b.score} accent={accent} lead={match.b.score > match.a.score} />
          </div>

          <Side
            name={b?.entry.name ?? "TBD"}
            identity={b?.identity}
            align="left"
            accent={accent}
            need={need}
            score={match.b.score}
            winner={match.winnerId === match.b.teamId}
          />
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="rule h-px flex-1" />
          <span className="slug text-white/40">{tournament.name}</span>
          <span className="rule h-px flex-1" />
        </div>

        <WinnerFlash
          accent={accent}
          winnerId={match.winnerId}
          name={
            match.winnerId === match.a.teamId
              ? (a?.entry.name ?? "")
              : (b?.entry.name ?? "")
          }
        />
      </WidgetCard>
    </WidgetShell>
  );
}

/** ฝั่งทีมเป็นแผ่นเฉียง มุมด้านในเว้าเข้าหาสกอร์ ให้สายตาไหลเข้ากลาง */
function Side({
  name,
  identity,
  align,
  accent,
  need,
  score,
  winner,
}: {
  name: string;
  identity?: TeamIdentity;
  align: "left" | "right";
  accent: string;
  need: number;
  score: number;
  winner: boolean;
}) {
  const toRight = align === "right";
  const clip = toRight
    ? "polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)"
    : "polygon(16px 0, 100% 0, 100% 100%, 0 100%)";

  return (
    <div
      className={`relative flex min-w-0 flex-1 items-center gap-3 px-4 py-2 ${
        toRight ? "flex-row-reverse" : ""
      }`}
      style={{
        clipPath: clip,
        background: toRight
          ? `linear-gradient(90deg, transparent, ${accent}14)`
          : `linear-gradient(270deg, transparent, ${accent}14)`,
      }}
    >
      {/* แถบสีทีมที่ขอบนอก — สีนี้คือสีเดียวกับที่ใช้ในสายแข่งและรูป export */}
      <span
        className={`absolute inset-y-0 w-0.75 ${toRight ? "left-0" : "right-0"}`}
        style={{
          background: identity
            ? `linear-gradient(180deg, rgb(${identity.rgb} / 0.9), rgb(${identity.rgb} / 0.35))`
            : "rgb(255 255 255 / 0.15)",
        }}
      />

      {identity && <Crest identity={identity} size={28} className="shrink-0" />}

      <div className={`min-w-0 flex-1 ${toRight ? "text-right" : "text-left"}`}>
        <p
          className={`truncate font-display text-2xl leading-tight ${
            winner ? "text-white" : "text-white/85"
          }`}
          style={winner ? { textShadow: `0 0 18px ${accent}8c` } : undefined}
        >
          {name}
        </p>
        <span className={`mt-1.5 flex ${toRight ? "justify-end" : "justify-start"}`}>
          <SeriesPips
            need={need}
            score={score}
            align={toRight ? "right" : "left"}
            rgb={identity ? identity.rgb : undefined}
          />
        </span>
      </div>
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
    <div className="relative grid h-19 w-16 place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: -26, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 26, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="fig num text-[76px]"
          style={{
            color: lead ? accent : "#fff",
            textShadow: lead ? `0 0 34px ${accent}66` : undefined,
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** วาบสีเน้นหนึ่งครั้งตอนรู้ผล แล้วค้างแถบผู้ชนะไว้ — key ทำให้เล่นรอบเดียวต่อผู้ชนะหนึ่งคน */
function WinnerFlash({
  winnerId,
  name,
  accent,
}: {
  winnerId: string | null;
  name: string;
  accent: string;
}) {
  const reduced = useReducedMotion();
  if (!winnerId) return null;

  return (
    <>
      {!reduced && (
        <motion.span
          key={`flash-${winnerId}`}
          className="pointer-events-none absolute inset-0"
          style={{ background: accent }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.22, 0] }}
          transition={{ duration: 0.9, ease: "easeOut", times: [0, 0.25, 1] }}
        />
      )}
      <motion.div
        key={`bar-${winnerId}`}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 flex items-center justify-center gap-2 rounded-lg py-1.5"
        style={{ background: `${accent}18`, boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        <span className="slug">ผู้ชนะ</span>
        <span className="font-display text-sm text-white">{name}</span>
      </motion.div>
    </>
  );
}
