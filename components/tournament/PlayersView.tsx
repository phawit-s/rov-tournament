"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { buildPlayerRecords, winRate } from "@/lib/tournament/players";
import { tournamentStore } from "@/lib/tournament/store";
import Panel from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { EmptyNote, Input, StatusBadge } from "./ui";

export default function PlayersView() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const records = useMemo(() => buildPlayerRecords(all), [all]);
  const filtered = records.filter((r) =>
    r.name.toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th")),
  );
  const active = records.find((r) => r.name === selected) ?? null;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Players"
        title="ผู้เล่นและประวัติการแข่ง"
        description="รวบจากทุกทัวร์ที่เก็บไว้ในเครื่องนี้ · ใช้ชื่อเป็นตัวระบุตัวตน"
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
        <EmptyNote>
          ยังไม่มีข้อมูลผู้เล่น — ไปสร้างทัวร์แล้วใส่รายชื่อทีมก่อนที่{" "}
          <Link
            href="/tournaments/"
            className="text-champagne underline-offset-2 hover:underline"
          >
            หน้าทัวร์นาเมนต์
          </Link>
        </EmptyNote>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)]">
          <Panel className="overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_repeat(4,minmax(52px,auto))] gap-3 border-b border-hair px-5 py-3 font-display text-[10px] tracking-luxe text-muted uppercase">
              <span>ผู้เล่น</span>
              <span className="text-right">ทัวร์</span>
              <span className="text-right">แมตช์</span>
              <span className="text-right">ชนะ</span>
              <span className="text-right">แชมป์</span>
            </div>

            <ul className="divide-y divide-[rgb(var(--hair)/var(--hair-a))]">
              {filtered.map((rec) => (
                <li key={rec.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(rec.name)}
                    className={`grid w-full cursor-pointer grid-cols-[1fr_repeat(4,minmax(52px,auto))] items-center gap-3 px-5 py-3 text-left transition-colors ${
                      selected === rec.name ? "bg-champagne/8" : "hover-tile"
                    }`}
                  >
                    <span className="min-w-0 truncate text-sm text-ice">
                      {rec.name}
                    </span>
                    <span className="text-right text-sm text-muted tabular-nums">
                      {rec.tournaments.length}
                    </span>
                    <span className="text-right text-sm text-muted tabular-nums">
                      {rec.matchesPlayed}
                    </span>
                    <span className="text-right text-sm text-ice tabular-nums">
                      {rec.matchesWon}
                    </span>
                    <span className="text-right font-display text-sm text-champagne tabular-nums">
                      {rec.titles || "–"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted">
                ไม่พบชื่อนี้
              </p>
            )}
          </Panel>

          <div>
            {active ? (
              <motion.div
                key={active.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Panel className="p-6">
                  <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
                    Profile
                  </p>
                  <h3 className="mt-1.5 font-display text-2xl font-medium text-ice">
                    {active.name}
                  </h3>

                  <div className="mt-5 grid grid-cols-3 gap-4">
                    <Metric label="อัตราชนะ" value={`${winRate(active)}%`} accent />
                    <Metric
                      label="แมตช์"
                      value={`${active.matchesWon}/${active.matchesPlayed}`}
                    />
                    <Metric
                      label="เกม"
                      value={`${active.gamesWon}–${active.gamesLost}`}
                    />
                  </div>

                  <h4 className="mt-7 mb-3 font-display text-sm text-ice">
                    ทัวร์ที่ลงแข่ง
                  </h4>
                  <ul className="space-y-2.5">
                    {active.tournaments.map((row, i) => (
                      <li
                        key={`${row.tournamentId}-${i}`}
                        className="rounded-xl tile px-4 py-3"
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
                        <p className="mt-1.5 text-xs text-muted">
                          ทีม {row.teamName}
                          {row.placement && (
                            <span className="text-champagne">
                              {" "}
                              · อันดับ {row.placement}
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </motion.div>
            ) : (
              <EmptyNote>เลือกชื่อทางซ้ายเพื่อดูประวัติ</EmptyNote>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl tile px-3 py-3 text-center">
      <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 font-display text-lg ${accent ? "text-champagne" : "text-ice"}`}
      >
        {value}
      </p>
    </div>
  );
}
