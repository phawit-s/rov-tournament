"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { identityFor } from "@/lib/game";
import { safeImageSrc } from "@/lib/safe";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { formatThaiDay } from "@/lib/tournament/share";
import type { Tournament, TournamentStatus } from "@/lib/tournament/types";
import Crest from "../team/Crest";
import TiltCard from "../fx/TiltCard";
import Panel from "../ui/Panel";
import { Meter } from "../ui/hud";
import { LiveBadge, STATUS_META, StatusBadge } from "./ui";

/** สถานะทัวร์ -> ไฟสถานะของการ์ด เพื่อให้ทั้งเว็บใช้สีบอกสถานะเป็นภาษาเดียวกัน */
const CARD_STATE: Record<TournamentStatus, "idle" | "next" | "live" | "win"> = {
  draft: "idle",
  registration: "next",
  ready: "next",
  running: "live",
  finished: "win",
};

type Props = {
  tournament: Tournament;
  /** ปลายทางเมื่อกดการ์ด — ไม่ส่ง = โหมดพรีวิว กดไม่ได้ */
  href?: string;
  /** ปุ่มท้ายการ์ด (เปิดดู / เมนู ⋯) */
  actions?: ReactNode;
  /**
   * โหมดพรีวิวในฟอร์ม — ปิดการเอียงตามเมาส์และปิดลิงก์
   * เพราะการ์ดตัวนี้ถูกวางในคอลัมน์ sticky ที่ผู้ใช้กำลังพิมพ์อยู่ ไม่ควรขยับ
   */
  preview?: boolean;
  className?: string;
};

/**
 * การ์ดทัวร์นาเมนต์ทรงตั๋วงาน — แผ่นวันที่ทับมุมปก แถบความจุทีม และแถวตราทีมที่สมัครแล้ว
 * แยกออกจาก TournamentsView เพื่อให้ TournamentForm เอาไปทำพรีวิวสดได้ด้วยข้อมูลชุดเดียวกัน
 */
export default function TournamentCard({
  tournament,
  href,
  actions,
  preview = false,
  className = "",
}: Props) {
  const prize = calcPrizes(tournament.prize);
  const top = prize.breakdown[0];
  const teams = tournament.teams;
  const max = tournament.maxTeams;
  const full = max > 0 && teams.length >= max;
  const rest = Math.max(0, teams.length - 5);

  const start = tournament.startAt ? new Date(tournament.startAt) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;

  const name = tournament.name.trim() || "ทัวร์นาเมนต์ไม่มีชื่อ";

  const card = (
    <Panel
      state={CARD_STATE[tournament.status]}
      interactive={!preview}
      className={`group flex h-full flex-col p-0 ${className}`}
    >
      {/* ---- ปก + แผ่นวันที่แบบตั๋ว ----
          ตัดขอบเฉพาะกล่องปก ไม่ใช่ทั้งการ์ด เพื่อให้แถวปุ่มด้านล่างกางเมนูออกมาได้ */}
      <div className="relative overflow-hidden rounded-t-2xl">
        <Wrap href={href} className="block">
          {tournament.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeImageSrc(tournament.cover) ?? ""}
              alt=""
              className="h-32 w-full object-cover opacity-90 transition-opacity duration-500 group-hover:opacity-100"
            />
          ) : (
            <div className="relative h-24 w-full overflow-hidden bg-[linear-gradient(120deg,rgb(var(--accent)/0.18),transparent_68%)]">
              {/* ไม่มีรูปปกก็ยังต้องมีของให้ดู — ใช้อักษรแรกของชื่อเป็นลายน้ำ */}
              <span className="fig text-outline pointer-events-none absolute -bottom-3 left-4 text-6xl opacity-40 select-none">
                {name.slice(0, 2).toUpperCase()}
              </span>
              <span className="rule absolute inset-x-0 bottom-0 block h-px" />
            </div>
          )}
        </Wrap>

        {validStart && (
          <span className="surface pointer-events-none absolute top-3 right-3 grid w-16 place-items-center rounded-xl px-1 py-2 text-center shadow-lift-1">
            <span className="fig num block text-4xl text-ice">
              {validStart.getDate()}
            </span>
            <span className="slug slug-2 mt-1 block">
              {validStart.toLocaleDateString("th-TH", { month: "short" })}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={tournament.status} />
          {tournament.live.isLive && tournament.live.url && (
            <LiveBadge url={tournament.live.url} />
          )}
        </div>

        <Wrap href={href}>
          <h3 className="font-display text-lg leading-snug font-medium text-balance text-ice transition-colors group-hover:text-iris">
            {name}
          </h3>
        </Wrap>
        {tournament.tagline && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{tournament.tagline}</p>
        )}

        {/* ---- ความจุทีม ---- */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="slug slug-2">ทีมที่รับแล้ว</span>
            <span
              className="num font-display text-sm"
              style={{ color: full ? STATUS_META.ready.hex : "var(--color-ice)" }}
            >
              {teams.length}
              {max > 0 ? (
                <span className="text-muted">/{max}</span>
              ) : (
                <span className="ml-1 text-xs text-muted">ไม่จำกัด</span>
              )}
            </span>
          </div>
          {max > 0 ? (
            <Meter pct={teams.length / max} h={3} className="mt-2" />
          ) : (
            <span className="rule mt-2 block h-0.75 w-full" />
          )}
        </div>

        {/* ---- ตราทีมที่สมัครแล้ว ---- */}
        {teams.length > 0 && (
          <div className="mt-4 flex items-center">
            <div className="flex -space-x-2">
              {teams.slice(0, 5).map((team, i) => (
                <span
                  key={team.id}
                  title={team.name}
                  className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-ink ring-2 ring-ink"
                >
                  {team.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(team.logo) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Crest identity={identityFor(i)} size={24} />
                  )}
                </span>
              ))}
            </div>
            {rest > 0 && <span className="num ml-2.5 text-xs text-muted">+{rest}</span>}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-hair pt-4 text-sm">
          <div className="min-w-0">
            <dt className="slug slug-2">วันแข่ง</dt>
            <dd className="num mt-1 truncate text-ice/85">
              {formatThaiDay(tournament.startAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="slug slug-2">เงินรางวัล</dt>
            <dd className="num mt-1 truncate font-display text-iris">
              {tournament.prize.total > 0
                ? formatMoney(tournament.prize.total, tournament.prize.currency)
                : "—"}
            </dd>
          </div>
          {top && tournament.prize.total > 0 && (
            <div className="col-span-2 min-w-0">
              <dt className="slug slug-2">{top.slot.label}</dt>
              <dd className="num mt-1 font-display text-iris">
                {formatMoney(top.amount, tournament.prize.currency)}
              </dd>
            </div>
          )}
        </dl>

        {actions && <div className="mt-auto pt-5">{actions}</div>}
      </div>
    </Panel>
  );

  if (preview) return card;

  return (
    <TiltCard max={4} className="h-full">
      {card}
    </TiltCard>
  );
}

/** ห่อด้วยลิงก์เฉพาะตอนมีปลายทาง — โหมดพรีวิวในฟอร์มยังไม่มี id ให้ไป */
function Wrap({
  href,
  className = "",
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
