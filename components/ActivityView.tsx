"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ACTIVITY_META,
  activityStore,
  type ActivityEntry,
  type ActivityType,
} from "@/lib/activity";
import { formatThaiDate, formatThaiDay } from "@/lib/tournament/share";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import ConfirmDialog from "./ui/ConfirmDialog";
import { toast } from "./ui/Toast";
import { PageHeading } from "./ui/Reveal";
import { ArtCalendar, Badge, EmptyState } from "./tournament/ui";

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
  const [askClear, setAskClear] = useState(false);

  const filtered = useMemo(
    () =>
      group === "all"
        ? entries
        : entries.filter((e) =>
            GROUPS.find((g) => g.key === group)?.types.includes(e.type),
          ),
    [entries, group],
  );

  // จัดกลุ่มตามวัน — entries เรียงใหม่สุดก่อนอยู่แล้ว ลำดับ Map จึงถูกต้องตามนั้น
  const days = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of filtered) {
      const key = formatThaiDay(e.at);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }));
  }, [filtered]);

  const countOf = (key: string) =>
    key === "all"
      ? entries.length
      : entries.filter((e) => GROUPS.find((g) => g.key === key)?.types.includes(e.type))
          .length;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Activity log"
        title="ประวัติการทำงาน"
        description="ทุกอย่างที่เกิดขึ้นในเครื่องนี้ — ใครกดอะไร เมื่อไหร่ ย้อนดูได้"
        meta={entries.length > 0 ? `${entries.length} รายการ` : undefined}
        action={
          entries.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setAskClear(true)}>
              ล้างประวัติ
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-1 rounded-xl tile p-1">
        {[{ key: "all", label: "ทั้งหมด" }, ...GROUPS].map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.key)}
            className={`relative min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors duration-300 sm:text-sm ${
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
            <span className="relative z-10">
              {g.label}
              <span className="num ml-1 opacity-70">({countOf(g.key)})</span>
            </span>
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <EmptyState
          no="07"
          art={<ArtCalendar />}
          title={
            entries.length === 0 ? "ยังไม่มีกิจกรรม" : "หมวดนี้ยังไม่มีอะไรเกิดขึ้น"
          }
          description={
            entries.length === 0
              ? "ลองสร้างทัวร์ สุ่มแบ่งทีม หรือหมุนวงล้อดู แล้วทุกการกดจะถูกจดไว้ที่นี่"
              : "ลองเลือกหมวดอื่น หรือกลับไปดูทั้งหมด"
          }
        />
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.label}>
              {/* หัววันแบบ chip เกาะขอบบน — ภาษาเดียวกับไทม์ไลน์ตารางแข่ง */}
              <div className="sticky top-2 z-10 mb-3 flex">
                <span className="surface hairline-top num inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs text-ice shadow-lift-1">
                  <span className="slug slug-2">วัน</span>
                  {day.label}
                  <span className="num text-muted">· {day.items.length}</span>
                </span>
              </div>

              <Panel className="px-5 py-4">
                <div className="relative">
                  {/* รางไทม์ไลน์ชิดซ้าย ภาษาเดียวกับตารางแข่ง — ซ่อนบนจอแคบเพราะเบียดเนื้อหา */}
                  <span
                    aria-hidden
                    className="rule-v absolute top-4 bottom-4 left-1.75 hidden sm:block"
                  />

                  <ul className="relative">
                    <AnimatePresence initial={false}>
                      {day.items.map((entry) => {
                        const meta = ACTIVITY_META[entry.type];
                        return (
                          <motion.li
                            key={entry.id}
                            layout
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-start gap-3.5 py-2.5 sm:pl-8"
                          >
                            <span
                              className="relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs"
                              style={{
                                color: `rgb(${meta.rgb})`,
                                background: `rgb(${meta.rgb} / 0.12)`,
                                boxShadow: `inset 0 0 0 1px rgb(${meta.rgb} / 0.3)`,
                              }}
                              aria-hidden
                            >
                              {meta.glyph}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Badge rgb={meta.rgb}>{meta.label}</Badge>
                                <p className="min-w-0 text-sm text-ice">
                                  {entry.message}
                                </p>
                              </div>
                              <p className="num mt-1 text-xs text-muted">
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
                </div>
              </Panel>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        หมายเหตุ: ประวัตินี้เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น
        ถ้าจัดงานหลายคนแล้วอยากเห็น log ร่วมกัน ต้องย้ายขึ้นคลาวด์
      </p>

      <ConfirmDialog
        open={askClear}
        title="ล้างประวัติทั้งหมด?"
        description="รายการทั้งหมดในเครื่องนี้จะหายถาวร กู้คืนไม่ได้"
        confirmText="ล้างทิ้ง"
        tone="danger"
        onClose={() => setAskClear(false)}
        onConfirm={() => {
          activityStore.clear();
          setAskClear(false);
          toast("ล้างประวัติแล้ว", "success");
        }}
      />
    </div>
  );
}
