"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ACTIVITY_META, activityStore, type ActivityType } from "@/lib/activity";
import { formatThaiDate } from "@/lib/tournament/share";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import { EmptyNote } from "./tournament/ui";

const GROUPS: { key: string; label: string; types: ActivityType[] }[] = [
  {
    key: "tournament",
    label: "ทัวร์นาเมนต์",
    types: [
      "tournament.create",
      "tournament.update",
      "tournament.delete",
      "tournament.publish",
      "bracket.generate",
      "match.score",
      "team.add",
      "team.remove",
    ],
  },
  {
    key: "support",
    label: "โดเนท / สมาชิก",
    types: [
      "donation.approve",
      "donation.reject",
      "member.approve",
      "registration.approve",
      "registration.reject",
    ],
  },
  {
    key: "tools",
    label: "เครื่องมือสุ่ม",
    types: ["draw.finish", "wheel.spin"],
  },
];

export default function ActivityView() {
  const entries = useSyncExternalStore(
    activityStore.subscribe,
    activityStore.getSnapshot,
    activityStore.getServerSnapshot,
  );
  const [group, setGroup] = useState<string>("all");

  const filtered =
    group === "all"
      ? entries
      : entries.filter((e) =>
          GROUPS.find((g) => g.key === group)?.types.includes(e.type),
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Activity log
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-medium text-ice sm:text-3xl">
            ประวัติการทำงาน
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            ทุกอย่างที่เกิดขึ้นในเครื่องนี้ — ใครกดอะไร เมื่อไหร่ ย้อนดูได้
          </p>
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("ล้างประวัติทั้งหมด?")) activityStore.clear();
            }}
          >
            ล้างประวัติ
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl tile p-1">
        {[{ key: "all", label: "ทั้งหมด" }, ...GROUPS].map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            className={`relative flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors duration-300 sm:text-sm ${
              group === g.key ? "text-[#1b1509]" : "text-muted hover:text-ice"
            }`}
          >
            {group === g.key && (
              <motion.span
                layoutId="activity-tab"
                className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              />
            )}
            <span className="relative z-10">{g.label}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyNote>ยังไม่มีกิจกรรม — ลองสร้างทัวร์หรือหมุนวงล้อดู</EmptyNote>
      ) : (
        <Panel className="overflow-hidden p-0">
          <ul className="divide-y divide-[rgb(var(--hair)/var(--hair-a))]">
            <AnimatePresence initial={false}>
              {filtered.map((entry) => {
                const meta = ACTIVITY_META[entry.type];
                return (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-4 px-5 py-3.5"
                  >
                    <span
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs"
                      style={{
                        color: `rgb(${meta.rgb})`,
                        background: `rgb(${meta.rgb} / 0.12)`,
                        boxShadow: `inset 0 0 0 1px rgb(${meta.rgb} / 0.3)`,
                      }}
                    >
                      {meta.glyph}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ice">
                        <span className="text-muted">{meta.label} · </span>
                        {entry.message}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatThaiDate(entry.at)}
                        {entry.actor && ` · ${entry.actor}`}
                        {entry.tournamentName && (
                          <>
                            {" · "}
                            {entry.tournamentId ? (
                              <Link
                                href={`/tournament/#t=${entry.tournamentId}`}
                                className="text-champagne underline-offset-2 hover:underline"
                              >
                                {entry.tournamentName}
                              </Link>
                            ) : (
                              entry.tournamentName
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Panel>
      )}

      <p className="text-xs text-muted">
        หมายเหตุ: ประวัตินี้เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น
        ถ้าจัดงานหลายคนแล้วอยากเห็น log ร่วมกัน ต้องย้ายขึ้นคลาวด์
      </p>
    </div>
  );
}
