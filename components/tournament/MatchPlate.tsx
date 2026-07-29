"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { winsNeeded } from "@/lib/tournament/bracket";
import { identityFor } from "@/lib/game";
import { safeUrl } from "@/lib/safe";
import type { Match } from "@/lib/tournament/types";
import Crest from "../team/Crest";
import Panel from "../ui/Panel";
import { SeriesPips } from "../ui/hud";
import { LiveBadge } from "./ui";

/**
 * ความสูงคงที่ของแผ่นแมตช์ — BracketCanvas ใช้ค่านี้คำนวณตำแหน่ง y
 * ถ้าการ์ดสูงไม่เท่ากัน แมตช์รอบหลังจะไม่อยู่กึ่งกลางของสองแมตช์ต้นทางพอดี
 */
export const PLATE_H = 144;
export const PLATE_GAP = 26;
export const PLATE_W = 288;
export const PLATE_W_FINAL = 320;

export type PlateHooks = {
  nameOf: (id: string | null) => string | null;
  indexOf: (id: string | null) => number;
  isAdmin: boolean;
  onScore: (matchId: string, a: number, b: number) => void;
  /** ทีมที่เมาส์ชี้อยู่ — ใช้ไล่ไฟทั้งเส้นทางสู่แชมป์พร้อมกัน */
  hoverTeamId?: string | null;
  onHoverTeam?: (id: string | null) => void;
};

type Props = PlateHooks & {
  match: Match;
  variant?: "default" | "final";
  /** ชื่อแชมป์ ใช้แปะใต้การ์ดรอบชิงเท่านั้น */
  championName?: string | null;
  className?: string;
};

/** เวลาแบบสั้น พอให้รู้ว่าวันไหนกี่โมง ไม่กินความกว้างการ์ด */
function shortTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ลอเรลเส้นบาง วางเหนือฝั่งที่ชนะในนัดชิง */
function Laurel({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M60 36c-14 0-24-8-28-20M60 36c14 0 24-8 28-20" />
      <path d="M34 20c-5-1-8-4-9-8M38 26c-5 0-9-2-11-6M44 31c-5 1-9 0-12-3" />
      <path d="M86 20c5-1 8-4 9-8M82 26c5 0 9-2 11-6M76 31c5 1 9 0 12-3" />
      <path d="M60 8v6M56 11l4-4 4 4" />
    </svg>
  );
}

/**
 * แผ่นแมตช์ — ริบบิ้นหัวการ์ดบอกลำดับ/เวลา/ไลฟ์ แล้วสองฝั่งใช้ขีดสีตามสถานะ
 * แยกออกจาก MatchCard เดิมเพราะรอบชิงต้องหน้าตาต่างจากรอบ 16 ทีม
 */
export default function MatchPlate({
  match,
  variant = "default",
  championName,
  className = "",
  ...hooks
}: Props) {
  const need = winsNeeded(match.bestOf);
  const done = !!match.winnerId;
  const isFinal = variant === "final";
  const time = shortTime(match.scheduledAt);
  const live = safeUrl(match.streamUrl);

  // ทีมที่เมาส์ชี้อยู่มีอยู่ในแมตช์นี้ไหม — ใช้ยกการ์ดทั้งใบให้เด่นขึ้น
  const lit =
    !!hooks.hoverTeamId &&
    (match.a.teamId === hooks.hoverTeamId || match.b.teamId === hooks.hoverTeamId);

  return (
    <div className={`relative ${className}`}>
      {isFinal && (
        <div className="pointer-events-none absolute inset-x-0 -top-9 text-center">
          <span className="slug">Final</span>
          <span className="mt-1.5 block h-0.5 bg-[linear-gradient(90deg,transparent,rgb(var(--accent)/.85),transparent)]" />
        </div>
      )}

      <Panel
        variant={isFinal ? "feature" : "plain"}
        interactive={false}
        accent={done ? "207 167 101" : "155 160 179"}
        className={`relative overflow-hidden p-3 transition-[box-shadow,opacity] duration-300 ${
          match.bye ? "opacity-60" : ""
        } ${lit ? "shadow-lift-3" : ""}`}
        style={{ height: PLATE_H }}
      >
        {/* ริบบิ้นหัวการ์ด — ข้อมูลที่ SchedulePanel กรอกไว้แต่เดิมหายไปจากสาย */}
        <div className="relative z-10 flex h-6 items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            {live ? (
              <LiveBadge url={match.streamUrl ?? ""} />
            ) : time ? (
              <span className="num font-display text-[11px] text-muted">{time}</span>
            ) : (
              <span className="slug slug-2">
                {match.bye ? "bye" : `BO${match.bestOf}`}
              </span>
            )}
          </span>
          <span className="fig text-outline shrink-0 text-lg leading-none">
            M{match.order + 1}
          </span>
        </div>

        {isFinal && done && (
          <Laurel
            className={`pointer-events-none absolute inset-x-0 h-9 w-24 text-champagne/25 ${
              match.winnerId === match.a.teamId ? "top-7" : "bottom-6"
            } mx-auto`}
          />
        )}

        <div className="relative z-10 mt-1">
          <Side side="a" match={match} need={need} {...hooks} />
          <div className="my-1 flex items-center gap-2">
            <span className="rule h-px flex-1" />
            <span className="slug slug-2">
              {match.bye ? "bye" : `BO${match.bestOf}`}
            </span>
            <span className="rule h-px flex-1" />
          </div>
          <Side side="b" match={match} need={need} {...hooks} />
        </div>
      </Panel>

      {isFinal && championName && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-x-0 -bottom-16 text-center"
        >
          <span className="slug">Champion</span>
          <p className="fig mt-1 truncate text-3xl">
            <span className="text-gold-grad">{championName}</span>
          </p>
        </motion.div>
      )}
    </div>
  );
}

function Side({
  side,
  match,
  need,
  nameOf,
  indexOf,
  isAdmin,
  onScore,
  hoverTeamId,
  onHoverTeam,
}: PlateHooks & { side: "a" | "b"; match: Match; need: number }) {
  const self = match[side];
  const name = nameOf(self.teamId);
  const isWinner = !!match.winnerId && match.winnerId === self.teamId;
  const isLoser = !!match.winnerId && !isWinner && !!self.teamId;
  const idx = indexOf(self.teamId);
  const identity = idx >= 0 ? identityFor(idx) : null;
  const state = isWinner ? "win" : isLoser ? "out" : "idle";
  const lit = !!hoverTeamId && hoverTeamId === self.teamId;

  const bump = (delta: number) => {
    const next = Math.max(0, Math.min(need, self.score + delta));
    onScore(
      match.id,
      side === "a" ? next : match.a.score,
      side === "b" ? next : match.b.score,
    );
  };

  const canEdit = isAdmin && !!match.a.teamId && !!match.b.teamId && !match.bye;

  return (
    <div
      onPointerEnter={() => onHoverTeam?.(self.teamId)}
      onPointerLeave={() => onHoverTeam?.(null)}
      className={`tally relative flex items-center gap-2 rounded-lg py-1.5 pr-1 pl-2.5 transition-colors duration-200 ${
        isLoser ? "state-out" : ""
      } ${lit ? "bg-[rgb(var(--accent)/.10)]" : ""}`}
      style={{ ["--st"]: `var(--st-${state})` } as CSSProperties}
    >
      {identity ? (
        <Crest identity={identity} size={20} className="shrink-0" />
      ) : (
        <span className="grid h-5 w-5 shrink-0 place-items-center text-xs text-muted/40">
          ·
        </span>
      )}

      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          name ? "text-ice" : "text-muted/60 italic"
        }`}
      >
        {name ?? "รอผู้ชนะ"}
      </span>

      {canEdit && (
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label="ลดคะแนน"
            onClick={() => bump(-1)}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded text-xs text-muted transition-colors hover:text-ice"
          >
            −
          </button>
          <button
            type="button"
            aria-label="เพิ่มคะแนน"
            onClick={() => bump(1)}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded text-xs text-muted transition-colors hover:text-champagne"
          >
            +
          </button>
        </span>
      )}

      {!match.bye && (
        <SeriesPips need={need} score={self.score} align="right" />
      )}

      <motion.span
        key={self.score}
        initial={{ y: -4, opacity: 0.4 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22 }}
        className={`num w-4 shrink-0 text-right font-display text-base ${
          isWinner ? "text-champagne" : "text-muted"
        }`}
      >
        {match.bye && !self.teamId ? "" : self.score}
      </motion.span>
    </div>
  );
}
