"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ACTIVITY_META,
  activityStore,
  type ActivityEntry,
  type ActivityType,
} from "@/lib/activity";
import { AUDIT_META, watchAudit, type AuditEntry } from "@/lib/audit";
import { useIsAdmin } from "@/hooks/useAdmin";
import { formatThaiDate, formatThaiDay } from "@/lib/tournament/share";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import ConfirmDialog from "./ui/ConfirmDialog";
import { toast } from "./ui/Toast";
import { PageHeading } from "./ui/Reveal";
import { ArtCalendar, Badge, EmptyState, Skeleton } from "./tournament/ui";

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

/** สีเทากลางๆ ไว้ใช้ตอนเจอ kind ที่ยังไม่รู้จัก (ของเก่าหรือของใหม่กว่าโค้ดนี้) */
const FALLBACK_RGB = "146 151 172";

type Source = "local" | "cloud";
type CloudState = { status: "loading" | "ok" | "denied"; items: AuditEntry[] };

/** จับรายการเข้ากลุ่มตามวัน — ทั้งสองแหล่งเรียงใหม่สุดก่อนอยู่แล้ว ลำดับ Map จึงถูกตามนั้น */
function groupByDay<T extends { at: string }>(list: T[]) {
  const map = new Map<string, T[]>();
  for (const e of list) {
    const key = formatThaiDay(e.at);
    const bucket = map.get(key);
    if (bucket) bucket.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }));
}

export default function ActivityView() {
  const entries = useSyncExternalStore(
    activityStore.subscribe,
    activityStore.getSnapshot,
    activityStore.getServerSnapshot,
  );
  const isAdmin = useIsAdmin();
  const reduce = useReducedMotion();
  const [source, setSource] = useState<Source>("local");
  const [group, setGroup] = useState<string>("all");
  const [askClear, setAskClear] = useState(false);
  /**
   * ประวัติฝั่งคลาวด์ — เริ่มที่ loading แล้วให้ callback ของ onSnapshot เป็นคนเปลี่ยนสถานะ
   * ไม่มีการ setState ตอน effect ทำงาน (กฎ react-hooks/set-state-in-effect)
   */
  const [cloud, setCloud] = useState<CloudState>({
    status: "loading",
    items: [],
  });

  // ต่อคลาวด์เฉพาะตอนเปิดแท็บนั้นจริงๆ จะได้ไม่กิน quota ตอนดูประวัติเครื่องตัวเอง
  useEffect(() => {
    if (!isAdmin || source !== "cloud") return;
    return watchAudit((list) => setCloud({ status: "ok", items: list }), {
      max: 200,
      onError: () => setCloud({ status: "denied", items: [] }),
    });
  }, [isAdmin, source]);

  const filtered = useMemo(
    () =>
      group === "all"
        ? entries
        : entries.filter((e) =>
            GROUPS.find((g) => g.key === group)?.types.includes(e.type),
          ),
    [entries, group],
  );

  const days = useMemo(() => groupByDay(filtered), [filtered]);
  const cloudDays = useMemo(() => groupByDay(cloud.items), [cloud.items]);

  const countOf = (key: string) =>
    key === "all"
      ? entries.length
      : entries.filter((e) => GROUPS.find((g) => g.key === key)?.types.includes(e.type))
          .length;

  const onCloud = source === "cloud" && isAdmin;
  // ปิดอนิเมชันเลื่อนเข้าเมื่อผู้ใช้ขอลดการเคลื่อนไหว
  const row = reduce
    ? {}
    : {
        initial: { opacity: 0, x: -12 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0 },
      };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Activity log"
        title="ประวัติการทำงาน"
        description={
          onCloud
            ? "ประวัติกลางบนคลาวด์ — ผู้ดูแลทุกคนเห็นชุดเดียวกันว่าใครเผยแพร่หรืออนุมัติอะไรไป"
            : "ทุกอย่างที่เกิดขึ้นในเครื่องนี้ — ใครกดอะไร เมื่อไหร่ ย้อนดูได้"
        }
        meta={
          onCloud
            ? cloud.status === "ok"
              ? `${cloud.items.length} รายการ`
              : undefined
            : entries.length > 0
              ? `${entries.length} รายการ`
              : undefined
        }
        action={
          !onCloud && entries.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setAskClear(true)}>
              ล้างประวัติ
            </Button>
          ) : undefined
        }
      />

      {/* สลับแหล่งข้อมูล — โชว์เฉพาะผู้ดูแล คนทั่วไปมีแค่ประวัติในเครื่องตัวเอง */}
      {isAdmin && (
        <div className="flex flex-wrap gap-1 rounded-xl tile p-1">
          {(
            [
              { key: "local", label: "เครื่องนี้" },
              { key: "cloud", label: "คลาวด์" },
            ] as { key: Source; label: string }[]
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              className={`relative min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors duration-300 sm:text-sm ${
                source === s.key ? "text-[#1b1509]" : "text-muted hover:text-ice"
              }`}
            >
              {source === s.key && (
                <motion.span
                  layoutId="activity-source"
                  className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
              <span className="relative z-10">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* แท็บกรองใช้ได้กับประวัติในเครื่องเท่านั้น — ฝั่งคลาวด์คนละชนิดเหตุการณ์ */}
      {!onCloud && (
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
      )}

      {onCloud ? (
        cloud.status === "loading" ? (
          <Panel className="space-y-3 px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </Panel>
        ) : cloud.status === "denied" ? (
          <EmptyState
            no="07"
            art={<ArtCalendar />}
            title="อ่านประวัติบนคลาวด์ไม่ได้"
            description="บัญชีที่ล็อกอินอยู่ยังไม่มีสิทธิ์ผู้ดูแลบนคลาวด์ ลองล็อกอินด้วยบัญชีผู้ดูแล แล้วเปิดแท็บนี้ใหม่"
          />
        ) : cloudDays.length === 0 ? (
          <EmptyState
            no="07"
            art={<ArtCalendar />}
            title="ยังไม่มีประวัติบนคลาวด์"
            description="พอมีคนเผยแพร่ทัวร์ อนุมัติสลิป หรือเพิ่มผู้ดูแล รายการจะขึ้นที่นี่ให้ทุกคนเห็นตรงกัน"
          />
        ) : (
          <div className="space-y-6">
            {cloudDays.map((day) => (
              <DaySection key={day.label} label={day.label} count={day.items.length}>
                <AnimatePresence initial={false}>
                  {day.items.map((entry) => {
                    const meta = AUDIT_META[entry.kind];
                    const rgb = meta?.rgb ?? FALLBACK_RGB;
                    return (
                      <motion.li
                        key={entry.id}
                        layout={!reduce}
                        {...row}
                        className="flex items-start gap-3.5 py-2.5 sm:pl-8"
                      >
                        <span
                          className="relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
                          style={{
                            background: `rgb(${rgb} / 0.12)`,
                            boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.3)`,
                          }}
                          aria-hidden
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: `rgb(${rgb})` }}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge rgb={rgb}>{meta?.label ?? entry.kind}</Badge>
                            <p className="min-w-0 text-sm text-ice">
                              {entry.targetName || entry.targetId || "—"}
                            </p>
                          </div>
                          <p className="num mt-1 text-xs text-muted">
                            {formatThaiDate(entry.at)}
                            {entry.actorName && ` · ${entry.actorName}`}
                            {entry.detail && ` · ${entry.detail}`}
                          </p>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </DaySection>
            ))}
          </div>
        )
      ) : days.length === 0 ? (
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
            <DaySection key={day.label} label={day.label} count={day.items.length}>
              <AnimatePresence initial={false}>
                {day.items.map((entry: ActivityEntry) => {
                  const meta = ACTIVITY_META[entry.type];
                  return (
                    <motion.li
                      key={entry.id}
                      layout={!reduce}
                      {...row}
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
                          <p className="min-w-0 text-sm text-ice">{entry.message}</p>
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
            </DaySection>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        {onCloud
          ? "หมายเหตุ: ประวัติบนคลาวด์แก้หรือลบย้อนหลังไม่ได้ กติกาฝั่งเซิร์ฟเวอร์ปิดการแก้และการลบไว้ทั้งหมด บันทึกแล้วบันทึกเลย"
          : "หมายเหตุ: ประวัตินี้เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ถ้าจัดงานหลายคนแล้วอยากเห็น log ร่วมกัน ให้ดูแท็บคลาวด์"}
      </p>

      <ConfirmDialog
        open={askClear}
        title="ล้างประวัติทั้งหมด?"
        description="รายการทั้งหมดในเครื่องนี้จะหายถาวร กู้คืนไม่ได้ (ประวัติบนคลาวด์ไม่เกี่ยว ลบไม่ได้อยู่แล้ว)"
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

/** หัววันแบบ chip เกาะขอบบน + รางไทม์ไลน์ — ใช้ร่วมกันทั้งแท็บเครื่องนี้และแท็บคลาวด์ */
function DaySection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="sticky top-2 z-10 mb-3 flex">
        <span className="surface hairline-top num inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs text-ice shadow-lift-1">
          <span className="slug slug-2">วัน</span>
          {label}
          <span className="num text-muted">· {count}</span>
        </span>
      </div>

      <Panel className="px-5 py-4">
        <div className="relative">
          {/* รางไทม์ไลน์ชิดซ้าย ภาษาเดียวกับตารางแข่ง — ซ่อนบนจอแคบเพราะเบียดเนื้อหา */}
          <span
            aria-hidden
            className="rule-v absolute top-4 bottom-4 left-1.75 hidden sm:block"
          />
          <ul className="relative">{children}</ul>
        </div>
      </Panel>
    </section>
  );
}
