"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { buildPlayerRecords, winRate } from "@/lib/tournament/players";
import { tournamentStore } from "@/lib/tournament/store";
import type { PlayerRecord } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { CapacityRing, Meter } from "../ui/hud";
import { ArtShield, EmptyState, Input, StatusBadge } from "./ui";

const MEDAL_INK: Record<number, string> = {
  1: "var(--color-champagne)",
  2: "var(--color-platinum)",
  3: "#c98c5a",
};

/** เหรียญเส้นบางสำหรับสามอันดับแรก */
function Medal({ place, className = "h-4 w-4" }: { place: number; className?: string }) {
  const c = MEDAL_INK[place] ?? "var(--color-muted)";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7.6 2.4l3 6.1M16.4 2.4l-3 6.1" />
      <circle cx="12" cy="15.2" r="6" />
      <path d="M12 11.7l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" />
    </svg>
  );
}

/** ตัวย่อชื่อในวงกลม — ให้ทุกคนมีหน้าตาประจำตัวโดยไม่ต้องมีรูป */
function Monogram({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <span
      className="sunken grid shrink-0 place-items-center rounded-full font-display text-champagne ring-1 ring-[rgb(var(--accent)/0.3)]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function PlayersView() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const records = useMemo(() => buildPlayerRecords(all), [all]);
  // อันดับยึดจากลำดับรวมเสมอ ไม่ใช่ลำดับหลังกรอง ไม่งั้นค้นหาแล้วอันดับเพี้ยน
  const rankOf = useMemo(
    () => new Map(records.map((r, i) => [r.name, i + 1])),
    [records],
  );
  const filtered = records.filter((r) =>
    r.name.toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th")),
  );
  const active = records.find((r) => r.name === selected) ?? null;
  const podium = records.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Players"
        title="ผู้เล่นและประวัติการแข่ง"
        description="รวบจากทุกทัวร์ที่เก็บไว้ในเครื่องนี้ · ใช้ชื่อเป็นตัวระบุตัวตน"
        meta={records.length > 0 ? `${records.length} ชื่อ` : undefined}
        action={
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อผู้เล่น"
            className="w-56"
          />
        }
      />

      {records.length === 0 ? (
        <EmptyState
          no="04"
          art={<ArtShield />}
          title="ยังไม่มีข้อมูลผู้เล่น"
          description={
            <>
              สถิติจะขึ้นเองเมื่อมีรายชื่อผู้เล่นในทีมและมีการกรอกผลแมตช์ — เริ่มที่{" "}
              <Link
                href="/tournaments/"
                className="text-champagne underline-offset-2 hover:underline"
              >
                หน้าทัวร์นาเมนต์
              </Link>
            </>
          }
        />
      ) : (
        <>
          {/* ---------- สามอันดับแรก ---------- */}
          {podium.length === 3 && (
            <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
              {[1, 0, 2].map((i) => (
                <PodiumCard
                  key={podium[i].name}
                  rec={podium[i]}
                  place={i + 1}
                  onSelect={() => setSelected(podium[i].name)}
                  active={selected === podium[i].name}
                />
              ))}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)]">
            {/* ---------- ตาราง ---------- */}
            <Panel className="overflow-hidden p-0">
              <div className="slug grid grid-cols-[2.25rem_minmax(0,1fr)_6rem_2.75rem] items-center gap-3 border-b border-hair px-4 py-3 sm:grid-cols-[2.25rem_minmax(0,1fr)_3rem_3rem_7rem_2.75rem] sm:px-5">
                <span>#</span>
                <span>ผู้เล่น</span>
                <span className="hidden text-right sm:block">ทัวร์</span>
                <span className="hidden text-right sm:block">แมตช์</span>
                <span>ชนะ</span>
                <span className="text-right">แชมป์</span>
              </div>

              <ul className="divide-y divide-[rgb(var(--hair)/var(--hair-a))]">
                {filtered.map((rec) => {
                  const place = rankOf.get(rec.name) ?? 0;
                  const wr = winRate(rec);
                  return (
                    <li key={rec.name}>
                      <button
                        type="button"
                        onClick={() => setSelected(rec.name)}
                        aria-pressed={selected === rec.name}
                        className={`grid w-full cursor-pointer grid-cols-[2.25rem_minmax(0,1fr)_6rem_2.75rem] items-center gap-3 px-4 py-3 text-left transition-colors sm:grid-cols-[2.25rem_minmax(0,1fr)_3rem_3rem_7rem_2.75rem] sm:px-5 ${
                          selected === rec.name ? "bg-champagne/8" : "hover-tile"
                        }`}
                      >
                        <span className="flex items-center justify-center">
                          {place <= 3 ? (
                            <Medal place={place} className="h-4.5 w-4.5" />
                          ) : (
                            <span className="num text-xs text-muted">{place}</span>
                          )}
                        </span>

                        <span className="min-w-0 truncate text-sm text-ice">
                          {rec.name}
                        </span>

                        <span className="num hidden text-right text-sm text-muted sm:block">
                          {rec.tournaments.length}
                        </span>
                        <span className="num hidden text-right text-sm text-muted sm:block">
                          {rec.matchesPlayed}
                        </span>

                        {/* แถบยาวเท่าอัตราชนะ ทำให้เทียบกันได้ทั้งคอลัมน์ในแวบเดียว */}
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <Meter pct={wr / 100} h={4} />
                          </span>
                          <span className="num w-9 shrink-0 text-right text-xs text-ice/80">
                            {rec.matchesPlayed ? `${wr}%` : "–"}
                          </span>
                        </span>

                        <span className="num text-right font-display text-sm text-champagne">
                          {rec.titles || "–"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {filtered.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-muted">
                  ไม่พบชื่อ &ldquo;{query.trim()}&rdquo;
                </p>
              )}
            </Panel>

            {/* ---------- การ์ดโปรไฟล์ ---------- */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              {active ? (
                <motion.div
                  key={active.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <ProfileCard rec={active} place={rankOf.get(active.name) ?? 0} />
                </motion.div>
              ) : (
                <EmptyState
                  title="เลือกชื่อทางซ้าย"
                  description="กดที่ชื่อผู้เล่นเพื่อดูอัตราชนะ สถิติเกม และทัวร์ที่เคยลงแข่ง"
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ใบชูโรงสามอันดับแรก ใบกลาง (ที่ 1) สูงกว่าและมีวงแหวนทอง */
function PodiumCard({
  rec,
  place,
  onSelect,
  active,
}: {
  rec: PlayerRecord;
  place: number;
  onSelect: () => void;
  active: boolean;
}) {
  const first = place === 1;
  return (
    <button type="button" onClick={onSelect} className="w-full cursor-pointer text-left">
      <Panel
        variant={first ? "feature" : "plain"}
        state={first ? "win" : undefined}
        interactive={false}
        className={`flex flex-col items-center px-3 text-center transition-transform duration-300 hover:-translate-y-0.5 ${
          first ? "py-6" : "py-4"
        } ${active ? "ring-1 ring-[rgb(var(--accent)/0.45)]" : ""}`}
      >
        <span className="relative">
          <Monogram name={rec.name} size={first ? 56 : 44} />
          {first && (
            <span className="animate-halo pointer-events-none absolute -inset-1 rounded-full" />
          )}
        </span>

        <Medal place={place} className={first ? "mt-2.5 h-6 w-6" : "mt-2 h-5 w-5"} />

        <p
          className={`mt-1.5 w-full truncate font-display ${
            first ? "text-base text-ice" : "text-sm text-ice/85"
          }`}
          title={rec.name}
        >
          {rec.name}
        </p>
        <p className="num mt-1 text-xs text-muted">
          {rec.titles > 0 ? `${rec.titles} แชมป์` : `ชนะ ${rec.matchesWon} แมตช์`}
        </p>
      </Panel>
    </button>
  );
}

function ProfileCard({ rec, place }: { rec: PlayerRecord; place: number }) {
  const wr = winRate(rec);
  const games = rec.gamesWon + rec.gamesLost;
  const wonPct = games ? (rec.gamesWon / games) * 100 : 0;

  return (
    <Panel className="p-6">
      <div className="flex items-center gap-4">
        <Monogram name={rec.name} size={52} />
        <div className="min-w-0">
          <p className="slug">Profile</p>
          <h3 className="mt-1 truncate font-display text-2xl font-medium text-ice">
            {rec.name}
          </h3>
        </div>
        {place > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {place <= 3 && <Medal place={place} className="h-5 w-5" />}
            <span className="num font-display text-sm text-muted">อันดับ {place}</span>
          </span>
        )}
      </div>

      <span className="rule mt-5 mb-5 block h-px" />

      <div className="grid grid-cols-3 items-start gap-4">
        {/* อัตราชนะเป็นวงแหวน อ่านสัดส่วนได้โดยไม่ต้องอ่านเลข */}
        <div className="flex flex-col items-center gap-2 text-center">
          <CapacityRing value={wr} max={100} size={64} />
          <p className="slug slug-2">อัตราชนะ %</p>
        </div>

        <div className="text-center">
          <p className="num font-display text-2xl text-ice">
            {rec.matchesWon}
            <span className="text-base text-muted">/{rec.matchesPlayed}</span>
          </p>
          <p className="slug slug-2 mt-1.5">แมตช์ที่ชนะ</p>
          <Meter
            pct={rec.matchesPlayed ? rec.matchesWon / rec.matchesPlayed : 0}
            h={3}
            className="mt-2.5"
          />
        </div>

        {/* เกมเป็นแถบคู่ชนะ-แพ้ เห็นน้ำหนักจริงแทนข้อความ x–y */}
        <div className="text-center">
          <p className="num font-display text-2xl text-ice">{games}</p>
          <p className="slug slug-2 mt-1.5">เกมทั้งหมด</p>
          <span className="rule mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full">
            <span
              className="block h-full"
              style={{ width: `${wonPct}%`, background: "rgb(var(--st-win))" }}
            />
            <span
              className="block h-full flex-1"
              style={{ background: "rgb(var(--st-out) / 0.55)" }}
            />
          </span>
          <p className="num mt-1.5 text-xs">
            <span style={{ color: "rgb(var(--st-win))" }}>{rec.gamesWon}</span>
            <span className="text-muted"> · {rec.gamesLost}</span>
          </p>
        </div>
      </div>

      <h4 className="slug mt-7 mb-3">ทัวร์ที่ลงแข่ง ({rec.tournaments.length})</h4>
      <ul className="space-y-2.5">
        {rec.tournaments.map((row, i) => (
          <li
            key={`${row.tournamentId}-${i}`}
            className="tile relative overflow-hidden rounded-xl px-4 py-3"
            style={
              row.placement === 1
                ? { boxShadow: "inset 0 0 0 1px rgb(var(--accent) / 0.3)" }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/tournament/#t=${row.tournamentId}`}
                className="min-w-0 truncate text-sm text-ice transition-colors hover:text-champagne"
              >
                {row.tournamentName}
              </Link>
              <StatusBadge status={row.status} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              ทีม {row.teamName}
              {row.placement && (
                <>
                  {row.placement <= 3 && (
                    <Medal place={row.placement} className="h-3.5 w-3.5" />
                  )}
                  <span className="num text-champagne">อันดับ {row.placement}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
