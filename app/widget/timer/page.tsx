"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLiveTournament, useWidgetOptions } from "@/hooks/useLiveTournament";
import { upcomingMatches } from "@/lib/tournament/bracket";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;

/**
 * นับถอยหลัง — ใช้ได้ 3 แบบ
 *   ?until=2026-08-03T20:00:00+07:00  นับถึงเวลาที่กำหนด
 *   ?mins=5                            นับถอยหลังจากตอนเปิดหน้า (พักเบรก)
 *   #c=<id>                            นับถึงแมตช์ถัดไปที่ตั้งเวลาไว้
 */
export default function TimerWidget() {
  const { tournament } = useLiveTournament();
  const { accent, until, minutes, label } = useWidgetOptions();
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  const reduced = useReducedMotion();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  let targetMs: number | null = null;
  let caption = label ?? "เริ่มใน";

  if (until) {
    const parsed = new Date(until).getTime();
    if (!Number.isNaN(parsed)) targetMs = parsed;
  } else if (minutes > 0) {
    targetMs = startedAt + minutes * 60_000;
    caption = label ?? "พักเบรก";
  } else if (tournament?.bracket) {
    const next = upcomingMatches(tournament.bracket, 1)[0];
    if (next?.scheduledAt) {
      targetMs = new Date(next.scheduledAt).getTime();
      const nameOf = (id: string | null) =>
        id ? (tournament.teams.find((t) => t.id === id)?.name ?? "TBD") : "TBD";
      caption = label ?? `${nameOf(next.a.teamId)} พบ ${nameOf(next.b.teamId)}`;
    }
  }

  if (targetMs === null) {
    return (
      <WidgetShell>
        <WidgetHint title="ยังไม่ได้ตั้งเวลาเป้าหมาย">
          <p>เติมท้ายลิงก์อย่างใดอย่างหนึ่ง:</p>
          <ul className="num mt-2 space-y-1">
            <li>
              <code className="text-white/80">?until=2026-08-03T20:00:00+07:00</code>{" "}
              นับถึงเวลาที่กำหนด
            </li>
            <li>
              <code className="text-white/80">?mins=5</code> นับถอยหลังจากตอนเปิดหน้า
            </li>
            <li>
              <code className="text-white/80">#c=รหัสทัวร์</code>{" "}
              นับถึงแมตช์ถัดไปที่ตั้งเวลาไว้
            </li>
          </ul>
        </WidgetHint>
      </WidgetShell>
    );
  }

  const remain = Math.max(0, targetMs - now);
  const totalSec = Math.floor(remain / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const done = remain <= 0;
  const urgent = remain > 0 && remain < 60_000;

  // ความยาวเต็มของวงแหวนวัดจากตอนเปิดหน้าถึงเป้าหมาย (startedAt นิ่งตลอดอายุคอมโพเนนต์)
  // ทำให้วงแหวนเดินสม่ำเสมอโดยไม่ต้องเก็บค่าไว้ใน ref แล้วอ่านตอน render
  const total = Math.max(1000, targetMs - startedAt);
  const pct = Math.max(0, Math.min(1, remain / total));
  const ringColor = urgent ? "rgb(var(--st-live))" : accent;

  // ปลายเส้นวงแหวนคำนวณเป็นมุมจริง จะได้แปะจุดเรืองแสงไว้ตรงหัวได้
  const angle = -90 + pct * 360;
  const rad = (angle * Math.PI) / 180;
  const dotX = 100 + Math.cos(rad) * RING_R;
  const dotY = 100 + Math.sin(rad) * RING_R;

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="plate" className="w-110 px-7 py-5">
        <div className="flex items-center gap-5">
          <div className="relative grid h-50 w-50 shrink-0 place-items-center">
            {urgent && !reduced && (
              <span
                className="pointer-events-none absolute inset-6 animate-breathe rounded-full"
                style={{
                  background: "radial-gradient(circle, rgb(var(--st-live) / 0.45), transparent 70%)",
                  filter: "blur(10px)",
                }}
              />
            )}

            <svg
              viewBox="0 0 200 200"
              width={200}
              height={200}
              className="absolute -rotate-90"
              aria-hidden
            >
              <circle
                cx="100"
                cy="100"
                r={RING_R}
                fill="none"
                stroke="rgb(255 255 255 / 0.08)"
                strokeWidth="6"
              />
              <circle
                cx="100"
                cy="100"
                r={RING_R}
                fill="none"
                stroke={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${RING_C * pct} ${RING_C}`}
                style={{ transition: "stroke-dasharray 0.25s linear" }}
              />
              {pct > 0.01 && (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r="5"
                  fill={ringColor}
                  style={{ filter: `drop-shadow(0 0 8px ${urgent ? "#e0566b" : accent})` }}
                />
              )}
            </svg>

            {/* ตัวเลขอยู่ในวงแหวน วงแหวนคือเวลาที่เหลือ ตัวเลขคือเวลาที่แน่นอน */}
            <div className="relative flex flex-col items-center">
              <div className="flex items-center gap-1.5">
                <DigitGroup
                  value={hh > 0 ? pad(hh) : pad(mm)}
                  urgent={urgent}
                  reduced={!!reduced}
                />
                <Colon />
                <DigitGroup
                  value={hh > 0 ? pad(mm) : pad(ss)}
                  urgent={urgent}
                  reduced={!!reduced}
                  pulse={urgent && totalSec <= 3 ? totalSec : null}
                />
              </div>
              <p className="slug slug-2 mt-2 text-[9px]">
                {hh > 0 ? "ชั่วโมง · นาที" : "นาที · วินาที"}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="slug" style={urgent ? { color: "rgb(var(--st-live))" } : undefined}>
              {done ? "เริ่มแล้ว" : urgent ? "ใกล้เริ่ม" : "เหลืออีก"}
            </p>
            <p className="mt-2 font-display text-lg leading-snug text-white/85">{caption}</p>
            <span className="rule mt-3 block h-px" />
            <p className="num mt-3 text-xs text-white/45">
              {done ? "หมดเวลาแล้ว" : `เหลือ ${totalSec.toLocaleString("th-TH")} วินาที`}
            </p>
          </div>
        </div>
      </WidgetCard>
    </WidgetShell>
  );
}

/** ช่องตัวเลขสองหลัก แต่ละหลักเลื่อนขึ้นตอนเปลี่ยนค่า ใช้จังหวะเดียวกับสกอร์บอร์ด */
function DigitGroup({
  value,
  urgent,
  reduced,
  pulse = null,
}: {
  value: string;
  urgent: boolean;
  reduced: boolean;
  /** วินาทีที่ต้องเต้นหนึ่งจังหวะ (3/2/1) — เปลี่ยนค่าแล้ว key ใหม่ จึงเล่นครั้งเดียวต่อวินาที */
  pulse?: number | null;
}) {
  const color = urgent ? "rgb(var(--st-live))" : "#fff";

  const box = (
    <div
      className="tile flex items-center gap-0.5 rounded-xl px-2 py-1.5"
      style={urgent ? { boxShadow: "inset 0 0 0 1px rgb(var(--st-live) / 0.45)" } : undefined}
    >
      {value.split("").map((d, i) => (
        <span key={i} className="relative grid h-10 w-5 place-items-center overflow-hidden">
          {reduced ? (
            <span className="fig num text-3xl" style={{ color }}>
              {d}
            </span>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={d}
                initial={{ y: -22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 22, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="fig num absolute text-3xl"
                style={{ color }}
              >
                {d}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      ))}
    </div>
  );

  if (pulse === null || reduced) return box;

  return (
    <motion.div key={`pulse-${pulse}`} initial={{ scale: 1.06 }} animate={{ scale: 1 }}>
      {box}
    </motion.div>
  );
}

function Colon() {
  return <span className="fig text-2xl text-white/30">:</span>;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
